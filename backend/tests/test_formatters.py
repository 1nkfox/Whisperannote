# FILE: backend/tests/test_formatters.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Verify M-FORMAT exports JSON/TXT/SRT/DOCX with speaker_names applied.
#   SCOPE: timestamp helpers, write_outputs format selection, speaker renaming, DOCX text evidence
#   DEPENDS: M-FORMAT, M-SCHEMAS
#   LINKS: M-FORMAT, V-M-FORMAT, VF-EXPORT
#   ROLE: TEST
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   _result - fixture TranscriptionResult with one renamed and one fallback speaker
#   test_timestamp_helpers - timestamp format regression
#   test_write_outputs_all_formats_and_renaming - all format export and speaker-name evidence
#   test_unknown_format_skipped - unsupported formats are ignored without blocking valid outputs
# END_MODULE_MAP
import json
import os

from docx import Document

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
    assert "Алиса: привет" in srt
    assert "SPEAKER_00" not in srt

    docx_text = "\n".join(paragraph.text for paragraph in Document(files["docx"]).paragraphs)
    assert "Алиса" in docx_text
    assert "привет" in docx_text
    assert "SPEAKER_00" not in docx_text


def test_unknown_format_skipped(tmp_path):
    files = write_outputs(_result(), ["json", "pdf"], str(tmp_path))
    assert "pdf" not in files
    assert "json" in files
