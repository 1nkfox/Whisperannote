# Verifies M-SCHEMAS (V-M-SCHEMAS): defaults, round-trip, error type.
from backend.models import (
    AppError,
    AvailableModels,
    ErrorCode,
    TaskInfo,
    TaskStatus,
    TranscriptionResult,
    TranscriptSegment,
    UNKNOWN_SPEAKER,
)


def test_segment_defaults():
    s = TranscriptSegment(start=0, end=1, text="hi")
    assert s.speaker == UNKNOWN_SPEAKER
    assert s.confidence is None


def test_result_roundtrip():
    r = TranscriptionResult(
        task_id="t", file_name="f.mp3", segments=[TranscriptSegment(start=0, end=1, text="x")]
    )
    r2 = TranscriptionResult(**r.model_dump())
    assert r2.task_id == "t"
    assert len(r2.segments) == 1


def test_apperror_carries_code():
    e = AppError(ErrorCode.CUDA_UNAVAILABLE, "no gpu")
    assert e.code == ErrorCode.CUDA_UNAVAILABLE
    assert "CUDA_UNAVAILABLE" in str(e)


def test_taskinfo_defaults():
    t = TaskInfo(task_id="a", file_path="/x", file_name="x")
    assert t.status == TaskStatus.queued
    assert t.progress_percent == 0
