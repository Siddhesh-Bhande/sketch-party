"""Shared enums and dataclasses for the domain core."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class GamePhase(str, Enum):  # noqa: UP042
    LOBBY = "lobby"
    WORD_SELECT = "word_select"
    DRAWING = "drawing"
    TURN_END = "turn_end"
    GAME_OVER = "game_over"


class Difficulty(str, Enum):  # noqa: UP042
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class GuessResult(str, Enum):  # noqa: UP042
    CORRECT = "correct"
    NEAR = "near"
    WRONG = "wrong"
    IGNORED = "ignored"


@dataclass
class Player:
    id: str
    name: str
    color: str
    connected: bool = True
    score: int = 0


@dataclass(frozen=True)
class RoomSettings:
    rounds: int = 3
    turn_seconds: int = 240
    max_players: int = 10


@dataclass
class Turn:
    drawer_id: str
    word: str
    start_time: float
    guessed: dict[str, int] = field(default_factory=dict)
    ended: bool = False


@dataclass
class GuessOutcome:
    result: GuessResult
    points: int = 0
    turn_over: bool = False
