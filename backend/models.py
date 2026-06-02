# FILE: backend/models.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Pydantic schemas and domain types for requests, responses, tasks, and errors.
#   SCOPE: ErrorCode, AppError, SpeakerSegment, TranscriptSegment, TranscriptionResult,
#          TaskStatus, TaskInfo, TranscribeJob, HealthStatus, AvailableModels
#   DEPENDS: none
#   LINKS: M-SCHEMAS, V-M-SCHEMAS
#   ROLE: TYPES
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   ErrorCode - enum of stable error codes (LINKS module contracts' <errors>)
#   AppError - domain exception carrying an ErrorCode
#   SpeakerSegment - diarization interval {start,end,speaker}
#   TranscriptSegment - aligned text segment {speaker,start,end,text,confidence}
#   TranscriptionResult - full result + speaker_names + output_files
#   TaskStatus - lifecycle enum
#   TaskInfo - queue task status snapshot
#   TranscribeJob - unit of work for the pipeline/queue
#   HealthStatus / AvailableModels - health and model-registry responses
# END_MODULE_MAP
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

UNKNOWN_SPEAKER = "UNKNOWN"


class ErrorCode(str, Enum):
    MISSING_SECRET_TOKEN = "MISSING_SECRET_TOKEN"
    UNAUTHORIZED = "UNAUTHORIZED"
    FFMPEG_NOT_FOUND = "FFMPEG_NOT_FOUND"
    PATH_NOT_ALLOWED = "PATH_NOT_ALLOWED"
    CONVERSION_FAILED = "CONVERSION_FAILED"
    CUDA_UNAVAILABLE = "CUDA_UNAVAILABLE"
    HF_AUTH_FAILED = "HF_AUTH_FAILED"
    MODEL_NOT_LOADED = "MODEL_NOT_LOADED"
    MODEL_DOWNLOAD_FAILED = "MODEL_DOWNLOAD_FAILED"
    CANCELLED = "CANCELLED"
    PIPELINE_FAILED = "PIPELINE_FAILED"
    QUEUE_FULL = "QUEUE_FULL"


class AppError(Exception):
    """Domain exception carrying a stable ErrorCode (see module contracts' <errors>)."""

    def __init__(self, code: ErrorCode, message: str = ""):
        super().__init__(f"{code.value}: {message}" if message else code.value)
        self.code = code
        self.message = message


class SpeakerSegment(BaseModel):
    start: float
    end: float
    speaker: str


class TranscriptSegment(BaseModel):
    speaker: str = UNKNOWN_SPEAKER
    start: float
    end: float
    text: str
    confidence: Optional[float] = None


class TranscriptionResult(BaseModel):
    task_id: str
    file_name: str
    language: str = "ru"
    duration_sec: float = 0.0
    segments: list[TranscriptSegment] = Field(default_factory=list)
    full_text: str = ""
    speaker_names: dict[str, str] = Field(default_factory=dict)
    output_files: dict[str, str] = Field(default_factory=dict)


class TaskStatus(str, Enum):
    queued = "queued"
    converting = "converting"
    diarizing = "diarizing"
    transcribing = "transcribing"
    formatting = "formatting"
    completed = "completed"
    error = "error"
    cancelled = "cancelled"


class TaskInfo(BaseModel):
    task_id: str
    file_path: str
    file_name: str
    status: TaskStatus = TaskStatus.queued
    progress_percent: int = 0
    queue_position: int = 0
    created_at: str = ""
    error_message: Optional[str] = None
    result: Optional[TranscriptionResult] = None


class TranscribeJob(BaseModel):
    task_id: str
    file_path: str
    output_dir: str = ""
    model: str = "faster-whisper-large-v3"
    language: str = "ru"
    num_speakers: Optional[int] = None
    output_formats: list[str] = Field(default_factory=lambda: ["json", "txt", "srt"])
    speaker_names: dict[str, str] = Field(default_factory=dict)


class HealthStatus(BaseModel):
    status: str = "ok"
    python_version: str = ""
    cuda_available: bool = False
    cuda_devices: int = 0
    whisper_ready: bool = False
    pyannote_ready: bool = False
    models_cached: list[str] = Field(default_factory=list)


class AvailableModels(BaseModel):
    available: list[str] = Field(default_factory=list)
    downloaded: list[str] = Field(default_factory=list)
    current: str = "faster-whisper-large-v3"
