# Verifies M-PROGRESS (V-M-PROGRESS): per-task isolation, safe sends, disconnect.
import pytest

from backend.tests.conftest import FakeWS
from backend.websocket_manager import ProgressManager


async def test_connect_and_send():
    pm = ProgressManager()
    ws = FakeWS()
    await pm.connect("t1", ws)
    assert ws.accepted is True
    await pm.send_progress("t1", {"type": "progress", "percent": 10})
    assert ws.sent == [{"type": "progress", "percent": 10}]


async def test_send_to_missing_task_is_noop():
    pm = ProgressManager()
    await pm.send_progress("ghost", {"x": 1})  # must not raise


async def test_task_isolation():
    pm = ProgressManager()
    a, b = FakeWS(), FakeWS()
    await pm.connect("a", a)
    await pm.connect("b", b)
    await pm.progress("a", 42)
    assert len(a.sent) == 1 and a.sent[0]["percent"] == 42
    assert b.sent == []  # message never leaked to the other task


async def test_disconnect_then_send():
    pm = ProgressManager()
    ws = FakeWS()
    await pm.connect("t1", ws)
    pm.disconnect("t1")
    await pm.send_progress("t1", {"x": 1})  # no throw
    assert ws.sent == []
