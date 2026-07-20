"""End-to-end integration tests over real (test) WebSockets and HTTP.

Unlike test_hub.py (FakeWS, unit-level), these drive the actual FastAPI app
via fastapi.testclient.TestClient: real ASGI request/response cycles and real
(in-process) WebSocket sessions. `_drain`/`_wait_for` are small bounded
readers so a test never blocks forever waiting on a frame the server will
never send.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from sketch_party.app import create_app


def _drain(ws: Any, count: int) -> list[dict[str, Any]]:
    """Read and discard exactly `count` frames (caller knows how many are pending)."""
    return [ws.receive_json() for _ in range(count)]


def _wait_for(ws: Any, msg_type: str, max_frames: int = 10) -> dict[str, Any]:
    """Read frames until one of `msg_type` appears; fail if not seen in time."""
    for _ in range(max_frames):
        msg = ws.receive_json()
        if msg["type"] == msg_type:
            return msg  # type: ignore[no-any-return]
    raise AssertionError(f"did not observe a {msg_type!r} frame within {max_frames} frames")


def test_healthz() -> None:
    with TestClient(create_app()) as client:
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


def test_create_room_and_play_a_turn() -> None:
    app = create_app()
    with TestClient(app) as client:
        code = client.post("/rooms", json={"rounds": 1, "turnSeconds": 240}).json()["code"]

        with (
            client.websocket_connect(f"/ws/{code}") as d,
            client.websocket_connect(f"/ws/{code}") as g,
        ):
            d.send_json({"type": "join", "name": "Drawer"})
            g.send_json({"type": "join", "name": "Guesser"})
            # d: its own roomState + playerJoined (about Guesser). g: its own roomState.
            _drain(d, 2)
            _drain(g, 1)

            d.send_json({"type": "startGame"})
            choices = _wait_for(d, "wordChoices")["choices"]
            assert len(choices) >= 1

            d.send_json({"type": "chooseWord", "word": choices[0]})
            started = _wait_for(d, "turnStarted")
            word = started["word"]
            assert word is not None

            g.send_json({"type": "guess", "text": word})
            result = _wait_for(g, "guessResult")
            assert result["result"] == "correct"
            assert result["points"] == 10


def test_connect_to_missing_room_closes_socket() -> None:
    app = create_app()
    with (
        TestClient(app) as client,
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/ws/ZZZZ"),
    ):
        pass


def test_disallowed_origin_closes_socket() -> None:
    app = create_app()
    with TestClient(app) as client:
        code = client.post("/rooms", json={}).json()["code"]
        with (
            pytest.raises(WebSocketDisconnect),
            client.websocket_connect(
                f"/ws/{code}", headers={"origin": "https://not-allowed.example"}
            ),
        ):
            pass


def test_create_room_rate_limited() -> None:
    app = create_app()
    with TestClient(app) as client:
        statuses = [client.post("/rooms", json={}).status_code for _ in range(11)]
        assert 429 in statuses
