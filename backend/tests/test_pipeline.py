# Verifies M-PIPELINE (V-M-PIPELINE): orchestration end-to-end with fakes (no ffmpeg/GPU).
import os

import pytest

from backend.models import (
    AppError,
    ErrorCode,
    SpeakerSegment,
    TranscribeJob,
    TranscriptSegment,
)
from backend.pipeline import run


class FakeDiar:
    def diarize(self, wav, num_speakers=None):
        return [SpeakerSegment(start=0.0, end=5.0, speaker="S0")]


class FakeTrans:
    def __init__(self, raise_cancel=False):
        self.raise_cancel = raise_cancel

    def transcribe(self, wav, language="ru", cancel_event=None, progress_cb=None):
        if self.raise_cancel:
            raise AppError(ErrorCode.CANCELLED, "")
        if progress_cb:
            progress_cb(0.5)
        return [TranscriptSegment(start=0.0, end=5.0, text="hello")], 5.0, language


@pytest.fixture
def _no_ffmpeg(monkeypatch):
    monkeypatch.setattr("backend.pipeline.extract_wav", lambda src, work: os.path.join(work, "x.wav"))
    monkeypatch.setattr("backend.pipeline.probe_duration", lambda w: 5.0)


def test_pipeline_end_to_end(tmp_path, _no_ffmpeg):
    src = tmp_path / "in.mp3"
    src.write_text("x")
    out = tmp_path / "out"
    stages = []
    job = TranscribeJob(
        task_id="t",
        file_path=str(src),
        output_dir=str(out),
        output_formats=["json", "txt"],
        speaker_names={"S0": "Боб"},
    )
    res = run(
        job,
        FakeDiar(),
        FakeTrans(),
        allowed_roots=[str(tmp_path)],
        out_dir=str(out),
        on_stage=stages.append,
    )
    assert res.segments[0].speaker == "S0"
    assert res.full_text.startswith("Боб: hello")
    assert os.path.exists(res.output_files["json"])
    assert stages == ["converting", "diarizing", "transcribing", "formatting"]


def test_pipeline_rejects_path_outside_roots(tmp_path):
    job = TranscribeJob(task_id="t", file_path="/etc/passwd")
    with pytest.raises(AppError) as ei:
        run(job, FakeDiar(), FakeTrans(), allowed_roots=[str(tmp_path)], out_dir=str(tmp_path))
    assert ei.value.code == ErrorCode.PATH_NOT_ALLOWED


def test_pipeline_propagates_cancel(tmp_path, _no_ffmpeg):
    src = tmp_path / "in.mp3"
    src.write_text("x")
    job = TranscribeJob(task_id="t", file_path=str(src))
    with pytest.raises(AppError) as ei:
        run(job, FakeDiar(), FakeTrans(raise_cancel=True), allowed_roots=[str(tmp_path)], out_dir=str(tmp_path))
    assert ei.value.code == ErrorCode.CANCELLED
