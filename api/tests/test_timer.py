"""Real async server-authoritative turn timer tests.

Unlike test_hub.py, these exercise GameHub's DEFAULT start_timer/cancel_timer
(no stubs injected): a real asyncio.Task ticking off a real monotonic clock.
`turn_seconds` is kept small and `interstitial_seconds=0` so the tests stay
fast while still observing genuine wall-clock behavior.
"""

from __future__ import annotations

import asyncio
import json
import random
import time

from sketch_party.config import Settings
from sketch_party.hub import GameHub
from sketch_party.manager import ConnectionManager, RoomManager
from sketch_party.models import GamePhase, RoomSettings


class FakeWS:
    def __init__(self) -> None:
        self.sent: list[dict] = []  # type: ignore[type-arg]

    async def send_text(self, data: str) -> None:
        self.sent.append(json.loads(data))

    def of_type(self, msg_type: str) -> list[dict]:  # type: ignore[type-arg]
        return [m for m in self.sent if m["type"] == msg_type]


def make_hub(turn_seconds: int = 3, interstitial_seconds: int = 0) -> tuple[GameHub, RoomManager]:
    settings = Settings(turn_seconds=turn_seconds, interstitial_seconds=interstitial_seconds)
    rooms = RoomManager(settings=settings, clock=time.monotonic, rng=random.Random(0))
    connections = ConnectionManager()
    hub = GameHub(rooms=rooms, connections=connections, settings=settings, clock=time.monotonic)
    return hub, rooms


async def test_timer_ticks_and_advances_turn_at_the_cap() -> None:
    hub, rooms = make_hub(turn_seconds=3)
    code = rooms.create_room(RoomSettings(turn_seconds=3))
    a, b = FakeWS(), FakeWS()
    p1 = await hub.handle_connect(code, "Drawer", None, a)
    await hub.handle_connect(code, "Guesser", None, b)
    await hub.handle_start(code, p1)
    room = rooms.get(code)
    assert room is not None
    word = room.word_choices[0]

    await hub.handle_choose_word(code, p1, word)
    assert room.phase is GamePhase.DRAWING

    await asyncio.sleep(3.4)  # cap (3s) + slack past the 1s tick interval

    ticks = [m["secondsLeft"] for m in b.of_type("timerTick")]
    assert len(ticks) >= 1
    assert ticks == sorted(ticks, reverse=True)  # counts down
    assert all(0 <= s < 3 for s in ticks)

    # Turn ended and advanced (interstitial_seconds=0): fresh room lookup
    # avoids relying on a Room object whose .phase mypy might over-narrow.
    room = rooms.get(code)
    assert room is not None
    assert room.phase in (GamePhase.WORD_SELECT, GamePhase.GAME_OVER)
    assert b.of_type("turnEnded")


async def test_early_all_guessed_cancels_further_ticks() -> None:
    hub, rooms = make_hub(turn_seconds=5)
    code = rooms.create_room(RoomSettings(turn_seconds=5))
    a, b = FakeWS(), FakeWS()
    p1 = await hub.handle_connect(code, "Drawer", None, a)
    p2 = await hub.handle_connect(code, "Guesser", None, b)
    await hub.handle_start(code, p1)
    room = rooms.get(code)
    assert room is not None
    word = room.word_choices[0]

    await hub.handle_choose_word(code, p1, word)
    await hub.handle_guess(code, p2, word)  # only non-drawer -> ends the turn immediately

    ticks_at_end = len(b.of_type("timerTick"))
    await asyncio.sleep(1.5)  # would have produced a tick by now if not cancelled
    assert len(b.of_type("timerTick")) == ticks_at_end == 0
