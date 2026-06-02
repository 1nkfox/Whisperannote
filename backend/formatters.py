# FILE: backend/formatters.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Serialize a TranscriptionResult to JSON / TXT / SRT / DOCX, applying speaker_names.
#   SCOPE: format_timestamp, srt_time, write_outputs, to_json, to_txt, to_srt, to_docx
#   DEPENDS: M-SCHEMAS
#   LINKS: M-FORMAT, V-M-FORMAT
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   format_timestamp - seconds -> "HH:MM:SS.mmm"
#   srt_time - seconds -> "HH:MM:SS,mmm" (SRT comma millis)
#   write_outputs - render the requested formats, returning {format: path}
#   to_json / to_txt / to_srt / to_docx - individual format writers (speaker_names applied)
# END_MODULE_MAP
#
# START_CHANGE_SUMMARY
#   LAST_CHANGE: v1.0.1 - Strengthened DOCX export evidence for Phase-7/V-M-FORMAT by keeping the WRITE_DOCX block paired before return.
# END_CHANGE_SUMMARY
from __future__ import annotations

import json
import os
from pathlib import Path

from .logging_setup import get_logger, mark
from .models import TranscriptionResult

log = get_logger("format")


def format_timestamp(seconds: float) -> str:
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def srt_time(seconds: float) -> str:
    return format_timestamp(seconds).replace(".", ",")


def _name(speaker: str, names: dict[str, str]) -> str:
    return names.get(speaker, speaker)


def _base(out_dir: str, file_name: str) -> str:
    return os.path.join(out_dir, Path(file_name).stem)


def to_json(result: TranscriptionResult, out_dir: str) -> str:
    names = result.speaker_names
    payload = {
        "file_name": result.file_name,
        "language": result.language,
        "duration_sec": round(result.duration_sec, 3),
        "segments": [
            {
                "speaker": _name(seg.speaker, names),
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text,
                "confidence": round(seg.confidence, 3) if seg.confidence is not None else None,
            }
            for seg in result.segments
        ],
    }
    path = _base(out_dir, result.file_name) + ".json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


def to_txt(result: TranscriptionResult, out_dir: str) -> str:
    names = result.speaker_names
    lines = [
        f"[{format_timestamp(seg.start)}] {_name(seg.speaker, names)}: {seg.text}".rstrip()
        for seg in result.segments
    ]
    path = _base(out_dir, result.file_name) + ".txt"
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + ("\n" if lines else ""))
    return path


def to_srt(result: TranscriptionResult, out_dir: str) -> str:
    names = result.speaker_names
    blocks = []
    for i, seg in enumerate(result.segments, start=1):
        text = f"{_name(seg.speaker, names)}: {seg.text}".strip()
        blocks.append(f"{i}\n{srt_time(seg.start)} --> {srt_time(seg.end)}\n{text}\n")
    path = _base(out_dir, result.file_name) + ".srt"
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(blocks))
    return path


# START_CONTRACT: to_docx
#   PURPOSE: Render a DOCX transcript (speaker headers + timestamped lines).
#   INPUTS: { result: TranscriptionResult, out_dir: str }
#   OUTPUTS: { str - path to the .docx }
#   SIDE_EFFECTS: writes a file; lazily imports python-docx
#   LINKS: M-FORMAT
# END_CONTRACT: to_docx
def to_docx(result: TranscriptionResult, out_dir: str) -> str:
    # START_BLOCK_WRITE_DOCX
    from docx import Document  # lazy: python-docx only needed for this format

    names = result.speaker_names
    doc = Document()
    doc.add_heading(result.file_name, level=1)
    last_speaker = None
    for seg in result.segments:
        display = _name(seg.speaker, names)
        if display != last_speaker:
            doc.add_heading(display, level=3)
            last_speaker = display
        doc.add_paragraph(f"[{format_timestamp(seg.start)}] {seg.text}")
    path = _base(out_dir, result.file_name) + ".docx"
    doc.save(path)
    log.info(mark("Format", "to_docx", "BLOCK_WRITE_DOCX", "docx written"))
    # END_BLOCK_WRITE_DOCX
    return path


_WRITERS = {"json": to_json, "txt": to_txt, "srt": to_srt, "docx": to_docx}


def write_outputs(result: TranscriptionResult, formats: list[str], out_dir: str) -> dict[str, str]:
    os.makedirs(out_dir, exist_ok=True)
    files: dict[str, str] = {}
    for fmt in formats:
        writer = _WRITERS.get(fmt)
        if writer is None:
            log.warning(mark("Format", "write_outputs", "BLOCK_WRITE", f"unknown format {fmt}"))
            continue
        files[fmt] = writer(result, out_dir)
    return files
