"""GameHub: async orchestration of the game loop.

`GameHub` is the only async layer permitted to call `Room` methods, and it
always does so under a per-room `asyncio.Lock` (see `_lock`). It wires a
`RoomManager` (room state) to a `ConnectionManager` (live sockets), translates
client intents into `Room` calls, and broadcasts the resulting wire messages.

The turn timer is injected as a `start_timer`/`cancel_timer` callback pair so
this module is unit-testable without real wall-clock time (`test_hub.py`
passes recording stubs). When left unspecified, `GameHub` wires up a real
asyncio-task-based timer (`test_timer.py` exercises that default): one task
per room, ticking once a second, broadcasting `TimerTickMsg`, and ending the
turn via `end_and_advance` once `room.settings.turn_seconds` has elapsed.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Awaitable, Callable

from sketch_party.config import Settings
from sketch_party.manager import ConnectionManager, RoomManager, Sender
from sketch_party.models import GamePhase, GuessResult
from sketch_party.protocol import (
    FinalScore,
    GameOverMsg,
    GuessResultMsg,
    PlayerGuessedMsg,
    PlayerJoinedMsg,
    PlayerLeftMsg,
    PlayerView,
    RoomStateMsg,
    TimerTickMsg,
    TurnEndedMsg,
    TurnScore,
    TurnStartedMsg,
    WordChoicesMsg,
)
from sketch_party.room import Room, RoomError
from sketch_party.scoring import drawer_points

TimerFn = Callable[[str], "Awaitable[None] | None"]


class GameHub:
    """Owns rooms + connections; the sole async mutator of `Room` state."""

    def __init__(
        self,
        rooms: RoomManager,
        connections: ConnectionManager,
        settings: Settings,
        clock: Callable[[], float] = time.monotonic,
        start_timer: TimerFn | None = None,
        cancel_timer: TimerFn | None = None,
        tick_interval: float = 1.0,
    ) -> None:
        self._rooms = rooms
        self._connections = connections
        self._settings = settings
        self._clock = clock
        self._tick_interval = tick_interval
        self._locks: dict[str, asyncio.Lock] = {}
        # Guards against double-advance: last turns_played id this code has
        # already begun ending/advancing. See `end_and_advance`.
        self._advancing: dict[str, int] = {}
        self._timer_tasks: dict[str, asyncio.Task[None]] = {}
        # Bound methods can't be literal parameter defaults, hence the
        # None-sentinel: omitting start_timer/cancel_timer wires the real
        # asyncio-task-based timer; tests that need to unit-test the hub
        # without real time pass their own recording stubs instead.
        self._start_timer: TimerFn = (
            start_timer if start_timer is not None else self._default_start_timer
        )
        self._cancel_timer: TimerFn = (
            cancel_timer if cancel_timer is not None else self._default_cancel_timer
        )

    def _lock(self, code: str) -> asyncio.Lock:
        lock = self._locks.get(code)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[code] = lock
        return lock

    @staticmethod
    async def _call_timer(fn: TimerFn, code: str) -> None:
        result = fn(code)
        if result is not None:
            await result

    def _default_start_timer(self, code: str) -> None:
        room = self._rooms.get(code)
        if room is None:
            return
        self._default_cancel_timer(code)
        turn_id = room.turns_played
        self._timer_tasks[code] = asyncio.create_task(self._run_timer(code, turn_id))

    def _default_cancel_timer(self, code: str) -> None:
        task = self._timer_tasks.pop(code, None)
        # Guard against self-cancellation: `_run_timer` pops itself before
        # calling `end_and_advance` (see below), but a task must never
        # request its own cancellation from within its own coroutine chain -
        # `.cancel()` would inject CancelledError at the next await point
        # inside that same call chain (e.g. the interstitial sleep),
        # aborting the turn-advance it just triggered.
        if task is not None and not task.done() and task is not asyncio.current_task():
            task.cancel()

    async def _run_timer(self, code: str, turn_id: int) -> None:
        """Tick once a second and end the turn once the cap is reached.

        `seconds_left` is computed from the injected clock and
        `room.turn.start_time` rather than by counting loop iterations, so
        it stays correct even if a tick is delayed by scheduling jitter.
        """
        try:
            while True:
                await asyncio.sleep(self._tick_interval)
                should_end = False
                async with self._lock(code):
                    room = self._rooms.get(code)
                    if (
                        room is None
                        or room.turns_played != turn_id
                        or room.phase is not GamePhase.DRAWING
                    ):
                        return
                    assert room.turn is not None
                    elapsed = self._clock() - room.turn.start_time
                    cap = room.settings.turn_seconds
                    if elapsed >= cap:
                        should_end = True
                    else:
                        seconds_left = max(0, int(cap - elapsed))
                        await self._connections.broadcast(
                            code, TimerTickMsg(seconds_left=seconds_left)
                        )
                if should_end:
                    # Detach before advancing: end_and_advance() calls
                    # cancel_timer() as a safety net, and we must not let
                    # that target THIS task (see _default_cancel_timer).
                    if self._timer_tasks.get(code) is asyncio.current_task():
                        self._timer_tasks.pop(code, None)
                    await self.end_and_advance(code)
                    return
        except asyncio.CancelledError:
            return

    def _get_room(self, code: str) -> Room:
        room = self._rooms.get(code)
        if room is None:
            raise RoomError("room not found")
        return room

    @staticmethod
    def _require_host(room: Room, player_id: str) -> None:
        if not room.order or room.order[0] != player_id:
            raise RoomError("only the host may do this")

    @staticmethod
    def _player_view(room: Room, player_id: str) -> PlayerView:
        p = room.players[player_id]
        return PlayerView(id=p.id, name=p.name, color=p.color, score=p.score, connected=p.connected)

    def _room_state_msg(self, room: Room, player_id: str) -> RoomStateMsg:
        drawer_id: str | None = None
        word_length: int | None = None
        seconds_left: int | None = None
        if room.turn is not None:
            drawer_id = room.turn.drawer_id
            word_length = len(room.turn.word)
            if room.phase is GamePhase.DRAWING:
                elapsed = self._clock() - room.turn.start_time
                seconds_left = max(0, int(room.settings.turn_seconds - elapsed))
        elif room.phase is GamePhase.WORD_SELECT:
            drawer_id = room.current_drawer_id()
        return RoomStateMsg(
            code=room.code,
            phase=room.phase.value,
            players=[self._player_view(room, pid) for pid in room.order],
            round=room.round,
            total_rounds=room.settings.rounds,
            current_drawer_id=drawer_id,
            you_are_drawer=drawer_id == player_id,
            word_length=word_length,
            seconds_left=seconds_left,
            your_player_id=player_id,
        )

    async def _broadcast_room_state(self, room: Room) -> None:
        for pid in room.order:
            await self._connections.send(room.code, pid, self._room_state_msg(room, pid))

    async def _begin_word_select(self, room: Room) -> None:
        drawer_id = room.current_drawer_id()
        await self._connections.send(
            room.code, drawer_id, WordChoicesMsg(choices=room.word_choices)
        )
        await self._broadcast_room_state(room)

    def _turn_scores(self, room: Room) -> list[TurnScore]:
        assert room.turn is not None
        drawer_id = room.turn.drawer_id
        non_drawer_points = [
            room.turn.guessed.get(pid, 0) for pid in room.order if pid != drawer_id
        ]
        gained_by_id = {
            pid: room.turn.guessed.get(pid, 0) for pid in room.order if pid != drawer_id
        }
        gained_by_id[drawer_id] = drawer_points(non_drawer_points)
        return [
            TurnScore(player_id=pid, score=room.players[pid].score, gained=gained_by_id.get(pid, 0))
            for pid in room.order
        ]

    # --- handlers -----------------------------------------------------------

    async def handle_connect(
        self, code: str, name: str, player_id_hint: str | None, sender: Sender
    ) -> str:
        async with self._lock(code):
            room = self._get_room(code)
            player_id = player_id_hint or uuid.uuid4().hex
            truncated_name = name[: self._settings.max_name_length]
            room.add_player(player_id, truncated_name)
            await self._connections.connect(code, player_id, sender)
            await self._connections.send(code, player_id, self._room_state_msg(room, player_id))
            await self._connections.broadcast(
                code, PlayerJoinedMsg(player=self._player_view(room, player_id)), exclude=player_id
            )
        return player_id

    async def handle_start(self, code: str, player_id: str) -> None:
        async with self._lock(code):
            room = self._get_room(code)
            self._require_host(room, player_id)
            room.start_game()
            await self._begin_word_select(room)

    async def handle_choose_word(self, code: str, player_id: str, word: str) -> None:
        async with self._lock(code):
            room = self._get_room(code)
            room.choose_word(player_id, word)
            assert room.turn is not None
            drawer = room.players[room.turn.drawer_id]
            for pid in room.order:
                if pid == drawer.id:
                    continue
                await self._connections.send(
                    code,
                    pid,
                    TurnStartedMsg(
                        drawer_id=drawer.id,
                        drawer_name=drawer.name,
                        round=room.round,
                        word_length=len(room.turn.word),
                        turn_seconds=room.settings.turn_seconds,
                        word=None,
                    ),
                )
            await self._connections.send(
                code,
                drawer.id,
                TurnStartedMsg(
                    drawer_id=drawer.id,
                    drawer_name=drawer.name,
                    round=room.round,
                    word_length=len(room.turn.word),
                    turn_seconds=room.settings.turn_seconds,
                    word=room.turn.word,
                ),
            )
            await self._call_timer(self._start_timer, code)

    async def handle_guess(self, code: str, player_id: str, text: str) -> None:
        if len(text) > self._settings.max_guess_length:
            raise RoomError("guess exceeds max length")
        turn_over = False
        async with self._lock(code):
            room = self._get_room(code)
            outcome = room.submit_guess(player_id, text)
            await self._connections.send(
                code, player_id, GuessResultMsg(result=outcome.result, points=outcome.points)
            )
            if outcome.result is GuessResult.CORRECT:
                player = room.players[player_id]
                await self._connections.broadcast(
                    code, PlayerGuessedMsg(player_id=player_id, name=player.name)
                )
                await self._broadcast_room_state(room)
            turn_over = outcome.turn_over
        if turn_over:
            await self._call_timer(self._cancel_timer, code)
            await self.end_and_advance(code)

    async def handle_play_again(self, code: str, player_id: str) -> None:
        await self._call_timer(self._cancel_timer, code)
        async with self._lock(code):
            room = self._get_room(code)
            self._require_host(room, player_id)
            room.reset()
            await self._broadcast_room_state(room)

    async def handle_disconnect(self, code: str, player_id: str) -> None:
        was_drawer_mid_turn = False
        async with self._lock(code):
            room = self._rooms.get(code)
            if room is None:
                return
            self._connections.disconnect(code, player_id)
            if room.phase is GamePhase.LOBBY:
                # No game in progress: drop the seat entirely rather than
                # leaving a ghost player nobody can un-away.
                room.remove_player(player_id)
            else:
                room.mark_away(player_id)
            if room.is_empty():
                self._rooms.remove_empty(code)
                self._locks.pop(code, None)
                self._advancing.pop(code, None)
                return
            await self._connections.broadcast(code, PlayerLeftMsg(player_id=player_id))
            if room.turn is not None and not room.turn.ended and room.turn.drawer_id == player_id:
                was_drawer_mid_turn = True
        if was_drawer_mid_turn:
            await self._call_timer(self._cancel_timer, code)
            await self.end_and_advance(code)

    async def end_and_advance(self, code: str) -> None:
        """End the current turn (if needed), broadcast results, then advance.

        Guarded against being entered twice for the same turn (e.g. a guess
        that completes the turn racing the timer firing at the cap): the
        `_advancing` marker, checked and set atomically under the per-room
        lock, ensures only the first caller for a given `turns_played` id
        does the ending/broadcasting/advancing work.
        """
        turn_id: int
        async with self._lock(code):
            room = self._get_room(code)
            if room.turn is None:
                return
            turn_id = room.turns_played
            if self._advancing.get(code) == turn_id:
                return  # another caller already claimed this turn
            self._advancing[code] = turn_id
            if not room.turn.ended:
                room.end_turn()
            word = room.turn.word
            scores = self._turn_scores(room)
            await self._connections.broadcast(code, TurnEndedMsg(word=word, scores=scores))
            await self._call_timer(self._cancel_timer, code)

        await asyncio.sleep(self._settings.interstitial_seconds)

        async with self._lock(code):
            room = self._get_room(code)
            # Narrow a local copy, not `room.phase` itself: mypy doesn't
            # invalidate narrowing of an attribute expression across the
            # `next_turn()` call below, which mutates it.
            phase_before = room.phase
            if phase_before is not GamePhase.TURN_END or room.turns_played != turn_id:
                return  # someone else already advanced this room
            room.next_turn()
            if room.phase is GamePhase.GAME_OVER:
                final_scores = [
                    FinalScore(
                        player_id=pid, name=room.players[pid].name, score=room.players[pid].score
                    )
                    for pid in room.order
                ]
                await self._connections.broadcast(code, GameOverMsg(scores=final_scores))
            else:
                await self._begin_word_select(room)
