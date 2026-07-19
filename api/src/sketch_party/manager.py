"""Room registry and per-connection broadcast fan-out."""

from __future__ import annotations

import json
import random
import string
from collections.abc import Callable
from typing import Protocol

from sketch_party.config import Settings
from sketch_party.models import RoomSettings
from sketch_party.protocol import WireModel, dump
from sketch_party.room import Room, RoomError

_CODE_ALPHABET = string.ascii_uppercase
_CODE_LENGTH = 4


class RoomManager:
    """Creates and looks up rooms by a unique 4-letter code."""

    def __init__(
        self,
        settings: Settings,
        clock: Callable[[], float],
        rng: random.Random,
    ) -> None:
        self._settings = settings
        self._clock = clock
        self._rng = rng
        self._rooms: dict[str, Room] = {}

    def _generate_code(self) -> str:
        while True:
            code = "".join(self._rng.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
            if code not in self._rooms:
                return code

    def create_room(self, room_settings: RoomSettings) -> str:
        if len(self._rooms) >= self._settings.max_rooms:
            raise RoomError("max rooms reached")
        code = self._generate_code()
        self._rooms[code] = Room(code, room_settings, self._rng, self._clock)
        return code

    def get(self, code: str) -> Room | None:
        return self._rooms.get(code)

    def remove_empty(self, code: str) -> None:
        room = self._rooms.get(code)
        if room is not None and room.is_empty():
            del self._rooms[code]


class Sender(Protocol):
    """Minimal async interface a connection manager sends text frames to."""

    async def send_text(self, data: str) -> None: ...


class ConnectionManager:
    """Tracks live per-room, per-player senders and fans out wire messages."""

    def __init__(self) -> None:
        self._connections: dict[str, dict[str, Sender]] = {}

    async def connect(self, code: str, player_id: str, sender: Sender) -> None:
        self._connections.setdefault(code, {})[player_id] = sender

    def disconnect(self, code: str, player_id: str) -> None:
        room_conns = self._connections.get(code)
        if room_conns is None:
            return
        room_conns.pop(player_id, None)
        if not room_conns:
            del self._connections[code]

    async def send(self, code: str, player_id: str, msg: WireModel) -> None:
        room_conns = self._connections.get(code)
        if room_conns is None:
            return
        sender = room_conns.get(player_id)
        if sender is None:
            return
        await self._deliver(code, player_id, sender, msg)

    async def broadcast(self, code: str, msg: WireModel, exclude: str | None = None) -> None:
        room_conns = self._connections.get(code)
        if room_conns is None:
            return
        for player_id, sender in list(room_conns.items()):
            if player_id == exclude:
                continue
            await self._deliver(code, player_id, sender, msg)

    async def _deliver(self, code: str, player_id: str, sender: Sender, msg: WireModel) -> None:
        payload = json.dumps(dump(msg))
        try:
            await sender.send_text(payload)
        except Exception:
            self.disconnect(code, player_id)
