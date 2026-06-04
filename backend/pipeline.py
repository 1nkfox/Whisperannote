# FILE: backend/pipeline.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Orchestrate one transcription job: validate -> extract WAV -> diarize -> transcribe ->
#            align -> apply speaker names -> write outputs, cleaning up temp artifacts.
#   SCOPE: build_full_text, run
#   DEPENDS: M-FFMPEG, M-DIARIZE, M-TRANSCRIBE, M-ALIGN, M-FORMAT, M-SCHEMAS
#   LINKS: M-PIPELINE, V-M-PIPELINE
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   build_full_text - join aligned segments into a "Speaker: text" transcript
#   run - synchronous end-to-end pipeline (designed to run inside a worker thread)
# END_MODULE_MAP
from __future__ import annotations

import os
from typing import Any, Callable, Optional

from .align import align
from .formatters import write_outputs
from .logging_setup import get_logger, mark
from .models import AppError, ErrorCode, TranscriptionResult
from .utils import cleanup, extract_wav, new_workdir, probe_duration, validate_path

log = get_logger("pipeline")

StageCb = Optional[Callable[[str], None]]
ProgressCb = Optional[Callable[[int, str], None]]


def build_full_text(segments, speaker_names: dict[str, str]) -> str:
    lines = []
    for seg in segments:
        name = speaker_names.get(seg.speaker, seg.speaker)
        lines.append(f"{name}: {seg.text}".strip())
    return "\n".join(lines)


def _emit(stage_cb: StageCb, progress_cb: ProgressCb, stage: str, pct: int, msg: str) -> None:
    if stage_cb:
        stage_cb(stage)
    if progress_cb:
        progress_cb(pct, msg)


# START_CONTRACT: run
#   PURPOSE: Execute the full pipeline for a job using pre-loaded diarizer/transcriber.
#   INPUTS: { job: TranscribeJob, diarizer, transcriber, allowed_roots, out_dir,
#             temp_base?, cancel_event?, on_stage?, on_progress? }
#   OUTPUTS: { TranscriptionResult }
#   SIDE_EFFECTS: ffmpeg + GPU inference + writes output files; cleans temp workdir
#   SECURITY: both src (job.file_path) AND out_dir are validated against allowed_roots before any read/write,
#             so a crafted output_dir cannot write transcripts outside the allowed folders (PATH_NOT_ALLOWED).
#   LINKS: M-PIPELINE, M-FFMPEG
# END_CONTRACT: run
def run(
    job,
    diarizer,
    transcriber,
    *,
    allowed_roots: list[str],
    out_dir: str,
    temp_base: Optional[str] = None,
    cancel_event: Any = None,
    on_stage: StageCb = None,
    on_progress: ProgressCb = None,
) -> TranscriptionResult:
    src = validate_path(job.file_path, allowed_roots)
    # CONTRACT(SECURITY): out_dir must also be validated against allowed_roots before write_outputs() — coder to add.
    work = new_workdir(temp_base)
    # START_BLOCK_RUN_PIPELINE
    try:
        _emit(on_stage, on_progress, "converting", 5, "Конвертация аудио")
        wav = extract_wav(src, work)
        try:
            duration = probe_duration(wav)
        except Exception:
            duration = 0.0

        _emit(on_stage, on_progress, "diarizing", 15, "Определение спикеров")
        spk_segments = diarizer.diarize(wav, job.num_speakers)

        _emit(on_stage, on_progress, "transcribing", 40, "Распознавание речи")
        def _tp(frac: float) -> None:
            if on_progress:
                on_progress(40 + int(frac * 50), "Распознавание речи")

        text_segments, dur2, language = transcriber.transcribe(
            wav, language=job.language, cancel_event=cancel_event, progress_cb=_tp
        )
        duration = duration or dur2

        aligned = align(text_segments, spk_segments)

        _emit(on_stage, on_progress, "formatting", 92, "Экспорт результатов")
        result = TranscriptionResult(
            task_id=job.task_id,
            file_name=os.path.basename(src),
            language=language,
            duration_sec=duration,
            segments=aligned,
            full_text=build_full_text(aligned, job.speaker_names),
            speaker_names=dict(job.speaker_names),
        )
        result.output_files = write_outputs(result, job.output_formats, out_dir)

        if on_progress:
            on_progress(100, "Готово")
        log.info(
            mark("Pipeline", "run", "BLOCK_RUN_PIPELINE", f"task={job.task_id} segments={len(aligned)}")
        )
        return result
    except AppError:
        raise
    except Exception as e:  # normalize anything unexpected
        raise AppError(ErrorCode.PIPELINE_FAILED, str(e)) from e
    finally:
        cleanup(work)
    # END_BLOCK_RUN_PIPELINE
