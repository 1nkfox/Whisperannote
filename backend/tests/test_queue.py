# FILE: backend/tests/test_queue.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Verify M-QUEUE single-worker processing, progress completion, and cancellation behavior.
#   SCOPE: Async QueueManager tests with fake progress manager and fake runners; no real ML work.
#   DEPENDS: backend/queue_manager.py, backend/models.py, backend/tests/conftest.py
#   LINKS: M-QUEUE, V-M-QUEUE
#   ROLE: TEST
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   _wait_status - wait for a task status transition.
#   _wait_event - wait for async fake progress delivery.
#   test_queue_runs_job_to_completion - completion result and progress event contract.
#   test_queue_cancel_running_job - running cancellation contract.
#   test_queue_cancel_queued_job - queued cancellation contract.
# END_MODULE_MAP
import asyncio
import threading
import time

import pytest

from backend.models import AppError, ErrorCode, TaskStatus, TranscribeJob, TranscriptionResult
from backend.queue_manager import QueueManager
from backend.tests.conftest import FakeProgress


async def _wait_status(qm, task_id, status, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        info = qm.get(task_id)
        if info and info.status == status:
            return
        await asyncio.sleep(0.02)
    raise AssertionError(f"{task_id} -> {qm.get(task_id).status if qm.get(task_id) else None}, expected {status}")


async def _wait_event(progress, event, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if event in progress.events:
            return
        await asyncio.sleep(0.02)
    raise AssertionError(f"event {event!r} not emitted; got {progress.events!r}")


async def test_queue_runs_job_to_completion():
    def runner(job, ce, on_stage, on_progress):
        on_stage("transcribing")
        on_progress(50, "half")
        return TranscriptionResult(task_id=job.task_id, file_name="f", output_files={"json": "/x.json"}, duration_sec=1.0)

    prog = FakeProgress()
    qm = QueueManager(runner, prog)
    await qm.start()
    try:
        qm.enqueue(TranscribeJob(task_id="a", file_path="/tmp/f.mp3"))
        await _wait_status(qm, "a", TaskStatus.completed)
        assert qm.get("a").result is not None
        assert qm.get("a").progress_percent == 100
        await _wait_event(prog, ("complete", "a", {"json": "/x.json"}))
        assert qm.processing is False
    finally:
        await qm.stop()


# START_CHANGE_SUMMARY
#   LAST_CHANGE: v1.1.0 - Wait for async completion progress delivery to avoid CUDA-venv timing flakes.
# END_CHANGE_SUMMARY


async def test_queue_cancel_running_job():
    started = threading.Event()

    def runner(job, ce, on_stage, on_progress):
        on_stage("transcribing")
        started.set()
        while not ce.wait(0.01):
            pass
        raise AppError(ErrorCode.CANCELLED, "")

    qm = QueueManager(runner, FakeProgress())
    await qm.start()
    try:
        qm.enqueue(TranscribeJob(task_id="b", file_path="/tmp/x"))
        for _ in range(300):
            if started.is_set():
                break
            await asyncio.sleep(0.01)
        assert started.is_set()
        assert qm.cancel("b") is True
        await _wait_status(qm, "b", TaskStatus.cancelled)
    finally:
        await qm.stop()


async def test_queue_cancel_queued_job():
    release = threading.Event()

    def runner(job, ce, on_stage, on_progress):
        if job.task_id == "first":
            release.wait(3.0)  # hold the worker so "second" stays queued
        return TranscriptionResult(task_id=job.task_id, file_name="f")

    qm = QueueManager(runner, FakeProgress())
    await qm.start()
    try:
        qm.enqueue(TranscribeJob(task_id="first", file_path="/x"))
        await asyncio.sleep(0.1)  # let the worker pick up "first"
        qm.enqueue(TranscribeJob(task_id="second", file_path="/y"))
        assert qm.cancel("second") is True
        assert qm.get("second").status == TaskStatus.cancelled
        release.set()
        await _wait_status(qm, "first", TaskStatus.completed)
    finally:
        await qm.stop()
