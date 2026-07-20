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


@pytest.mark.timeout(8)
def test_binary_frame_from_guesser_does_not_leave_ghost_connection() -> None:
    """Regression: a non-text frame must not crash the ws loop past cleanup.

    `websocket.receive_text()` raises a bare `KeyError` (not
    `WebSocketDisconnect`) when the client sends a binary frame. Before the
    fix, that KeyError propagated straight out of the endpoint, skipping
    `hub.handle_disconnect` entirely: the sender stayed registered in
    `ConnectionManager` and the player stayed `connected=True` in the
    `Room` - a ghost seat other clients are never told about (no
    `playerLeft` is ever broadcast). This test proves the drawer DOES
    receive `playerLeft` for the guesser after the guesser sends a binary
    frame, which is only possible if `handle_disconnect` ran. Bounded by a
    tight per-test timeout: pre-fix, the drawer never receives another
    frame at all, so `_wait_for` blocks forever without it.

    The fix re-raises after cleanup ("before propagating" per the crash
    still being real and worth surfacing to the ASGI server/logs), so the
    guesser's own `websocket_connect` context still surfaces that KeyError
    when it exits (`TestClient` replays the crashed task's exception at
    `__exit__`) - that is expected and asserted here, not swallowed.
    """
    app = create_app()
    with TestClient(app) as client:
        code = client.post("/rooms", json={"rounds": 1, "turnSeconds": 240}).json()["code"]

        with client.websocket_connect(f"/ws/{code}") as d:
            d.send_json({"type": "join", "name": "Drawer"})

            with (
                pytest.raises(KeyError),
                client.websocket_connect(f"/ws/{code}") as g,
            ):
                g.send_json({"type": "join", "name": "Guesser"})
                _drain(d, 2)
                _drain(g, 1)

                d.send_json({"type": "startGame"})
                choices = _wait_for(d, "wordChoices")["choices"]
                d.send_json({"type": "chooseWord", "word": choices[0]})
                _wait_for(d, "turnStarted")

                # Guesser misbehaves: a binary frame, not JSON text.
                g.send_bytes(b"\x00\x01\x02")

            # If handle_disconnect ran before the crash propagated, the
            # drawer is told the guesser left.
            left = _wait_for(d, "playerLeft", max_frames=10)
            assert left["playerId"]


def test_join_rejected_by_room_error_closes_with_distinct_code() -> None:
    """A RoomError during the join handshake (e.g. duplicate player id) must
    close with a different code (4409) than a malformed first message
    (4400), so a future client can tell "rejected" apart from "garbled"."""
    app = create_app()
    with TestClient(app) as client:
        code = client.post("/rooms", json={}).json()["code"]
        with client.websocket_connect(f"/ws/{code}") as a:
            a.send_json({"type": "join", "name": "Alex", "playerId": "dup"})
            _wait_for(a, "roomState")

            with client.websocket_connect(f"/ws/{code}") as b:
                b.send_json({"type": "join", "name": "AlexAgain", "playerId": "dup"})
                error = b.receive_json()
                assert error["type"] == "error"
                with pytest.raises(WebSocketDisconnect) as excinfo:
                    b.receive_text()
                assert excinfo.value.code == 4409
