"""Live updates over a WebSocket, so open chats change without reloading.

The browser connects to  ws://localhost:8000/api/v1/ws?token=<access token>  and receives JSON events such as
  {"type": "message.new", "thread_id": "c1", "message": {...}}
  {"type": "message.updated", "thread_id": "c1", "message": {...}}   (deleted, reaction or restored)
  {"type": "thread.read", "thread_id": "c1", "user_id": 3}
The REST endpoints stay the source of truth: on reconnect, re-fetch /threads.

This keeps connections in memory, which works for one server process. With several processes or servers,
publish the events through Redis (or similar) instead.
"""
import asyncio
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import Session

from app.auth import user_from_token
from app.db import engine


class Hub:
    def __init__(self) -> None:
        self.sockets: dict[int, set[WebSocket]] = defaultdict(set)
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        self.loop = asyncio.get_running_loop()
        await ws.accept()
        self.sockets[user_id].add(ws)

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        self.sockets[user_id].discard(ws)

    async def _send(self, user_ids: list[int], event: dict) -> None:
        for uid in user_ids:
            for ws in list(self.sockets.get(uid, ())):
                try:
                    await ws.send_json(event)
                except Exception:  # a closed tab; forget it
                    self.disconnect(uid, ws)

    def notify(self, user_ids: list[int], event: dict) -> None:
        """Send an event to every open tab of these users. Safe to call from normal (sync) route handlers."""
        if not self.loop or not any(self.sockets.get(u) for u in user_ids):
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            self.loop.create_task(self._send(user_ids, event))
        else:  # sync routes run in a worker thread
            asyncio.run_coroutine_threadsafe(self._send(user_ids, event), self.loop)


hub = Hub()
router = APIRouter(tags=["realtime"])


@router.websocket("/ws")
async def websocket(ws: WebSocket, token: str = ""):
    with Session(engine) as db:
        user = user_from_token(token, db)
    if not user:
        await ws.close(code=4401, reason="Not signed in")
        return
    await hub.connect(user.id, ws)
    try:
        while True:
            if (await ws.receive_text()) == "ping":  # keep-alive from the browser
                await ws.send_text("pong")
    except WebSocketDisconnect:
        hub.disconnect(user.id, ws)
