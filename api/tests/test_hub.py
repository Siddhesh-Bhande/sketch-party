"""GameHub game-loop handler tests.

These exercise the hub WITHOUT a real timer: start_timer/cancel_timer are
recording stubs, so every test controls time explicitly via a mutable clock
holder shared with the RoomManager. `interstitial_seconds=0` keeps
`end_and_advance` synchronous-for-test-purposes (the sleep still happens but
yields for ~0 seconds), so a `handle_guess` call that ends a turn already
reflects the fully-advanced room by the time it returns.
"""

from __future__ import annotations

import json
import random
from typing import NamedTuple

import pytest

from sketch_party.config import Settings
from sketch_party.hub import GameHub
from sketch_party.manager import ConnectionManager, RoomManager
from sketch_party.models import GamePhase, RoomSettings
from sketch_party.room import RoomError


class FakeWS:
    def __init__(self) -> None:
        self.sent: list[dict] = []  # type: ignore[type-arg]

    async def send_text(self, data: str) -> None:
        self.sent.append(json.loads(data))

    def of_type(self, msg_type: str) -> list[dict]:  # type: ignore[type-arg]
        return [m for m in self.sent if m["type"] == msg_type]

    def last(self, msg_type: str) -> dict:  # type: ignore[type-arg]
        matches = self.of_type(msg_type)
        assert matches, f"no {msg_type!r} received; got {[m['type'] for m in self.sent]}"
        return matches[-1]


class Harness(NamedTuple):
    hub: GameHub
    rooms: RoomManager
    connections: ConnectionManager
    clock: dict[str, float]
    settings: Settings
    started: list[str]
    cancelled: list[str]


def make_harness(
    interstitial_seconds: int = 0,
    turn_seconds: int = 240,
    max_guess_length: int = 60,
    max_name_length: int = 20,
) -> Harness:
    clock_holder = {"t": 0.0}
    settings = Settings(
        interstitial_seconds=interstitial_seconds,
        turn_seconds=turn_seconds,
        max_guess_length=max_guess_length,
        max_name_length=max_name_length,
    )
    rooms = RoomManager(settings=settings, clock=lambda: clock_holder["t"], rng=random.Random(0))
    connections = ConnectionManager()
    started: list[str] = []
    cancelled: list[str] = []

    async def start_timer(code: str) -> None:
        started.append(code)

    async def cancel_timer(code: str) -> None:
        cancelled.append(code)

    hub = GameHub(
        rooms=rooms,
        connections=connections,
        settings=settings,
        clock=lambda: clock_holder["t"],
        start_timer=start_timer,
        cancel_timer=cancel_timer,
    )
    return Harness(hub, rooms, connections, clock_holder, settings, started, cancelled)


# --- connect -------------------------------------------------------------


async def test_connect_sends_room_state_and_broadcasts_player_joined() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()

    p1 = await h.hub.handle_connect(code, "Alex", None, a)
    assert a.last("roomState")["yourPlayerId"] == p1
    assert a.of_type("playerJoined") == []

    p2 = await h.hub.handle_connect(code, "Sam", None, b)
    assert b.last("roomState")["yourPlayerId"] == p2
    # b never sees playerJoined about itself.
    assert b.of_type("playerJoined") == []

    joined = a.last("playerJoined")
    assert joined["player"]["id"] == p2
    assert joined["player"]["name"] == "Sam"


async def test_connect_truncates_long_names() -> None:
    h = make_harness(max_name_length=20)
    code = h.rooms.create_room(RoomSettings())
    a = FakeWS()
    pid = await h.hub.handle_connect(code, "X" * 50, None, a)
    room = h.rooms.get(code)
    assert room is not None
    assert room.players[pid].name == "X" * 20


async def test_connect_beyond_max_players_raises() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings(max_players=1))
    a, b = FakeWS(), FakeWS()
    await h.hub.handle_connect(code, "A", None, a)
    with pytest.raises(RoomError):
        await h.hub.handle_connect(code, "B", None, b)


# --- start / host enforcement ---------------------------------------------


async def test_non_host_start_raises() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    await h.hub.handle_connect(code, "Alex", None, a)
    p2 = await h.hub.handle_connect(code, "Sam", None, b)
    with pytest.raises(RoomError):
        await h.hub.handle_start(code, p2)


