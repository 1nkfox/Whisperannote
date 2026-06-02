# Verifies M-ALIGN (V-M-ALIGN): max-overlap speaker assignment.
from backend.align import align, overlap
from backend.models import SpeakerSegment, TranscriptSegment, UNKNOWN_SPEAKER


def _t(start, end, text="x"):
    return TranscriptSegment(start=start, end=end, text=text)


def test_overlap_basic():
    assert overlap(0, 10, 5, 15) == 5
    assert overlap(0, 5, 10, 15) == 0  # disjoint
    assert overlap(0, 10, 2, 4) == 2  # contained


def test_align_picks_max_overlap_speaker():
    spk = [SpeakerSegment(start=0, end=5, speaker="SPEAKER_00"),
           SpeakerSegment(start=5, end=10, speaker="SPEAKER_01")]
    # text segment mostly inside SPEAKER_01
    out = align([_t(4, 10)], spk)
    assert out[0].speaker == "SPEAKER_01"


def test_align_sums_overlap_per_speaker():
    # SPEAKER_00 has two short intervals that together beat SPEAKER_01's single one.
    spk = [
        SpeakerSegment(start=0, end=3, speaker="SPEAKER_00"),
        SpeakerSegment(start=3, end=5, speaker="SPEAKER_01"),
        SpeakerSegment(start=5, end=8, speaker="SPEAKER_00"),
    ]
    out = align([_t(0, 8)], spk)  # 00 -> 6s total, 01 -> 2s
    assert out[0].speaker == "SPEAKER_00"


def test_align_unknown_when_no_overlap():
    spk = [SpeakerSegment(start=100, end=110, speaker="SPEAKER_00")]
    out = align([_t(0, 5)], spk)
    assert out[0].speaker == UNKNOWN_SPEAKER


def test_align_does_not_mutate_input():
    seg = _t(0, 5)
    align([seg], [SpeakerSegment(start=0, end=5, speaker="S0")])
    assert seg.speaker == UNKNOWN_SPEAKER  # original untouched (model_copy)
