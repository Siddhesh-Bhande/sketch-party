"""Server-authoritative room state machine."""

from __future__ import annotations

import random
from collections.abc import Callable

from sketch_party.matching import is_correct, is_near_miss
from sketch_party.models import (
    GamePhase,
    GuessOutcome,
    GuessResult,
    Player,
    RoomSettings,
    Turn,
)
from sketch_party.scoring import drawer_points, points_for_elapsed
from sketch_party.words import pick_word_choices

PALETTE = [
    "#e63946",
    "#f4a261",
    "#2a9d8f",
    "#457b9d",
    "#8338ec",
    "#ff6b6b",
    "#06d6a0",
    "#118ab2",
    "#ef476f",
    "#ffd166",
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
        used = {p.color for p in self.players.values()}
        color = next((c for c in PALETTE if c not in used), PALETTE[len(self.order) % len(PALETTE)])
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

    def current_drawer_id(self) -> str:
        """Return the drawer for the current turn, derived from join order.

        This is authoritative while choosing a word (`WORD_SELECT`). Once a turn is
        active, `self.turn.drawer_id` is the source of truth for who is drawing, since
        the roster (and therefore this index) can change if players leave mid-turn.
        """
        if not self.order:
            raise RoomError("no players")
        return self.order[self.turns_played % len(self.order)]

    def start_game(self) -> None:
        if self.phase is not GamePhase.LOBBY:
            raise RoomError("game already started")
        if len(self.order) < 2:
            raise RoomError("need at least two players")
        self.total_turns = self.settings.rounds * len(self.order)
        self.turns_played = 0
        self.round = 1
        self._begin_turn()

    def _begin_turn(self) -> None:
        self.phase = GamePhase.WORD_SELECT
        self.word_choices = pick_word_choices(self._rng)
        self.turn = None

    def next_turn(self) -> None:
        if self.phase is not GamePhase.TURN_END:
            raise RoomError("turn not finished")
        self.turns_played += 1
        if self.turns_played >= self.total_turns or not self.order:
            self.phase = GamePhase.GAME_OVER
            self.turn = None
            return
        self.round = (self.turns_played // len(self.order)) + 1
        self._begin_turn()

    def choose_word(self, player_id: str, word: str) -> None:
        if self.phase is not GamePhase.WORD_SELECT:
            raise RoomError("not choosing a word")
        if player_id != self.current_drawer_id():
            raise RoomError("only the drawer chooses the word")
        if word not in self.word_choices:
            raise RoomError("word not offered")
        self.phase = GamePhase.DRAWING
        self.turn = Turn(drawer_id=player_id, word=word, start_time=self._clock())

    def submit_guess(self, player_id: str, text: str) -> GuessOutcome:
        if self.phase is not GamePhase.DRAWING or self.turn is None:
            return GuessOutcome(result=GuessResult.IGNORED)
        if player_id == self.turn.drawer_id or player_id not in self.players:
            return GuessOutcome(result=GuessResult.IGNORED)
        if player_id in self.turn.guessed:
            return GuessOutcome(result=GuessResult.IGNORED)

        if is_correct(text, self.turn.word):
            elapsed = self._clock() - self.turn.start_time
            points = points_for_elapsed(elapsed)
            self.turn.guessed[player_id] = points
            self.players[player_id].score += points
            turn_over = self._all_non_drawers_guessed()
            if turn_over:
                self.end_turn()
            return GuessOutcome(result=GuessResult.CORRECT, points=points, turn_over=turn_over)
        if is_near_miss(text, self.turn.word):
            return GuessOutcome(result=GuessResult.NEAR)
        return GuessOutcome(result=GuessResult.WRONG)

    def _all_non_drawers_guessed(self) -> bool:
        assert self.turn is not None
        non_drawers = [pid for pid in self.order if pid != self.turn.drawer_id]
        return all(pid in self.turn.guessed for pid in non_drawers)

    def end_turn(self) -> None:
        if self.turn is None or self.turn.ended:
            raise RoomError("no active turn")
        drawer_id = self.turn.drawer_id
        non_drawer_points = [
            self.turn.guessed.get(pid, 0) for pid in self.order if pid != drawer_id
        ]
        if drawer_id in self.players:
            self.players[drawer_id].score += drawer_points(non_drawer_points)
        self.turn.ended = True
        self.phase = GamePhase.TURN_END
