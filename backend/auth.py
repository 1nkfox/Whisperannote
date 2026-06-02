# FILE: backend/auth.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Shared-secret auth (Authorization: Bearer) for all HTTP/WS plus a CORS allowlist
#            restricted to the Electron renderer origin.
#   SCOPE: parse_bearer, verify_token, require_token, ws_authorized, add_cors
#   DEPENDS: M-BACKEND-CONFIG
#   LINKS: M-AUTH, V-M-AUTH
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   parse_bearer - extract token from an Authorization header value
#   verify_token - constant-time comparison of token vs secret
#   require_token - FastAPI dependency raising 401 on bad/missing token
#   ws_authorized - WebSocket variant returning bool
#   add_cors - install CORS middleware limited to allowed origins
# END_MODULE_MAP
from __future__ import annotations

import hmac
from typing import Optional

from fastapi import HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .logging_setup import get_logger, mark

log = get_logger("auth")


def parse_bearer(header: Optional[str]) -> Optional[str]:
    if not header:
        return None
    parts = header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def verify_token(token: Optional[str], secret: str) -> bool:
    if not token or not secret:
        return False
    return hmac.compare_digest(token, secret)


# START_CONTRACT: require_token
#   PURPOSE: FastAPI dependency that authorizes a request via the shared secret.
#   INPUTS: { request: Request - carries app.state.config.secret_token }
#   OUTPUTS: { None - or raises HTTPException(401) }
#   SIDE_EFFECTS: none (reads header)
#   LINKS: M-AUTH
# END_CONTRACT: require_token
async def require_token(request: Request) -> None:
    secret = request.app.state.config.secret_token
    token = parse_bearer(request.headers.get("authorization"))
    # START_BLOCK_VERIFY_TOKEN
    if not verify_token(token, secret):
        log.warning(mark("Auth", "require_token", "BLOCK_VERIFY_TOKEN", "rejected request"))
        raise HTTPException(status_code=401, detail="unauthorized")
    # END_BLOCK_VERIFY_TOKEN


async def ws_authorized(ws: WebSocket, secret: str) -> bool:
    # Accept token from header or ?token= query (browsers cannot set WS headers).
    token = parse_bearer(ws.headers.get("authorization")) or ws.query_params.get("token")
    # START_BLOCK_VERIFY_TOKEN
    ok = verify_token(token, secret)
    if not ok:
        log.warning(mark("Auth", "ws_authorized", "BLOCK_VERIFY_TOKEN", "rejected ws"))
    return ok
    # END_BLOCK_VERIFY_TOKEN


def add_cors(app, origins: list[str]) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
