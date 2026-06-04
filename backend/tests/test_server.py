# FILE: backend/tests/test_server.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Verify M-SERVER auth gate, health/models routes, queue wiring, upload endpoint, and WS auth.
#   SCOPE: FastAPI TestClient checks with a fake runner and deterministic health monkeypatching; no real model inference.
#   DEPENDS: backend/server.py, backend/models.py, pytest, fastapi.testclient
#   LINKS: M-SERVER, V-M-SERVER
#   ROLE: TEST
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   _fake_runner - fake transcription runner for queue/upload route tests.
#   _client - TestClient factory with injected config and fake runner.
#   test_health_and_models - deterministic health/models route check independent of host CUDA.
# END_MODULE_MAP
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


def test_health_and_models(test_config, monkeypatch):
    # START_BLOCK_DETERMINISTIC_HEALTH
    class FakeCuda:
        @staticmethod
        def is_available():
            return False

        @staticmethod
        def device_count():
            return 0

    class FakeTorch:
        cuda = FakeCuda()

    monkeypatch.setitem(__import__("sys").modules, "torch", FakeTorch())

    with _client(test_config) as c:
        h = c.get("/api/health", headers=AUTH)
        assert h.status_code == 200
        assert h.json()["cuda_available"] is False
        m = c.get("/api/models", headers=AUTH).json()
        assert DEFAULT_MODEL in m["available"]
    # END_BLOCK_DETERMINISTIC_HEALTH


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


# START_CHANGE_SUMMARY
#   LAST_CHANGE: v1.1.0 - Made health route tests deterministic when backend tests run inside a CUDA-enabled venv.
# END_CHANGE_SUMMARY
