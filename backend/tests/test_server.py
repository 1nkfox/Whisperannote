# Verifies M-SERVER (V-M-SERVER): auth gate, routes, queue wiring, WS auth (fake runner; no GPU).
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.models import TranscriptionResult
from backend.models_registry import DEFAULT_MODEL
from backend.server import create_app

AUTH = {"Authorization": "Bearer test-secret"}


def _fake_runner(job, cancel_event, on_stage, on_progress):
    return TranscriptionResult(task_id=job.task_id, file_name="f", output_files={"json": "/x.json"})


def _client(test_config):
    return TestClient(create_app(config=test_config, runner=_fake_runner))


def test_requires_auth(test_config):
    with _client(test_config) as c:
        assert c.get("/api/models").status_code == 401
        assert c.get("/api/models", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_health_and_models(test_config):
    with _client(test_config) as c:
        h = c.get("/api/health", headers=AUTH)
        assert h.status_code == 200
        assert h.json()["cuda_available"] is False  # no torch in test env
        m = c.get("/api/models", headers=AUTH).json()
        assert DEFAULT_MODEL in m["available"]


def test_queue_enqueue_and_status(test_config):
    with _client(test_config) as c:
        r = c.post("/api/queue", headers=AUTH, json={"file_path": "/tmp/x.mp3"})
        assert r.status_code == 200
        task_id = r.json()["task_id"]
        assert r.json()["status"] in ("queued", "transcribing", "completed")
        statuses = c.get("/api/queue/status", headers=AUTH).json()
        assert any(t["task_id"] == task_id for t in statuses)


def test_cancel_unknown_returns_404(test_config):
    with _client(test_config) as c:
        assert c.delete("/api/queue/nope", headers=AUTH).status_code == 404


def test_upload_transcribe(test_config):
    with _client(test_config) as c:
        r = c.post(
            "/api/transcribe",
            headers=AUTH,
            files={"file": ("a.mp3", b"\x00\x01", "audio/mpeg")},
            data={"language": "ru"},
        )
        assert r.status_code == 200
        assert r.json()["file_name"] == "a.mp3"


def test_ws_rejects_bad_token(test_config):
    with _client(test_config) as c:
        with pytest.raises(WebSocketDisconnect):
            with c.websocket_connect("/ws/progress/t1?token=bad"):
                pass


def test_ws_accepts_good_token(test_config):
    with _client(test_config) as c:
        with c.websocket_connect("/ws/progress/t1?token=test-secret") as ws:
            assert ws is not None
