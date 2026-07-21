"""Stroke buffer, live broadcast, and mid-turn replay tests (GameHub-level).

Reuses the FakeWS + stub-timer GameHub harness from test_hub.py rather than
duplicating it.
"""

from __future__ import annotations

from sketch_party.models import GamePhase, RoomSettings
from sketch_party.protocol import Point, Stroke
from tests.test_hub import FakeWS, Harness, make_harness


def _stroke(stroke_id: str = "s1", n_points: int = 3) -> Stroke:
    return Stroke(
        id=stroke_id,
        color="#000000",
        size=4,
        points=[Point(x=0.1 * i, y=0.2 * i) for i in range(n_points)],
    )


async def _start_drawing(
    h: Harness, code: str, drawer_ws: FakeWS, guesser_ws: FakeWS
) -> tuple[str, str]:
    """Join two players, start the game, and choose a word so DRAWING begins."""
    p1 = await h.hub.handle_connect(code, "Drawer", None, drawer_ws)
    p2 = await h.hub.handle_connect(code, "Guesser", None, guesser_ws)
    await h.hub.handle_start(code, p1)
    room = h.rooms.get(code)
    assert room is not None
    word = room.word_choices[0]
    await h.hub.handle_choose_word(code, p1, word)
    assert room.phase is GamePhase.DRAWING
    return p1, p2


# --- stroke -----------------------------------------------------------------


async def test_drawer_stroke_broadcasts_to_guesser_not_drawer() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1, _p2 = await _start_drawing(h, code, a, b)

    stroke = _stroke()
    await h.hub.handle_stroke(code, p1, stroke)

    got = b.last("strokeBroadcast")
    assert got["stroke"]["id"] == "s1"
    assert a.of_type("strokeBroadcast") == []


async def test_non_drawer_stroke_is_ignored() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    _p1, p2 = await _start_drawing(h, code, a, b)

    await h.hub.handle_stroke(code, p2, _stroke())

    assert a.of_type("strokeBroadcast") == []
    assert b.of_type("strokeBroadcast") == []


async def test_stroke_while_not_drawing_is_ignored() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "Drawer", None, a)
    await h.hub.handle_connect(code, "Guesser", None, b)
    await h.hub.handle_start(code, p1)  # phase is now word_select, not drawing

    await h.hub.handle_stroke(code, p1, _stroke())

    assert a.of_type("strokeBroadcast") == []
    assert b.of_type("strokeBroadcast") == []


async def test_oversized_stroke_is_ignored() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1, _p2 = await _start_drawing(h, code, a, b)

    huge = _stroke(n_points=h.settings.max_stroke_points + 1)
    await h.hub.handle_stroke(code, p1, huge)

    assert a.of_type("strokeBroadcast") == []
    assert b.of_type("strokeBroadcast") == []


async def test_stroke_upserts_by_id() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1, _p2 = await _start_drawing(h, code, a, b)

    await h.hub.handle_stroke(code, p1, _stroke("s1", n_points=2))
    await h.hub.handle_stroke(code, p1, _stroke("s1", n_points=5))

    assert len(b.of_type("strokeBroadcast")) == 2
    latest = b.last("strokeBroadcast")
    assert len(latest["stroke"]["points"]) == 5


# --- undo ---------------------------------------------------------------


async def test_undo_broadcasts_canvas_replace_with_remaining_strokes() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1, _p2 = await _start_drawing(h, code, a, b)

    await h.hub.handle_stroke(code, p1, _stroke("s1"))
    await h.hub.handle_stroke(code, p1, _stroke("s2"))

    await h.hub.handle_undo(code, p1)

    replace_a = a.last("canvasReplace")
    replace_b = b.last("canvasReplace")
    assert [s["id"] for s in replace_a["strokes"]] == ["s1"]
    assert [s["id"] for s in replace_b["strokes"]] == ["s1"]


async def test_undo_by_non_drawer_is_ignored() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1, p2 = await _start_drawing(h, code, a, b)
    await h.hub.handle_stroke(code, p1, _stroke("s1"))

    await h.hub.handle_undo(code, p2)

    assert a.of_type("canvasReplace") == []
    assert b.of_type("canvasReplace") == []


# --- clear ----------------------------------------------------------------


async def test_clear_broadcasts_canvas_cleared() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1, _p2 = await _start_drawing(h, code, a, b)
    await h.hub.handle_stroke(code, p1, _stroke("s1"))

    await h.hub.handle_clear(code, p1)

    assert a.last("canvasCleared")["type"] == "canvasCleared"
    assert b.last("canvasCleared")["type"] == "canvasCleared"


# --- new word clears the buffer --------------------------------------------


async def test_choosing_new_word_clears_stroke_buffer() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings(rounds=1))
    a, b = FakeWS(), FakeWS()
    p1, p2 = await _start_drawing(h, code, a, b)
    await h.hub.handle_stroke(code, p1, _stroke("s1"))

    room = h.rooms.get(code)
    assert room is not None
    word = room.word_choices[0]
    await h.hub.handle_guess(code, p2, word)  # last guesser -> ends turn, advances to word_select
    room = h.rooms.get(code)
    assert room is not None
    assert room.phase is GamePhase.WORD_SELECT
    next_drawer = room.current_drawer_id()
    word2 = room.word_choices[0]

    await h.hub.handle_choose_word(code, next_drawer, word2)
    # Re-fetch: mypy narrowed `room.phase` from the WORD_SELECT assert above
    # and doesn't invalidate that across the intervening hub call.
    room = h.rooms.get(code)
    assert room is not None
    assert room.phase is GamePhase.DRAWING

    c = FakeWS()
    await h.hub.handle_connect(code, "Late", None, c)

    assert c.last("canvasReplace")["strokes"] == []


# --- late joiner replay -----------------------------------------------------


async def test_late_joiner_during_drawing_receives_canvas_replace() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1, _p2 = await _start_drawing(h, code, a, b)
    await h.hub.handle_stroke(code, p1, _stroke("s1"))
    await h.hub.handle_stroke(code, p1, _stroke("s2"))

    c = FakeWS()
    await h.hub.handle_connect(code, "Latecomer", None, c)

    replay = c.last("canvasReplace")
    assert [s["id"] for s in replay["strokes"]] == ["s1", "s2"]


async def test_joiner_in_lobby_receives_no_canvas_replace() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a = FakeWS()
    await h.hub.handle_connect(code, "First", None, a)

    assert a.of_type("canvasReplace") == []
