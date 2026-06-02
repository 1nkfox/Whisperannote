# FILE: backend/websocket_manager.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: One-directional WebSocket progress fan-out keyed by task_id (server -> client).
#   SCOPE: ProgressManager(connect, disconnect, send_progress, stage, progress, log, complete, error)
#   DEPENDS: M-AUTH
#   LINKS: M-PROGRESS, V-M-PROGRESS
#   ROLE: RUNTIME
#   MAP_MODE: EXPORTS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   ProgressManager - task_id -> WebSocket registry with safe per-task sends
# END_MODULE_MAP
from __future__ import annotations

from typing import Any

from .logging_setup import get_logger, mark

log = get_logger("progress")


class ProgressManager:
    def __init__(self) -> None:
        self._conns: dict[str, Any] = {}

    async def connect(self, task_id: str, ws: Any) -> None:
        await ws.accept()
        self._conns[task_id] = ws

    def disconnect(self, task_id: str) -> None:
        self._conns.pop(task_id, None)

    # START_CONTRACT: send_progress
    #   PURPOSE: Deliver a JSON message only to the socket subscribed for task_id.
    #   INPUTS: { task_id: str, data: dict }
    #   OUTPUTS: { None }
    #   SIDE_EFFECTS: sends over a WebSocket if present; never raises on missing/broken socket
    #   LINKS: M-PROGRESS
    # END_CONTRACT: send_progress
    async def send_progress(self, task_id: str, data: dict) -> None:
        # START_BLOCK_SEND
        ws = self._conns.get(task_id)
        if ws is None:
            return
        try:
            await ws.send_json(data)
        except Exception:  # broken pipe / closed socket must not crash the pipeline
            log.warning(mark("Progress", "send_progress", "BLOCK_SEND", "drop: socket closed"))
            self.disconnect(task_id)
        # END_BLOCK_SEND

    # Convenience builders that map onto the WSMessage shape.
    async def stage(self, task_id: str, stage: str) -> None:
        await self.send_progress(task_id, {"type": "stage", "stage": stage})

    async def progress(self, task_id: str, percent: int, message: str = "") -> None:
        await self.send_progress(task_id, {"type": "progress", "percent": percent, "message": message})

    async def log(self, task_id: str, message: str) -> None:
        await self.send_progress(task_id, {"type": "log", "message": message})

    async def complete(self, task_id: str, output_files: dict, duration_sec: float) -> None:
        await self.send_progress(
            task_id, {"type": "complete", "output_files": output_files, "duration_sec": duration_sec}
        )

    async def error(self, task_id: str, message: str) -> None:
        await self.send_progress(task_id, {"type": "error", "message": message})
