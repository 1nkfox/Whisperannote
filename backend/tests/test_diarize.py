# Verifies M-DIARIZE (V-M-DIARIZE): annotation->segments, sorting, num_speakers hint, not-loaded.
import pytest

from backend.diarize import Diarizer
from backend.models import AppError, ErrorCode
from backend.tests.conftest import FakePipeline


def test_diarize_converts_and_sorts():
    d = Diarizer()
    d._pipeline = FakePipeline([(5.0, 10.0, "B"), (0.0, 5.0, "A"), (2.0, 3.0, "A")])
    segs = d.diarize("x.wav", num_speakers=2)
    assert [s.start for s in segs] == [0.0, 2.0, 5.0]  # sorted by start
    assert {s.speaker for s in segs} == {"A", "B"}
    # num_speakers forwarded as a pipeline hint
    assert d._pipeline.calls[0][1] == {"num_speakers": 2}


def test_diarize_without_num_speakers_omits_hint():
    d = Diarizer()
    d._pipeline = FakePipeline([(0.0, 1.0, "A")])
    d.diarize("x.wav")
    assert d._pipeline.calls[0][1] == {}


def test_diarize_not_loaded():
    with pytest.raises(AppError) as ei:
        Diarizer().diarize("x.wav")
    assert ei.value.code == ErrorCode.MODEL_NOT_LOADED
