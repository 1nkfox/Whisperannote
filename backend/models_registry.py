# FILE: backend/models_registry.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Catalog of supported Whisper/diarization models, cache inspection, and on-demand
#            downloads into MODEL_CACHE_DIR (heavy libs imported lazily).
#   SCOPE: WHISPER_MODELS, WHISPER_REPOS, DIARIZATION_MODEL, is_downloaded, list_models, download_model
#   DEPENDS: M-SCHEMAS
#   LINKS: M-MODELS, V-M-MODELS
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   WHISPER_MODELS - public model name -> faster-whisper size string
#   WHISPER_REPOS - public model name -> HuggingFace repo id (for explicit download)
#   DIARIZATION_MODEL - pyannote pipeline id
#   is_downloaded - heuristic cache presence check
#   list_models - AvailableModels (available/downloaded/current)
#   download_model - snapshot_download into the cache with progress callbacks
# END_MODULE_MAP
from __future__ import annotations

import os
from typing import Callable, Optional

from .logging_setup import get_logger, mark
from .models import AppError, AvailableModels, ErrorCode

log = get_logger("models")

WHISPER_MODELS: dict[str, str] = {
    "faster-whisper-large-v3": "large-v3",
    "faster-whisper-large-v3-turbo": "large-v3-turbo",
    "faster-whisper-medium": "medium",
}

WHISPER_REPOS: dict[str, str] = {
    "faster-whisper-large-v3": "Systran/faster-whisper-large-v3",
    "faster-whisper-large-v3-turbo": "deepdml/faster-whisper-large-v3-turbo-ct2",
    "faster-whisper-medium": "Systran/faster-whisper-medium",
}

DIARIZATION_MODEL = "pyannote/speaker-diarization-3.1"

DEFAULT_MODEL = "faster-whisper-large-v3"


def is_downloaded(model: str, cache_dir: str) -> bool:
    """Heuristic: a HuggingFace cache dir contains a `models--<owner>--<name>` folder."""
    repo = WHISPER_REPOS.get(model)
    if not repo or not os.path.isdir(cache_dir):
        return False
    slug = "models--" + repo.replace("/", "--")
    return any(entry == slug for entry in os.listdir(cache_dir))


def list_models(cache_dir: str, current: str = DEFAULT_MODEL) -> AvailableModels:
    available = list(WHISPER_MODELS.keys())
    downloaded = [m for m in available if is_downloaded(m, cache_dir)]
    return AvailableModels(available=available, downloaded=downloaded, current=current)


# START_CONTRACT: download_model
#   PURPOSE: Download a model snapshot into the cache, reporting coarse progress.
#   INPUTS: { model: str, cache_dir: str, progress_cb: Callable[[str,int],None] | None }
#   OUTPUTS: { str - local snapshot path }
#   SIDE_EFFECTS: network + disk writes; lazily imports huggingface_hub
#   LINKS: M-MODELS
# END_CONTRACT: download_model
def download_model(
    model: str,
    cache_dir: str,
    progress_cb: Optional[Callable[[str, int], None]] = None,
) -> str:
    repo = WHISPER_REPOS.get(model)
    if not repo:
        raise AppError(ErrorCode.MODEL_DOWNLOAD_FAILED, f"unknown model {model}")
    # START_BLOCK_DOWNLOAD
    if progress_cb:
        progress_cb("start", 0)
    try:
        from huggingface_hub import snapshot_download  # lazy heavy import

        os.makedirs(cache_dir, exist_ok=True)
        path = snapshot_download(repo_id=repo, cache_dir=cache_dir)
    except Exception as e:  # network / auth / disk
        log.warning(mark("Models", "download_model", "BLOCK_DOWNLOAD", "download failed"))
        raise AppError(ErrorCode.MODEL_DOWNLOAD_FAILED, str(e)) from e
    if progress_cb:
        progress_cb("complete", 100)
    log.info(mark("Models", "download_model", "BLOCK_DOWNLOAD", f"{model} ready"))
    return path
    # END_BLOCK_DOWNLOAD
