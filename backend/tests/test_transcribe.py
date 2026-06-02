# Verifies M-TRANSCRIBE (V-M-TRANSCRIBE): segment mapping, confidence, cancellation.
import math
import threading

import pytest

from backend.models import AppError, ErrorCode
from backend.tests.conftest import FakeInfo, FakeSeg, FakeWhisperModel
from backend.transcribe import Transcriber, confidence_from_logprob


def test_confidence_from_logprob():
    assert confidence_from_logprob(None) is None
    assert confidence_from_logprob(0.0) == 1.0
    assert abs(confidence_from_logprob(-0.1) - math.exp(-0.1)) < 1e-9
    assert confidence_from_logprob(5.0) == 1.0  # clamped


def test_transcribe_maps_segments():
    t = Transcriber()
    t._model = FakeWhisperModel(
        [FakeSeg(0, 2, " hi ", -0.2), FakeSeg(2, 4, "yo", None)], FakeInfo(duration=4.0, language="en")
    )
    progress = []
    segs, dur, lang = t.transcribe("x.wav", progress_cb=lambda f: progress.append(f))
    assert [s.text for s in segs] == ["hi", "yo"]
    assert abs(segs[0].confidence - math.exp(-0.2)) < 1e-9
    assert segs[1].confidence is None
    assert dur == 4.0 and lang == "en"
    assert progress and progress[-1] <= 0.99


def test_transcribe_not_loaded():
    with pytest.raises(AppError) as ei:
        Transcriber().transcribe("x.wav")
    assert ei.value.code == ErrorCode.MODEL_NOT_LOADED


def test_transcribe_cancellation():
    t = Transcriber()
    t._model = FakeWhisperModel([FakeSeg(0, 2, "hi", -0.1)])
    ev = threading.Event()
    ev.set()  # already cancelled before first segment
    with pytest.raises(AppError) as ei:
        t.transcribe("x.wav", cancel_event=ev)
    assert ei.value.code == ErrorCode.CANCELLED
