"""FastAPI app: HTTP + WebSocket transport wiring for Sketch Party.

`create_app()` is a factory (not a module-level singleton) so each caller,
including each test, gets its own `Settings`, `RoomManager`, `ConnectionManager`,
and `GameHub`. That keeps rooms and rate-limit counters from leaking between
test cases or between an app instance and a would-be reload.
"""

from __future__ import annotations

import json
import random
import time

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, ValidationError
from pydantic.alias_generators import to_camel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.websockets import WebSocketDisconnect

from sketch_party.config import Settings
from sketch_party.hub import GameHub
from sketch_party.manager import ConnectionManager, RoomManager
from sketch_party.models import RoomSettings
from sketch_party.protocol import (
    ChooseWordMsg,
    ClientMessage,
    ErrorMsg,
    GuessMsg,
    JoinMsg,
    PlayAgainMsg,
    StartGameMsg,
    client_adapter,
    dump,
)
from sketch_party.room import RoomError

_MIN_ROUNDS = 1
_MAX_ROUNDS = 5
_MIN_TURN_SECONDS = 30
_MAX_TURN_SECONDS = 600

# Non-standard WebSocket close codes (4000-4999 is the app-defined range).
_CLOSE_ORIGIN_NOT_ALLOWED = 4403
_CLOSE_ROOM_NOT_FOUND = 4404
_CLOSE_BAD_FIRST_MESSAGE = 4400


class CreateRoomBody(BaseModel):
    """POST /rooms body: both fields optional, camelCase on the wire."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    rounds: int | None = None
    turn_seconds: int | None = None


async def _dispatch(hub: GameHub, code: str, player_id: str, msg: ClientMessage) -> None:
    """Route one already-parsed client message to the matching hub handler."""
    if isinstance(msg, StartGameMsg):
        await hub.handle_start(code, player_id)
    elif isinstance(msg, ChooseWordMsg):
        await hub.handle_choose_word(code, player_id, msg.word)
    elif isinstance(msg, GuessMsg):
        await hub.handle_guess(code, player_id, msg.text)
    elif isinstance(msg, PlayAgainMsg):
        await hub.handle_play_again(code, player_id)
    elif isinstance(msg, JoinMsg):
        raise RoomError("already joined")


def create_app() -> FastAPI:
    """Build a fresh FastAPI app with its own settings, managers, and hub."""
    settings = Settings()
    room_manager = RoomManager(settings=settings, clock=time.monotonic, rng=random.Random())
    connections = ConnectionManager()
    hub = GameHub(
        rooms=room_manager, connections=connections, settings=settings, clock=time.monotonic
    )

    limiter = Limiter(key_func=get_remote_address)

    app = FastAPI()
    app.state.limiter = limiter
    # slowapi's own internal usage of this same call also needs a type: ignore
    # here (see slowapi/extension.py): the handler's `exc` parameter is typed
    # as the narrower `RateLimitExceeded` rather than `Exception`.
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/rooms")
    @limiter.limit("10/minute")
    def create_room(request: Request, body: CreateRoomBody | None = None) -> dict[str, str]:
        defaults = RoomSettings()
        rounds = defaults.rounds
        turn_seconds = defaults.turn_seconds
        if body is not None:
            if body.rounds is not None:
                rounds = max(_MIN_ROUNDS, min(_MAX_ROUNDS, body.rounds))
            if body.turn_seconds is not None:
                turn_seconds = max(_MIN_TURN_SECONDS, min(_MAX_TURN_SECONDS, body.turn_seconds))
        room_settings = RoomSettings(
            rounds=rounds, turn_seconds=turn_seconds, max_players=settings.max_players
        )
        try:
            code = room_manager.create_room(room_settings)
        except RoomError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"code": code}

    @app.websocket("/ws/{code}")
    async def ws_endpoint(websocket: WebSocket, code: str) -> None:
        origin = websocket.headers.get("origin")
        if origin is not None and origin not in settings.allowed_origins:
            await websocket.close(code=_CLOSE_ORIGIN_NOT_ALLOWED)
            return
        if room_manager.get(code) is None:
            await websocket.close(code=_CLOSE_ROOM_NOT_FOUND)
            return

        await websocket.accept()

        try:
            raw = await websocket.receive_text()
        except WebSocketDisconnect:
            return

        try:
            first_msg = client_adapter.validate_json(raw)
        except ValidationError:
            await websocket.close(code=_CLOSE_BAD_FIRST_MESSAGE)
            return
        if not isinstance(first_msg, JoinMsg):
            await websocket.close(code=_CLOSE_BAD_FIRST_MESSAGE)
            return

        try:
            player_id = await hub.handle_connect(
                code, first_msg.name, first_msg.player_id, websocket
            )
        except RoomError as exc:
            await websocket.send_text(json.dumps(dump(ErrorMsg(message=str(exc)))))
            await websocket.close(code=_CLOSE_BAD_FIRST_MESSAGE)
            return

        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = client_adapter.validate_json(raw)
                except ValidationError as exc:
                    await connections.send(code, player_id, ErrorMsg(message=str(exc)))
                    continue
                try:
                    await _dispatch(hub, code, player_id, msg)
                except RoomError as exc:
                    await connections.send(code, player_id, ErrorMsg(message=str(exc)))
        except WebSocketDisconnect:
            await hub.handle_disconnect(code, player_id)

    return app
