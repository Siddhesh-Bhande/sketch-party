import random

from sketch_party.models import GamePhase, RoomSettings
from sketch_party.room import Room, RoomError


def make_room(now: float = 0.0) -> Room:
    clock = {"t": now}
    return Room(
        code="WXYZ",
        settings=RoomSettings(),
        rng=random.Random(0),
        clock=lambda: clock["t"],
    )


def test_add_player_appends_in_join_order() -> None:
    room = make_room()
    room.add_player("p1", "Alex")
    room.add_player("p2", "Sam")
    assert room.order == ["p1", "p2"]
    assert room.players["p1"].name == "Alex"


def test_add_duplicate_player_id_raises() -> None:
    room = make_room()
    room.add_player("p1", "Alex")
    try:
        room.add_player("p1", "Alex Again")
        raise AssertionError("expected RoomError")
    except RoomError:
        pass


def test_add_player_beyond_max_raises() -> None:
    room = Room("WXYZ", RoomSettings(max_players=2), random.Random(0), lambda: 0.0)
    room.add_player("p1", "A")
    room.add_player("p2", "B")
    try:
        room.add_player("p3", "C")
        raise AssertionError("expected RoomError")
    except RoomError:
        pass


def test_mark_away_keeps_player_but_flags_disconnected() -> None:
    room = make_room()
    room.add_player("p1", "Alex")
    room.mark_away("p1")
    assert room.players["p1"].connected is False
    assert "p1" in room.order


def test_remove_player_in_lobby_drops_them() -> None:
    room = make_room()
    room.add_player("p1", "Alex")
    room.add_player("p2", "Sam")
    room.remove_player("p1")
    assert room.order == ["p2"]
    assert "p1" not in room.players


def test_is_empty_true_when_all_removed() -> None:
    room = make_room()
    room.add_player("p1", "Alex")
    room.remove_player("p1")
    assert room.is_empty() is True


def test_new_room_starts_in_lobby() -> None:
    assert make_room().phase is GamePhase.LOBBY
