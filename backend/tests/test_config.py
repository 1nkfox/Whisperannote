# Verifies M-BACKEND-CONFIG (V-M-BACKEND-CONFIG): env loading + mandatory secret token.
import os

import pytest

from backend.config import load_config
from backend.models import AppError, ErrorCode


def test_missing_token_raises():
    with pytest.raises(AppError) as ei:
        load_config(env={})
    assert ei.value.code == ErrorCode.MISSING_SECRET_TOKEN


def test_defaults_applied():
    cfg = load_config(env={"BACKEND_TOKEN": "s"})
    assert cfg.host == "127.0.0.1"
    assert cfg.port == 8777
    assert cfg.hf_token is None
    assert cfg.allowed_roots == []


def test_full_env_parsed():
    cfg = load_config(
        env={
            "BACKEND_TOKEN": "secret",
            "BACKEND_HOST": "0.0.0.0",
            "BACKEND_PORT": "9000",
            "HUGGINGFACE_HUB_TOKEN": "hf_xxx",
            "MODEL_CACHE_DIR": "/models",
            "ALLOWED_ROOTS": os.pathsep.join(["/a", "/b"]),
        }
    )
    assert cfg.port == 9000
    assert cfg.host == "0.0.0.0"
    assert cfg.hf_token == "hf_xxx"
    assert cfg.model_cache_dir == "/models"
    assert cfg.allowed_roots == ["/a", "/b"]
