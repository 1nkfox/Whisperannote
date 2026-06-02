# FILE: backend/transcribe.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Native faster-whisper transcription (no chunking) with per-segment confidence and
#            cooperative cancellation.
#   SCOPE: confidence_from_logprob, Transcriber(load, transcribe, ready)
#   DEPENDS: M-SCHEMAS, M-MODELS
#   LINKS: M-TRANSCRIBE, V-M-TRANSCRIBE
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   confidence_from_logprob - exp(avg_logprob) clamped to [0,1]
#   Transcriber - holds a loaded WhisperModel and yields TranscriptSegment lists
# END_MODULE_MAP
from __future__ import annotations

import math
from typing import Any, Callable, Optional

from .logging_setup import get_logger, mark
from .models import AppError, ErrorCode, TranscriptSegment
from .models_registry import DEFAULT_MODEL, WHISPER_MODELS

log = get_logger("transcribe")


def confidence_from_logprob(avg_logprob: Optional[float]) -> Optional[float]:
    if avg_logprob is None:
        return None
    return max(0.0, min(1.0, math.exp(avg_logprob)))


class Transcriber:
    def __init__(
        self,
        model_name: str = DEFAULT_MODEL,
        device: str = "cuda",
        compute_type: str = "float16",
        cache_dir: Optional[str] = None,
    ) -> None:
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type
        self.cache_dir = cache_dir
        self._model: Any = None

    @property
    def ready(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        from faster_whisper import WhisperModel  # lazy

        size = WHISPER_MODELS.get(self.model_name, self.model_name)
        self._model = WhisperModel(
            size, device=self.device, compute_type=self.compute_type, download_root=self.cache_dir
        )

    # START_CONTRACT: transcribe
    #   PURPOSE: Transcribe a WAV end-to-end, checking cancel_event between segments.
    #   INPUTS: { wav_path: str, language: str, cancel_event, progress_cb: Callable[[float],None] | None }
    #   OUTPUTS: { (list[TranscriptSegment], duration_sec: float, language: str) }
    #   SIDE_EFFECTS: GPU inference
    #   LINKS: M-TRANSCRIBE
    # END_CONTRACT: transcribe
    def transcribe(
        self,
        wav_path: str,
        language: str = "ru",
        cancel_event: Any = None,
        progress_cb: Optional[Callable[[float], None]] = None,
    ) -> tuple[list[TranscriptSegment], float, str]:
        if self._model is None:
            raise AppError(ErrorCode.MODEL_NOT_LOADED, "transcriber not loaded")
        segments_iter, info = self._model.transcribe(
            wav_path, language=language, vad_filter=True, word_timestamps=False
        )
        total = float(getattr(info, "duration", 0.0) or 0.0)
        out: list[TranscriptSegment] = []
        # START_BLOCK_ITER_SEGMENTS
        for seg in segments_iter:
            if cancel_event is not None and cancel_event.is_set():
                raise AppError(ErrorCode.CANCELLED, "transcription cancelled")
            out.append(
                TranscriptSegment(
                    start=float(seg.start),
                    end=float(seg.end),
                    text=(getattr(seg, "text", "") or "").strip(),
                    confidence=confidence_from_logprob(getattr(seg, "avg_logprob", None)),
                )
            )
            if progress_cb and total > 0:
                progress_cb(min(0.99, float(seg.end) / total))
        # END_BLOCK_ITER_SEGMENTS
        log.info(mark("Transcribe", "transcribe", "BLOCK_ITER_SEGMENTS", f"segments={len(out)}"))
        return out, total, str(getattr(info, "language", language) or language)
