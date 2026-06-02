# FILE: backend/queue_manager.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Single-worker (concurrency=1) async task queue running the blocking pipeline in a
#            thread executor, tracking TaskInfo and pushing progress over WebSocket.
#   SCOPE: QueueManager(start, stop, enqueue, status, get, cancel, processing)
#   DEPENDS: M-PIPELINE, M-PROGRESS, M-SCHEMAS
#   LINKS: M-QUEUE, V-M-QUEUE
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   QueueManager - FIFO queue with exactly one worker; runner is injected for testability
# END_MODULE_MAP
from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from .logging_setup import get_logger, mark
from .models import AppError, ErrorCode, TaskInfo, TaskStatus, TranscribeJob, TranscriptionResult

log = get_logger("queue")

# runner(job, cancel_event, on_stage, on_progress) -> TranscriptionResult  (blocking, runs in a thread)
Runner = Callable[[TranscribeJob, threading.Event, Callable[[str], None], Callable[[int, str], None]], TranscriptionResult]

_STAGE_TO_STATUS = {
    "converting": TaskStatus.converting,
    "diarizing": TaskStatus.diarizing,
    "transcribing": TaskStatus.transcribing,
    "formatting": TaskStatus.formatting,
}


class QueueManager:
    def __init__(self, runner: Runner, progress: Any = None) -> None:
        self._runner = runner
        self._progress = progress
        self._queue: "asyncio.Queue[str]" = asyncio.Queue()
        self._tasks: dict[str, TaskInfo] = {}
        self._jobs: dict[str, TranscribeJob] = {}
        self._cancels: dict[str, threading.Event] = {}
        self._current: Optional[str] = None
        self._worker: Optional[asyncio.Task] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    # ---- lifecycle ----
    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        if self._worker is None:
            self._worker = asyncio.create_task(self._run_worker())

    async def stop(self) -> None:
        if self._worker is not None:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass
            self._worker = None

    @property
    def processing(self) -> bool:
        return self._current is not None

    # ---- public API ----
    def enqueue(self, job: TranscribeJob) -> TaskInfo:
        info = TaskInfo(
            task_id=job.task_id,
            file_path=job.file_path,
            file_name=job.file_path.replace("\\", "/").split("/")[-1],
            status=TaskStatus.queued,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self._tasks[job.task_id] = info
        self._jobs[job.task_id] = job
        self._cancels[job.task_id] = threading.Event()
        self._queue.put_nowait(job.task_id)
        self._recompute_positions()
        return info

    def status(self) -> list[TaskInfo]:
        return sorted(self._tasks.values(), key=lambda t: t.created_at)

    def get(self, task_id: str) -> Optional[TaskInfo]:
        return self._tasks.get(task_id)

    def cancel(self, task_id: str) -> bool:
        info = self._tasks.get(task_id)
        if info is None:
            return False
        if task_id == self._current:
            self._cancels[task_id].set()  # cooperative cancel of the running job
            return True
        if info.status == TaskStatus.queued:
            info.status = TaskStatus.cancelled
            self._recompute_positions()
            return True
        return False

    # ---- internals ----
    def _recompute_positions(self) -> None:
        pos = 0
        for info in self.status():
            if info.status == TaskStatus.queued:
                pos += 1
                info.queue_position = pos

    def _send(self, coro) -> None:
        if self._progress is None or self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(coro, self._loop)

    async def _run_worker(self) -> None:
        while True:
            task_id = await self._queue.get()
            try:
                await self._process_one(task_id)
            finally:
                self._queue.task_done()

    async def _process_one(self, task_id: str) -> None:
        info = self._tasks.get(task_id)
        job = self._jobs.get(task_id)
        if info is None or job is None or info.status == TaskStatus.cancelled:
            return
        self._current = task_id
        cancel_event = self._cancels[task_id]
        # START_BLOCK_PROCESS_NEXT
        log.info(mark("Queue", "processNext", "BLOCK_PROCESS_NEXT", f"task={task_id}"))

        def on_stage(stage: str) -> None:
            info.status = _STAGE_TO_STATUS.get(stage, info.status)
            if self._progress is not None:
                self._send(self._progress.stage(task_id, stage))

        def on_progress(pct: int, msg: str = "") -> None:
            info.progress_percent = pct
            if self._progress is not None:
                self._send(self._progress.progress(task_id, pct, msg))

        try:
            assert self._loop is not None
            result: TranscriptionResult = await self._loop.run_in_executor(
                None, lambda: self._runner(job, cancel_event, on_stage, on_progress)
            )
            info.status = TaskStatus.completed
            info.progress_percent = 100
            info.result = result
            if self._progress is not None:
                self._send(self._progress.complete(task_id, result.output_files, result.duration_sec))
        except AppError as e:
            self._finish_error(info, task_id, e.code, e.message or str(e))
        except Exception as e:  # defensive: worker must never die
            self._finish_error(info, task_id, ErrorCode.PIPELINE_FAILED, str(e))
        finally:
            self._current = None
            self._recompute_positions()
        # END_BLOCK_PROCESS_NEXT

    def _finish_error(self, info: TaskInfo, task_id: str, code: ErrorCode, message: str) -> None:
        if code == ErrorCode.CANCELLED:
            info.status = TaskStatus.cancelled
        else:
            info.status = TaskStatus.error
            info.error_message = f"{code.value}: {message}"
        if self._progress is not None:
            self._send(self._progress.error(task_id, info.error_message or code.value))
