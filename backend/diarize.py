# FILE: backend/diarize.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Speaker diarization via pyannote.audio on CUDA; returns speaker-labelled intervals.
#   SCOPE: Diarizer(load, diarize, ready)
#   DEPENDS: M-SCHEMAS, M-MODELS
#   LINKS: M-DIARIZE, V-M-DIARIZE
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   Diarizer - holds a loaded pyannote pipeline and produces SpeakerSegment lists
# END_MODULE_MAP
from __future__ import annotations

from typing import Any, Optional

from .logging_setup import get_logger, mark
from .models import AppError, ErrorCode, SpeakerSegment
from .models_registry import DIARIZATION_MODEL

log = get_logger("diarize")


class Diarizer:
    def __init__(self, hf_token: Optional[str] = None, device: str = "cuda") -> None:
        self.hf_token = hf_token
        self.device = device
        self._pipeline: Any = None

    @property
    def ready(self) -> bool:
        return self._pipeline is not None

    def load(self) -> None:
        import torch  # lazy
        from pyannote.audio import Pipeline  # lazy

        if not torch.cuda.is_available():
            raise AppError(ErrorCode.CUDA_UNAVAILABLE, "CUDA GPU is required for diarization")
        try:
            pipe = Pipeline.from_pretrained(DIARIZATION_MODEL, use_auth_token=self.hf_token)
        except Exception as e:
            raise AppError(ErrorCode.HF_AUTH_FAILED, f"pyannote load failed: {e}") from e
        if pipe is None:
            # pyannote returns None on a gated/invalid token instead of raising.
            raise AppError(ErrorCode.HF_AUTH_FAILED, "accept the pyannote model terms and set a valid HF token")
        pipe.to(torch.device(self.device))
        self._pipeline = pipe

    # START_CONTRACT: diarize
    #   PURPOSE: Run the pipeline over a WAV and convert the annotation to SpeakerSegments.
    #   INPUTS: { wav_path: str, num_speakers: int | None }
    #   OUTPUTS: { list[SpeakerSegment] sorted by start }
    #   SIDE_EFFECTS: GPU inference
    #   LINKS: M-DIARIZE
    # END_CONTRACT: diarize
    def diarize(self, wav_path: str, num_speakers: Optional[int] = None) -> list[SpeakerSegment]:
        if self._pipeline is None:
            raise AppError(ErrorCode.MODEL_NOT_LOADED, "diarizer not loaded")
        # START_BLOCK_RUN_PIPELINE
        kwargs: dict[str, Any] = {}
        if num_speakers:
            kwargs["num_speakers"] = num_speakers
        annotation = self._pipeline(wav_path, **kwargs)
        segments = self._to_segments(annotation)
        log.info(mark("Diarize", "diarize", "BLOCK_RUN_PIPELINE", f"segments={len(segments)}"))
        return segments
        # END_BLOCK_RUN_PIPELINE

    @staticmethod
    def _to_segments(annotation: Any) -> list[SpeakerSegment]:
        out: list[SpeakerSegment] = []
        for turn, _, label in annotation.itertracks(yield_label=True):
            out.append(SpeakerSegment(start=float(turn.start), end=float(turn.end), speaker=str(label)))
        out.sort(key=lambda s: s.start)
        return out
