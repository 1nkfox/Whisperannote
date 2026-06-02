# Verifies M-MODELS (V-M-MODELS): catalog, cache detection, unknown-model error.
import os

import pytest

from backend.models import AppError, ErrorCode
from backend.models_registry import (
    DEFAULT_MODEL,
    WHISPER_REPOS,
    download_model,
    is_downloaded,
    list_models,
)


def test_list_models_fresh_cache(tmp_path):
    av = list_models(str(tmp_path))
    assert DEFAULT_MODEL in av.available
    assert av.downloaded == []
    assert av.current == DEFAULT_MODEL


def test_is_downloaded_detects_cache_slug(tmp_path):
    assert is_downloaded(DEFAULT_MODEL, str(tmp_path)) is False
    slug = "models--" + WHISPER_REPOS[DEFAULT_MODEL].replace("/", "--")
    (tmp_path / slug).mkdir()
    assert is_downloaded(DEFAULT_MODEL, str(tmp_path)) is True
    assert DEFAULT_MODEL in list_models(str(tmp_path)).downloaded


def test_download_unknown_model_raises(tmp_path):
    with pytest.raises(AppError) as ei:
        download_model("does-not-exist", str(tmp_path))
    assert ei.value.code == ErrorCode.MODEL_DOWNLOAD_FAILED
