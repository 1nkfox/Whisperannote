# FILE: backend/server.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: FastAPI application (lifespan, CORS, auth) exposing transcription/queue/models/health
#            endpoints and the progress WebSocket; wires pipeline + queue + model managers.
#   SCOPE: create_app, lifespan, QueueRequest, DownloadRequest, route handlers
#   DEPENDS: M-BACKEND-CONFIG, M-AUTH, M-QUEUE, M-PIPELINE, M-PROGRESS, M-MODELS, M-FFMPEG, M-SCHEMAS
#   LINKS: M-SERVER, V-M-SERVER
#   ROLE: ENTRY_POINT
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   create_app - application factory (config/runner/progress injectable for tests)
#   lifespan - load config, start queue, register CUDA DLL dirs, preload models (best-effort)
#   _default_runner - production runner wiring pipeline.run with lazily-loaded models
#   route handlers - /api/health, /api/models[/download], /api/transcribe, /api/queue[...], /ws
# END_MODULE_MAP
from __future__ import annotations

import os
import sys
import uuid
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket
from fastapi import WebSocketDisconnect
from pydantic import BaseModel, Field

from .auth import add_cors, require_token, ws_authorized
from .config import BackendConfig, load_config
from .logging_setup import get_logger, mark
from .models import AppError, AvailableModels, HealthStatus, TaskInfo, TranscribeJob
from .models_registry import DEFAULT_MODEL, download_model, list_models
from .pipeline import run as pipeline_run
from .utils import new_workdir
from .websocket_manager import ProgressManager

log = get_logger("server")


# ---- request bodies ----
class QueueRequest(BaseModel):
    file_path: str
    output_dir: str = ""
    model: str = DEFAULT_MODEL
    language: str = "ru"
    num_speakers: Optional[int] = None
    output_formats: list[str] = Field(default_factory=lambda: ["json", "txt", "srt"])
    speaker_names: dict[str, str] = Field(default_factory=dict)


class DownloadRequest(BaseModel):
    model: str = DEFAULT_MODEL


def _cors_origins() -> list[str]:
    extra = [o for o in (os.environ.get("CORS_ORIGINS") or "").split(",") if o.strip()]
    return ["app://.", "http://localhost:5173", "http://127.0.0.1:5173", *extra]


def _allowed_roots(cfg: BackendConfig) -> list[str]:
    # Uploaded files live in temp; batch files must be inside configured roots.
    return [*cfg.allowed_roots, cfg.temp_dir]


def _default_out_dir(cfg: BackendConfig, requested: str) -> str:
    return requested or os.path.join(cfg.temp_dir, "whisperannote_results")


def _register_cuda_dll_dirs() -> None:
    """On Windows, expose cuDNN/cuBLAS wheels' DLLs to CTranslate2 before it loads."""
    if not hasattr(os, "add_dll_directory"):  # non-Windows
        return
    # START_BLOCK_LIFESPAN_INIT
    for pkg in ("nvidia.cudnn", "nvidia.cublas"):
        try:
            mod = __import__(pkg, fromlist=["__file__"])
            bin_dir = os.path.join(os.path.dirname(mod.__file__), "bin")
            if os.path.isdir(bin_dir):
                os.add_dll_directory(bin_dir)
        except Exception:
            log.warning(mark("Server", "lifespan", "BLOCK_LIFESPAN_INIT", f"no DLL dir for {pkg}"))
    # END_BLOCK_LIFESPAN_INIT


def _default_runner(app: FastAPI, cfg: BackendConfig):
    """Build the production runner: lazily load models, then run the blocking pipeline."""
    from .diarize import Diarizer
    from .transcribe import Transcriber

    def runner(job, cancel_event, on_stage, on_progress):
        diar = app.state.diarizer
        if diar is None:
            diar = Diarizer(hf_token=cfg.hf_token)
            diar.load()
            app.state.diarizer = diar
        trans = app.state.transcriber
        if trans is None or trans.model_name != job.model:
            trans = Transcriber(model_name=job.model, cache_dir=cfg.model_cache_dir)
            trans.load()
            app.state.transcriber = trans
        return pipeline_run(
            job,
            diar,
            trans,
            allowed_roots=_allowed_roots(cfg),
            out_dir=_default_out_dir(cfg, job.output_dir),
            temp_base=cfg.temp_dir,
            cancel_event=cancel_event,
            on_stage=on_stage,
            on_progress=on_progress,
        )

    return runner


