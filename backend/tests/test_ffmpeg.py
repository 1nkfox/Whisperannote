# Verifies M-FFMPEG (V-M-FFMPEG): path validation (pure) + ffmpeg conversion (skipped w/o ffmpeg).
import os
import shutil
import subprocess

import pytest

from backend.models import AppError, ErrorCode
from backend.utils import extract_wav, new_workdir, probe_duration, validate_path

HAS_FFMPEG = shutil.which("ffmpeg") is not None


def test_validate_path_inside_root(tmp_path):
    f = tmp_path / "audio.mp3"
    f.write_text("x")
    assert validate_path(str(f), [str(tmp_path)]) == os.path.realpath(str(f))


def test_validate_path_outside_root_denied(tmp_path):
    other = tmp_path / "outside.mp3"
    other.write_text("x")
    with pytest.raises(AppError) as ei:
        validate_path(str(other), [str(tmp_path / "allowed")])
    assert ei.value.code == ErrorCode.PATH_NOT_ALLOWED


def test_validate_path_blocks_traversal(tmp_path):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    sneaky = str(allowed / ".." / "secret.txt")  # resolves outside `allowed`
    with pytest.raises(AppError):
        validate_path(sneaky, [str(allowed)])


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg not installed in this environment")
def test_extract_wav_roundtrip(tmp_path):
    work = new_workdir(str(tmp_path))
    src = os.path.join(work, "tone.wav")
    # generate 1s sine via ffmpeg
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", src],
        capture_output=True,
    )
    out = extract_wav(src, work)
    assert os.path.exists(out)
    assert probe_duration(out) > 0.5
