# FILE: backend/utils.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: FFmpeg conversion (to MP3 / WAV) into the system temp dir, FFmpeg availability check,
#            temp lifecycle, and path validation against allowed roots.
#   SCOPE: check_ffmpeg, validate_path, new_workdir, to_mp3, extract_wav, probe_duration, cleanup
#   DEPENDS: M-BACKEND-CONFIG, M-SCHEMAS
#   LINKS: M-FFMPEG, V-M-FFMPEG
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   check_ffmpeg - raise FFMPEG_NOT_FOUND if ffmpeg is not on PATH
#   validate_path - resolve a path and assert it lives under an allowed root (anti-traversal)
#   new_workdir - create a private temp working directory
#   to_mp3 / extract_wav - ffmpeg conversions writing into the temp workdir
#   probe_duration - read WAV duration via the stdlib wave module
#   cleanup - best-effort removal of temp files/dirs
# END_MODULE_MAP
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import wave

from .logging_setup import get_logger, mark
from .models import AppError, ErrorCode

log = get_logger("ffmpeg")


def check_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise AppError(ErrorCode.FFMPEG_NOT_FOUND, "ffmpeg not found on PATH")
    return exe


# START_CONTRACT: validate_path
#   PURPOSE: Ensure an absolute file path resolves inside one of the allowed roots.
#   INPUTS: { path: str, allowed_roots: list[str] }
#   OUTPUTS: { str - the realpath } or raises AppError(PATH_NOT_ALLOWED)
#   SIDE_EFFECTS: none
#   LINKS: M-FFMPEG, M-AUTH
# END_CONTRACT: validate_path
def validate_path(path: str, allowed_roots: list[str]) -> str:
    # START_BLOCK_VALIDATE_PATH
    rp = os.path.realpath(path)
    for root in allowed_roots:
        rroot = os.path.realpath(root)
        if rp == rroot or rp.startswith(rroot + os.sep):
            return rp
    log.warning(mark("Ffmpeg", "validate_path", "BLOCK_VALIDATE_PATH", "path outside allowed roots"))
    raise AppError(ErrorCode.PATH_NOT_ALLOWED, "file_path is outside the allowed folders")
    # END_BLOCK_VALIDATE_PATH


def new_workdir(base: str | None = None) -> str:
    return tempfile.mkdtemp(prefix="whisperannote_", dir=base or tempfile.gettempdir())


def _run_ffmpeg(args: list[str]) -> None:
    exe = check_ffmpeg()
    proc = subprocess.run([exe, "-y", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise AppError(ErrorCode.CONVERSION_FAILED, (proc.stderr or "")[-500:])


def to_mp3(input_path: str, workdir: str) -> str:
    out = os.path.join(workdir, "input.mp3")
    _run_ffmpeg(["-i", input_path, "-b:a", "128k", out])
    return out


# START_CONTRACT: extract_wav
#   PURPOSE: Extract a 16kHz mono PCM s16le WAV (Whisper/pyannote input) into the workdir.
#   INPUTS: { input_path: str, workdir: str }
#   OUTPUTS: { str - wav path in system temp }
#   SIDE_EFFECTS: writes a temp file; spawns ffmpeg
#   LINKS: M-FFMPEG
# END_CONTRACT: extract_wav
def extract_wav(input_path: str, workdir: str) -> str:
    # START_BLOCK_EXTRACT_WAV
    out = os.path.join(workdir, "input.wav")
    _run_ffmpeg(["-i", input_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", out])
    log.info(mark("Ffmpeg", "extract_wav", "BLOCK_EXTRACT_WAV", "wav extracted to temp"))
    return out
    # END_BLOCK_EXTRACT_WAV


def probe_duration(wav_path: str) -> float:
    with wave.open(wav_path, "rb") as wf:
        return wf.getnframes() / float(wf.getframerate() or 1)


def cleanup(*paths: str) -> None:
    for p in paths:
        try:
            if not p:
                continue
            if os.path.isdir(p):
                shutil.rmtree(p, ignore_errors=True)
            elif os.path.exists(p):
                os.remove(p)
        except OSError:
            log.warning(mark("Ffmpeg", "cleanup", "BLOCK_CLEANUP", "failed to remove temp artifact"))