def create_app(
    config: Optional[BackendConfig] = None,
    runner: Any = None,
    progress: Optional[ProgressManager] = None,
    build_runner: Any = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        from .queue_manager import QueueManager

        cfg = config or load_config()
        app.state.config = cfg
        app.state.progress = progress or ProgressManager()
        app.state.diarizer = None
        app.state.transcriber = None
        _register_cuda_dll_dirs()

        if runner is not None:
            active_runner = runner
        elif build_runner is not None:
            active_runner = build_runner(app)
        else:
            active_runner = _default_runner(app, cfg)

        queue = QueueManager(runner=active_runner, progress=app.state.progress)
        app.state.queue = queue
        await queue.start()
        log.info(mark("Server", "lifespan", "BLOCK_LIFESPAN_INIT", f"started on {cfg.host}:{cfg.port}"))
        try:
            yield
        finally:
            await queue.stop()

    app = FastAPI(title="WhisperAnnote backend", version="2.0.0", lifespan=lifespan)
    add_cors(app, _cors_origins())

    api = APIRouter(prefix="/api", dependencies=[Depends(require_token)])

    @api.get("/health", response_model=HealthStatus)
    async def health(request: Request) -> HealthStatus:
        cfg: BackendConfig = request.app.state.config
        cuda_available, cuda_devices = False, 0
        try:
            import torch  # lazy; absent in CPU/test envs

            cuda_available = bool(torch.cuda.is_available())
            cuda_devices = torch.cuda.device_count() if cuda_available else 0
        except Exception:
            pass
        diar = request.app.state.diarizer
        trans = request.app.state.transcriber
        return HealthStatus(
            python_version=sys.version.split()[0],
            cuda_available=cuda_available,
            cuda_devices=cuda_devices,
            whisper_ready=bool(trans and trans.ready),
            pyannote_ready=bool(diar and diar.ready),
            models_cached=list_models(cfg.model_cache_dir).downloaded,
        )

    @api.get("/models", response_model=AvailableModels)
    async def models(request: Request) -> AvailableModels:
        return list_models(request.app.state.config.model_cache_dir)

    @api.post("/models/download")
    async def models_download(request: Request, body: DownloadRequest) -> dict:
        cfg: BackendConfig = request.app.state.config
        progress_mgr: ProgressManager = request.app.state.progress

        def cb(stage: str, pct: int) -> None:
            # progress is observable via the WS channel keyed by the model name
            import asyncio

            try:
                loop = asyncio.get_event_loop()
                loop.create_task(progress_mgr.progress(f"model:{body.model}", pct, stage))
            except Exception:
                pass

        try:
            download_model(body.model, cfg.model_cache_dir, cb)
        except AppError as e:
            raise HTTPException(status_code=502, detail=f"{e.code.value}: {e.message}")
        return {"status": "completed", "model": body.model}

    @api.post("/transcribe", response_model=TaskInfo)
    async def transcribe(
        request: Request,
        file: UploadFile = File(...),
        model: str = Form(DEFAULT_MODEL),
        language: str = Form("ru"),
        num_speakers: Optional[int] = Form(None),
    ) -> TaskInfo:
        cfg: BackendConfig = request.app.state.config
        work = new_workdir(cfg.temp_dir)
        dest = os.path.join(work, os.path.basename(file.filename or "upload.bin"))
        with open(dest, "wb") as f:
            f.write(await file.read())
        job = TranscribeJob(
            task_id=str(uuid.uuid4()),
            file_path=dest,
            model=model,
            language=language,
            num_speakers=num_speakers,
        )
        return request.app.state.queue.enqueue(job)

    @api.post("/queue", response_model=TaskInfo)
    async def queue_add(request: Request, body: QueueRequest) -> TaskInfo:
        job = TranscribeJob(task_id=str(uuid.uuid4()), **body.model_dump())
        return request.app.state.queue.enqueue(job)

    @api.get("/queue/status", response_model=list[TaskInfo])
    async def queue_status(request: Request) -> list[TaskInfo]:
        return request.app.state.queue.status()

    @api.delete("/queue/{task_id}")
    async def queue_cancel(request: Request, task_id: str) -> dict:
        ok = request.app.state.queue.cancel(task_id)
        if not ok:
            raise HTTPException(status_code=404, detail="task not found or not cancellable")
        return {"status": "cancelled", "task_id": task_id}

    app.include_router(api)

    @app.websocket("/ws/progress/{task_id}")
    async def ws_progress(websocket: WebSocket, task_id: str) -> None:
        secret = websocket.app.state.config.secret_token
        if not await ws_authorized(websocket, secret):
            await websocket.close(code=1008)
            return
        progress_mgr: ProgressManager = websocket.app.state.progress
        await progress_mgr.connect(task_id, websocket)
        try:
            while True:
                await websocket.receive_text()  # client keeps the channel open
        except WebSocketDisconnect:
            progress_mgr.disconnect(task_id)

    return app
