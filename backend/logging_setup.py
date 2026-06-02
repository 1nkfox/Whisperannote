# FILE: backend/logging_setup.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Structured logging helper producing "[Module][function][BLOCK]" markers.
#   SCOPE: get_logger, mark
#   DEPENDS: none
#   LINKS: technology.xml Observability
#   ROLE: CONFIG
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   get_logger - namespaced logger factory
#   mark - build a "[Module][fn][BLOCK] message" marker string (grep-stable evidence)
# END_MODULE_MAP
from __future__ import annotations

import logging
import sys

_CONFIGURED = False


def _configure() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    root = logging.getLogger("whisperannote")
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    root.propagate = False
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    _configure()
    return logging.getLogger(f"whisperannote.{name}")


def mark(module: str, fn: str, block: str, msg: str = "") -> str:
    """Return a grep-stable log marker. Never embed secrets in `msg`."""
    base = f"[{module}][{fn}][{block}]"
    return f"{base} {msg}" if msg else base
