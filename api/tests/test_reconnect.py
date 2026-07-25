"""Mid-game reconnect: an away player re-sends `join` with their stored id.

`handle_connect` must branch: a hint that matches a player already in the
room is a reconnect (re-attach the socket, flip `connected` back on, fresh
roomState to everyone) rather than a brand-new join (which would otherwise
raise `RoomError` from `add_player`'s duplicate-id check).
"""

from __future__ import annotations

from sketch_party.models import GamePhase, RoomSettings
from sketch_party.protocol import PlayerLeftMsg, Point, Stroke
from tests.test_hub import FakeWS, make_harness


async def test_reconnect_with_same_id_does_not_raise_and_flips_connected() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b, c = FakeWS(), FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "P1", None, a)
    p2 = await h.hub.handle_connect(code, "P2", None, b)
    await h.hub.handle_connect(code, "P3", None, c)
    await h.hub.handle_start(code, p1)

    await h.hub.handle_disconnect(code, p2, b)
    room = h.rooms.get(code)
    assert room is not None
    assert room.players[p2].connected is False

    # a and c each already saw the original playerJoined broadcasts for p2
    # and p3's joins; reconnect must not add any more.
    a_joined_before = len(a.of_type("playerJoined"))
    c_joined_before = len(c.of_type("playerJoined"))

    b2 = FakeWS()
    returned_id = await h.hub.handle_connect(code, "P2", p2, b2)

    assert returned_id == p2
    assert room.players[p2].connected is True

    # Everyone (including the reconnector, on the new socket) gets a fresh
    # roomState reflecting the roster with the player back online.
    for ws in (a, b2, c):
        state = ws.last("roomState")
        players_by_id = {p["id"]: p for p in state["players"]}
        assert players_by_id[p2]["connected"] is True

    # No new playerJoined broadcast on reconnect.
    assert len(a.of_type("playerJoined")) == a_joined_before
    assert len(c.of_type("playerJoined")) == c_joined_before
    assert b2.of_type("playerJoined") == []


async def test_reconnect_during_drawing_sends_canvas_replace() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b, c = FakeWS(), FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "P1", None, a)
    await h.hub.handle_connect(code, "P2", None, b)
    p3 = await h.hub.handle_connect(code, "P3", None, c)
    await h.hub.handle_start(code, p1)
    room = h.rooms.get(code)
    assert room is not None
    word = room.word_choices[0]
    await h.hub.handle_choose_word(code, p1, word)
    assert room.phase is GamePhase.DRAWING

    stroke = Stroke(id="s1", color="#000", size=2, points=[Point(x=0.1, y=0.2)])
    await h.hub.handle_stroke(code, p1, stroke)

    await h.hub.handle_disconnect(code, p3, c)
    c2 = FakeWS()
    await h.hub.handle_connect(code, "P3", p3, c2)

    replay = c2.last("canvasReplace")
    assert [s["id"] for s in replay["strokes"]] == ["s1"]


async def test_new_join_with_hint_not_in_room_uses_add_player_path() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a = FakeWS()
    await h.hub.handle_connect(code, "P1", None, a)

    b = FakeWS()
    stale_hint = "some-stale-id-not-in-room"
    p2 = await h.hub.handle_connect(code, "P2", stale_hint, b)

    assert p2 == stale_hint
    room = h.rooms.get(code)
    assert room is not None
    assert p2 in room.players
    joined = a.last("playerJoined")
    assert joined["player"]["id"] == p2


async def test_stale_disconnect_after_reconnect_does_not_evict_new_socket() -> None:
    """Regression: a stale socket's belated disconnect must not evict a
    newer, already-reconnected socket for the same player id.

    Sequence: b connects as p2, then reconnects as b2 (same id, no
    intervening handle_disconnect - this is the network-drop-then-fast-
    reconnect case where the server hasn't yet noticed b is dead). b's
    receive loop then finally raises and handle_disconnect(code, p2, b)
    fires. Since b is no longer the registered sender for p2 (b2 is),
    that disconnect must be ignored entirely: no mark_away, no PlayerLeft
    broadcast, and b2 must still be able to receive messages.
    """
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b, c = FakeWS(), FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "P1", None, a)
    p2 = await h.hub.handle_connect(code, "P2", None, b)
    await h.hub.handle_connect(code, "P3", None, c)
    await h.hub.handle_start(code, p1)

    b2 = FakeWS()
    await h.hub.handle_connect(code, "P2", p2, b2)  # b2 supersedes b

    left_before = a.of_type("playerLeft")

    await h.hub.handle_disconnect(code, p2, b)  # b's stale disconnect fires

    room = h.rooms.get(code)
    assert room is not None
    assert room.players[p2].connected is True
    assert p2 in room.players

    # No new PlayerLeftMsg was broadcast for the stale disconnect.
    assert a.of_type("playerLeft") == left_before

    # b2 (the current socket) is still registered and reachable.
    await h.hub._connections.broadcast(code, PlayerLeftMsg(player_id="ping"))
    assert b2.of_type("playerLeft")[-1]["playerId"] == "ping"


async def test_normal_single_socket_disconnect_still_marks_away() -> None:
    """Sanity check: without any reconnect in play, a disconnect from the
    one and only registered socket still marks the player away as before.
    """
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "P1", None, a)
    p2 = await h.hub.handle_connect(code, "P2", None, b)
    await h.hub.handle_start(code, p1)

    await h.hub.handle_disconnect(code, p2, b)

    room = h.rooms.get(code)
    assert room is not None
    assert room.players[p2].connected is False
    assert a.last("playerLeft")["playerId"] == p2


async def test_reconnect_when_already_connected_does_not_raise() -> None:
    h = make_harness()
    code = h.rooms.create_room(RoomSettings())
    a, b = FakeWS(), FakeWS()
    p1 = await h.hub.handle_connect(code, "P1", None, a)
    p2 = await h.hub.handle_connect(code, "P2", None, b)
    await h.hub.handle_start(code, p1)
    room = h.rooms.get(code)
    assert room is not None
    assert room.players[p2].connected is True

    a_joined_before = len(a.of_type("playerJoined"))
    b2 = FakeWS()
    returned_id = await h.hub.handle_connect(code, "P2", p2, b2)

    assert returned_id == p2
    assert room.players[p2].connected is True
    assert len(a.of_type("playerJoined")) == a_joined_before