async def test_host_start_moves_to_word_select_and_drawer_gets_choices() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "Alex", None, a)
    await h.hub.handle_connect(code, "Sam", None, b)

    await h.hub.handle_start(code, p1)

    room = h.rooms.get(code)
    assert room is not None
    assert room.phase is GamePhase.WORD_SELECT
    choices = a.last("wordChoices")["choices"]
    assert len(choices) == 3
    assert b.of_type("wordChoices") == []
    assert a.last("roomState")["phase"] == "word_select"
    assert b.last("roomState")["phase"] == "word_select"


# --- choose word ------------------------------------------------------------


async def test_choose_word_sends_turn_started_and_starts_timer() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "Drawer", None, a)
    await h.hub.handle_connect(code, "Guesser", None, b)
    await h.hub.handle_start(code, p1)
    room = h.rooms.get(code)
    assert room is not None
    word = room.word_choices[0]

    await h.hub.handle_choose_word(code, p1, word)

    drawer_msg = a.last("turnStarted")
    guesser_msg = b.last("turnStarted")
    assert drawer_msg["word"] == word
    assert guesser_msg["word"] is None
    assert guesser_msg["wordLength"] == len(word)
    assert drawer_msg["drawerId"] == p1
    assert h.started == [code]


async def test_choose_word_by_non_drawer_raises() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "Drawer", None, a)
    p2 = await h.hub.handle_connect(code, "Guesser", None, b)
    await h.hub.handle_start(code, p1)
    room = h.rooms.get(code)
    assert room is not None
    with pytest.raises(RoomError):
        await h.hub.handle_choose_word(code, p2, room.word_choices[0])


# --- guess / scoring / turn end --------------------------------------------


async def test_correct_guess_scores_broadcasts_and_ends_turn_on_last_guesser() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b, c = FakeWS(), FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "Drawer", None, a)
    p2 = await h.hub.handle_connect(code, "Guesser1", None, b)
    p3 = await h.hub.handle_connect(code, "Guesser2", None, c)
    await h.hub.handle_start(code, p1)
    room = h.rooms.get(code)
    assert room is not None
    word = room.word_choices[0]
    h.clock["t"] = 100.0
    await h.hub.handle_choose_word(code, p1, word)

    h.clock["t"] = 130.0  # elapsed 30s -> 10 points
    await h.hub.handle_guess(code, p2, word)
    assert b.last("guessResult") == {"type": "guessResult", "result": "correct", "points": 10}
    assert a.last("playerGuessedCorrectly")["playerId"] == p2
    assert h.cancelled == []  # not the last guesser yet

    h.clock["t"] = 220.0  # elapsed 120s -> 9 points
    await h.hub.handle_guess(code, p3, word)
    assert c.last("guessResult")["points"] == 9
    # cancel_timer is called defensively both by handle_guess and by
    # end_and_advance's own safety net; either way it must fire at least once.
    assert code in h.cancelled

    turn_ended = a.last("turnEnded")
    assert turn_ended["word"] == word
    gains = {s["playerId"]: s["gained"] for s in turn_ended["scores"]}
    assert gains[p2] == 10
    assert gains[p3] == 9
    assert gains[p1] == 10  # mean(10, 9) = 9.5 -> rounds half-up to 10

    # interstitial_seconds=0, so end_and_advance already ran to completion.
    assert room.phase is GamePhase.WORD_SELECT
    assert room.current_drawer_id() == p2
    assert b.of_type("wordChoices"), "next drawer should receive word choices"


async def test_guess_over_max_length_raises() -> None:
    h = make_harness(max_guess_length=5)
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "Drawer", None, a)
    p2 = await h.hub.handle_connect(code, "Guesser", None, b)
    with pytest.raises(RoomError):
        await h.hub.handle_guess(code, p2, "way-too-long-for-the-cap")
    assert p1  # silence unused warning while documenting the drawer exists


