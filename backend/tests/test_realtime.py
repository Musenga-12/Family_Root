"""Tests for WebSocket connections and real-time event delivery."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock

import pytest
from starlette.websockets import WebSocketDisconnect

from app.realtime import Hub, hub
from helpers import API, login


@pytest.fixture(autouse=True)
def clean_global_hub():
    """Prevent WebSocket connections from leaking between tests."""
    hub.sockets.clear()
    hub.loop = None
    yield
    hub.sockets.clear()
    hub.loop = None


def test_connect_and_disconnect():
    async def scenario():
        test_hub = Hub()
        ws = AsyncMock()

        await test_hub.connect(7, ws)

        ws.accept.assert_awaited_once()
        assert ws in test_hub.sockets[7]

        test_hub.disconnect(7, ws)
        assert ws not in test_hub.sockets[7]

    asyncio.run(scenario())


def test_send_delivers_event_to_selected_users():
    async def scenario():
        test_hub = Hub()
        mary_socket = AsyncMock()
        james_socket = AsyncMock()
        sarah_socket = AsyncMock()
        event = {"type": "message.new", "thread_id": "c1"}

        test_hub.sockets[1].add(mary_socket)
        test_hub.sockets[2].add(james_socket)
        test_hub.sockets[3].add(sarah_socket)

        await test_hub._send([1, 2], event)

        mary_socket.send_json.assert_awaited_once_with(event)
        james_socket.send_json.assert_awaited_once_with(event)
        sarah_socket.send_json.assert_not_awaited()

    asyncio.run(scenario())


def test_send_removes_socket_when_delivery_fails():
    async def scenario():
        test_hub = Hub()
        broken_socket = AsyncMock()
        broken_socket.send_json.side_effect = RuntimeError("Connection closed")

        test_hub.sockets[7].add(broken_socket)

        await test_hub._send([7], {"type": "message.new"})

        assert broken_socket not in test_hub.sockets[7]

    asyncio.run(scenario())


def test_notify_does_nothing_without_event_loop():
    test_hub = Hub()
    ws = AsyncMock()
    test_hub.sockets[1].add(ws)

    test_hub.notify([1], {"type": "message.new"})

    ws.send_json.assert_not_called()


def test_notify_schedules_delivery_on_same_event_loop():
    async def scenario():
        test_hub = Hub()
        ws = AsyncMock()
        event = {"type": "message.new"}

        test_hub.loop = asyncio.get_running_loop()
        test_hub.sockets[1].add(ws)

        test_hub.notify([1], event)
        await asyncio.sleep(0)

        ws.send_json.assert_awaited_once_with(event)

    asyncio.run(scenario())


def test_notify_schedules_delivery_from_another_thread():
    async def scenario():
        test_hub = Hub()
        ws = AsyncMock()
        event = {"type": "message.new"}

        test_hub.loop = asyncio.get_running_loop()
        test_hub.sockets[1].add(ws)

        with ThreadPoolExecutor(max_workers=1) as executor:
            await asyncio.get_running_loop().run_in_executor(
                executor,
                test_hub.notify,
                [1],
                event,
            )

        await asyncio.sleep(0)
        ws.send_json.assert_awaited_once_with(event)

    asyncio.run(scenario())


def test_websocket_rejects_invalid_token(client):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"{API}/ws?token=invalid-token"):
            pass

    assert exc.value.code == 4401


def test_websocket_accepts_valid_token_and_answers_ping(client):
    response = login(client, "mary@example.com")
    assert response.status_code == 200

    token = response.json()["access_token"]

    with client.websocket_connect(f"{API}/ws?token={token}") as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"

    assert all(not sockets for sockets in hub.sockets.values())
