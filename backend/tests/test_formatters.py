# Verifies M-FORMAT (V-M-FORMAT): formatters apply speaker_names across all outputs.
import json
import os

from backend.formatters import format_timestamp, srt_time, write_outputs
from backend.models import TranscriptionResult, TranscriptSegment


def _result():
    return TranscriptionResult(
        task_id="t1",
        file_name="meeting.mp3",
        language="ru",
        duration_sec=12.3456,
        segments=[
            TranscriptSegment(speaker="SPEAKER_00", start=0.0, end=2.0, text="привет", confidence=0.987654),
            TranscriptSegment(speaker="SPEAKER_01", start=2.0, end=4.0, text="здравствуйте"),
        ],
        speaker_names={"SPEAKER_00": "Алиса"},
    )


def test_timestamp_helpers():
    assert format_timestamp(3661.5) == "01:01:01.500"
    assert srt_time(3661.5) == "01:01:01,500"


def test_write_outputs_all_formats_and_renaming(tmp_path):
    files = write_outputs(_result(), ["json", "txt", "srt", "docx"], str(tmp_path))
    assert set(files) == {"json", "txt", "srt", "docx"}
    for path in files.values():
        assert os.path.exists(path)

    data = json.loads(open(files["json"], encoding="utf-8").read())
    speakers = [s["speaker"] for s in data["segments"]]
    assert speakers == ["Алиса", "SPEAKER_01"]  # renamed + untouched fallback
    assert data["segments"][0]["confidence"] == 0.988  # rounded to 3 places

    txt = open(files["txt"], encoding="utf-8").read()
    assert "Алиса: привет" in txt
    assert "SPEAKER_00" not in txt

    srt = open(files["srt"], encoding="utf-8").read()
    assert "00:00:00,000 --> 00:00:02,000" in srt


def test_unknown_format_skipped(tmp_path):
    files = write_outputs(_result(), ["json", "pdf"], str(tmp_path))
    assert "pdf" not in files
    assert "json" in files
