# FILE: backend/config.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Load backend configuration from environment: port, host, shared secret token,
#            HF token, model cache dir, and allowed file roots for path validation.
#   SCOPE: BackendConfig, load_config
#   DEPENDS: M-SCHEMAS
#   LINKS: M-BACKEND-CONFIG, V-M-BACKEND-CONFIG
#   ROLE: CONFIG
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   BackendConfig - resolved configuration
#   load_config - read and validate config from os.environ (requires BACKEND_TOKEN)
# END_MODULE_MAP
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field

from .logging_setup import get_logger, mark
from .models import AppError, ErrorCode

log = get_logger("config")


@dataclass
class BackendConfig:
    host: str = "127.0.0.1"
    port: int = 8777
    secret_token: str = ""
    hf_token: str | None = None
    model_cache_dir: str = "./backend/models"
    allowed_roots: list[str] = field(default_factory=list)

    @property
    def temp_dir(self) -> str:
        return tempfile.gettempdir()


# START_CONTRACT: load_config
#   PURPOSE: Build BackendConfig from env; the shared secret token is mandatory.
#   INPUTS: { env: Mapping[str,str] | None - defaults to os.environ }
#   OUTPUTS: { BackendConfig - validated config }
#   SIDE_EFFECTS: reads os.environ
#   LINKS: M-BACKEND-CONFIG
# END_CONTRACT: load_config
def load_config(env: dict[str, str] | None = None) -> BackendConfig:
    env = dict(os.environ) if env is None else env
    # START_BLOCK_LOAD
    secret = (env.get("BACKEND_TOKEN") or "").strip()
    if not secret:
        # Electron main always injects BACKEND_TOKEN; absence is a hard config error.
        raise AppError(ErrorCode.MISSING_SECRET_TOKEN, "BACKEND_TOKEN is required (injected by Electron main)")
    roots = [p for p in (env.get("ALLOWED_ROOTS") or "").split(os.pathsep) if p.strip()]
    cfg = BackendConfig(
        host=env.get("BACKEND_HOST", "127.0.0.1"),
        port=int(env.get("BACKEND_PORT", "8777")),
        secret_token=secret,
        hf_token=(env.get("HUGGINGFACE_HUB_TOKEN") or None),
        model_cache_dir=env.get("MODEL_CACHE_DIR", "./backend/models"),
        allowed_roots=roots,
    )
    # Never log the secret or HF token values.
    log.info(mark("Config", "load_config", "BLOCK_LOAD", f"host={cfg.host} port={cfg.port} roots={len(roots)}"))
    # END_BLOCK_LOAD
    return cfg