async def test_full_two_player_game_ends_with_game_over_broadcast() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings(rounds=1))  # 2 players * 1 round = 2 turns
    a, b = FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "P1", None, a)
    p2 = await h.hub.handle_connect(code, "P2", None, b)
    await h.hub.handle_start(code, p1)
    room = h.rooms.get(code)
    assert room is not None

    word1 = room.word_choices[0]
    await h.hub.handle_choose_word(code, p1, word1)
    h.clock["t"] = 10.0
    await h.hub.handle_guess(code, p2, word1)
    assert room.phase is GamePhase.WORD_SELECT

    word2 = room.word_choices[0]
    await h.hub.handle_choose_word(code, p2, word2)
    h.clock["t"] = 20.0
    await h.hub.handle_guess(code, p1, word2)

    # Re-fetch: mypy narrowed `room.phase` from the WORD_SELECT assert above
    # and doesn't invalidate that across the intervening hub calls.
    room = h.rooms.get(code)
    assert room is not None
    assert room.phase is GamePhase.GAME_OVER
    game_over_a = a.last("gameOver")
    game_over_b = b.last("gameOver")
    scores = {s["playerId"]: s["score"] for s in game_over_a["scores"]}
    assert scores[p1] > 0
    assert scores[p2] > 0
    assert game_over_b["scores"] == game_over_a["scores"]


# --- play again -------------------------------------------------------------


async def test_play_again_is_host_only_and_resets_to_lobby() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings(rounds=1))
    a, b = FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "P1", None, a)
    p2 = await h.hub.handle_connect(code, "P2", None, b)
    await h.hub.handle_start(code, p1)
    room = h.rooms.get(code)
    assert room is not None
    word1 = room.word_choices[0]
    await h.hub.handle_choose_word(code, p1, word1)
    await h.hub.handle_guess(code, p2, word1)
    word2 = room.word_choices[0]
    await h.hub.handle_choose_word(code, p2, word2)
    await h.hub.handle_guess(code, p1, word2)
    assert room.phase is GamePhase.GAME_OVER

    with pytest.raises(RoomError):
        await h.hub.handle_play_again(code, p2)

    await h.hub.handle_play_again(code, p1)
    # Re-fetch: mypy narrowed `room.phase` from the GAME_OVER assert above
    # and doesn't invalidate that across the intervening hub call.
    room = h.rooms.get(code)
    assert room is not None
    assert room.phase is GamePhase.LOBBY
    assert all(p.score == 0 for p in room.players.values())
    assert a.last("roomState")["phase"] == "lobby"
    assert b.last("roomState")["phase"] == "lobby"


# --- disconnect ---------------------------------------------------------


async def test_disconnect_in_lobby_removes_player_and_empty_room() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a = FakeWS()
    p1 = await h.hub.handle_connect(code, "P1", None, a)

    await h.hub.handle_disconnect(code, p1)

    assert h.rooms.get(code) is None


async def test_disconnect_mid_turn_drawer_cancels_timer_and_advances() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings(rounds=1))
    a, b, c = FakeWS(), FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "P1", None, a)
    await h.hub.handle_connect(code, "P2", None, b)
    await h.hub.handle_connect(code, "P3", None, c)
    await h.hub.handle_start(code, p1)
    room = h.rooms.get(code)
    assert room is not None
    word = room.word_choices[0]
    await h.hub.handle_choose_word(code, p1, word)

    await h.hub.handle_disconnect(code, p1)

    # cancel_timer is called defensively both by handle_disconnect and by
    # end_and_advance's own safety net; either way it must fire at least once.
    assert code in h.cancelled
    assert room.players[p1].connected is False
    assert p1 in room.players  # marked away, not removed, mid-game
    assert room.phase in (GamePhase.WORD_SELECT, GamePhase.GAME_OVER)


# --- timer callback plumbing -------------------------------------------


async def test_timer_callbacks_support_sync_functions_too() -> None:
    clock_holder = {"t": 0.0}
    settings = Settings(interstitial_seconds=0)
    rooms = RoomManager(settings=settings, clock=lambda: clock_holder["t"], rng=random.Random(0))
    connections = ConnectionManager()
    sync_started: list[str] = []
    sync_cancelled: list[str] = []

    def start_timer(code: str) -> None:
        sync_started.append(code)

    def cancel_timer(code: str) -> None:
        sync_cancelled.append(code)

    hub = GameHub(
        rooms=rooms,
        connections=connections,
        settings=settings,
        clock=lambda: clock_holder["t"],
        start_timer=start_timer,
        cancel_timer=cancel_timer,
    )
    code = rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1 = await hub.handle_connect(code, "P1", None, a)
    p2 = await hub.handle_connect(code, "P2", None, b)
    await hub.handle_start(code, p1)
    room = rooms.get(code)
    assert room is not None
    word = room.word_choices[0]

    await hub.handle_choose_word(code, p1, word)
    assert sync_started == [code]

    await hub.handle_guess(code, p2, word)  # last (only) guesser -> ends turn
    assert code in sync_cancelled
