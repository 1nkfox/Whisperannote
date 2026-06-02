# Shared fixtures and test doubles for backend verification.
# These fakes let us exercise ML-facing modules (diarize/transcribe) and the queue/server
# WITHOUT importing torch / faster-whisper / pyannote.
from __future__ import annotations

import pytest

from backend.config import BackendConfig


# ---------- WebSocket double ----------
class FakeWS:
    def __init__(self) -> None:
        self.sent: list[dict] = []
        self.accepted = False
        self.closed: int | None = None

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, data: dict) -> None:
        self.sent.append(data)

    async def close(self, code: int = 1000) -> None:
        self.closed = code


# ---------- pyannote doubles ----------
class FakeTurn:
    def __init__(self, start: float, end: float) -> None:
        self.start = start
        self.end = end


class FakeAnnotation:
    def __init__(self, segs: list[tuple[float, float, str]]) -> None:
        self._segs = segs

    def itertracks(self, yield_label: bool = False):
        for s, e, label in self._segs:
            yield FakeTurn(s, e), None, label


class FakePipeline:
    def __init__(self, segs: list[tuple[float, float, str]]) -> None:
        self._segs = segs
        self.calls: list[tuple] = []

    def __call__(self, wav: str, **kwargs):
        self.calls.append((wav, kwargs))
        return FakeAnnotation(self._segs)


# ---------- faster-whisper doubles ----------
class FakeSeg:
    def __init__(self, start: float, end: float, text: str, avg_logprob=None) -> None:
        self.start = start
        self.end = end
        self.text = text
        self.avg_logprob = avg_logprob


class FakeInfo:
    def __init__(self, duration: float = 0.0, language: str = "ru") -> None:
        self.duration = duration
        self.language = language


class FakeWhisperModel:
    def __init__(self, segs: list[FakeSeg], info: FakeInfo | None = None) -> None:
        self._segs = segs
        self._info = info or FakeInfo(duration=10.0)
        self.calls: list[tuple] = []

    def transcribe(self, wav: str, **kwargs):
        self.calls.append((wav, kwargs))
        return iter(self._segs), self._info


# ---------- ProgressManager double ----------
class FakeProgress:
    def __init__(self) -> None:
        self.events: list[tuple] = []

    async def stage(self, task_id, stage):
        self.events.append(("stage", task_id, stage))

    async def progress(self, task_id, percent, message=""):
        self.events.append(("progress", task_id, percent))

    async def complete(self, task_id, output_files, duration_sec):
        self.events.append(("complete", task_id, output_files))

    async def error(self, task_id, message):
        self.events.append(("error", task_id, message))


@pytest.fixture
def test_config(tmp_path) -> BackendConfig:
    return BackendConfig(
        secret_token="test-secret",
        model_cache_dir=str(tmp_path / "models"),
        allowed_roots=[str(tmp_path)],
    )
