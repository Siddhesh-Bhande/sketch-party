"""Server-authoritative room state machine and room manager."""

from __future__ import annotations

import random
from collections.abc import Callable

from sketch_party.models import (
    GamePhase,
    GuessOutcome,
    GuessResult,
    Player,
    RoomSettings,
    Turn,
)

PALETTE = [
    "#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#8338ec",
    "#ff6b6b", "#06d6a0", "#118ab2", "#ef476f", "#ffd166",
]


class RoomError(Exception):
    """Raised when an action is invalid for the current room state."""


class Room:
    def __init__(
        self,
        code: str,
        settings: RoomSettings,
        rng: random.Random,
        clock: Callable[[], float],
    ) -> None:
        self.code = code
        self.settings = settings
        self._rng = rng
        self._clock = clock
        self.players: dict[str, Player] = {}
        self.order: list[str] = []
        self.phase = GamePhase.LOBBY
        self.round = 0
        self.turns_played = 0
        self.total_turns = 0
        self.turn: Turn | None = None
        self.word_choices: list[str] = []

    def add_player(self, player_id: str, name: str) -> Player:
        if player_id in self.players:
            raise RoomError("player already in room")
        if len(self.players) >= self.settings.max_players:
            raise RoomError("room is full")
        color = PALETTE[len(self.order) % len(PALETTE)]
        player = Player(id=player_id, name=name, color=color)
        self.players[player_id] = player
        self.order.append(player_id)
        return player

    def mark_away(self, player_id: str) -> None:
        if player_id in self.players:
            self.players[player_id].connected = False

    def remove_player(self, player_id: str) -> None:
        self.players.pop(player_id, None)
        if player_id in self.order:
            self.order.remove(player_id)

    def is_empty(self) -> bool:
        return len(self.players) == 0
