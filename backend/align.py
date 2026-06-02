# FILE: backend/align.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Assign a speaker label to each transcript segment by maximum temporal overlap
#            with diarization segments (UNKNOWN when there is no overlap).
#   SCOPE: overlap, align
#   DEPENDS: M-SCHEMAS
#   LINKS: M-ALIGN, V-M-ALIGN
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   overlap - duration of the intersection of two [start,end] intervals
#   align - attach the best-overlap speaker to every transcript segment
# END_MODULE_MAP
from __future__ import annotations

from .logging_setup import get_logger, mark
from .models import SpeakerSegment, TranscriptSegment, UNKNOWN_SPEAKER

log = get_logger("align")


def overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


# START_CONTRACT: align
#   PURPOSE: For each text segment, pick the speaker with the largest total overlap.
#   INPUTS: { text_segments: list[TranscriptSegment], spk_segments: list[SpeakerSegment] }
#   OUTPUTS: { list[TranscriptSegment] - copies with .speaker assigned }
#   SIDE_EFFECTS: none (pure)
#   LINKS: M-ALIGN
# END_CONTRACT: align
def align(
    text_segments: list[TranscriptSegment],
    spk_segments: list[SpeakerSegment],
) -> list[TranscriptSegment]:
    out: list[TranscriptSegment] = []
    for t in text_segments:
        # START_BLOCK_ASSIGN_SPEAKER
        totals: dict[str, float] = {}
        for s in spk_segments:
            ov = overlap(t.start, t.end, s.start, s.end)
            if ov > 0:
                totals[s.speaker] = totals.get(s.speaker, 0.0) + ov
        speaker = max(totals, key=totals.__getitem__) if totals else UNKNOWN_SPEAKER
        out.append(t.model_copy(update={"speaker": speaker}))
        # END_BLOCK_ASSIGN_SPEAKER
    unknown = sum(1 for s in out if s.speaker == UNKNOWN_SPEAKER)
    log.info(mark("Align", "align", "BLOCK_ASSIGN_SPEAKER", f"segments={len(out)} unknown={unknown}"))
    return out
