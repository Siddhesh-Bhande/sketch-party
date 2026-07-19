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


def started_room(players: int = 3) -> Room:
    room = make_room()
    for i in range(players):
        room.add_player(f"p{i}", f"Player{i}")
    room.start_game()
    return room


def test_start_game_requires_two_players() -> None:
    room = make_room()
    room.add_player("p0", "Solo")
    try:
        room.start_game()
        raise AssertionError("expected RoomError")
    except RoomError:
        pass


def test_start_game_enters_word_select_with_first_drawer() -> None:
    room = started_room()
    assert room.phase is GamePhase.WORD_SELECT
    assert room.current_drawer_id() == "p0"
    assert len(room.word_choices) == 3
    assert room.round == 1


def test_total_turns_is_rounds_times_players() -> None:
    room = started_room(players=3)  # default 3 rounds
    assert room.total_turns == 9


def test_end_turn_rests_at_turn_end_phase() -> None:
    room = started_room(players=3)
    room.choose_word("p0", room.word_choices[0])
    room.end_turn()
    assert room.phase is GamePhase.TURN_END


def test_next_turn_rotates_drawer_and_reopens_word_select() -> None:
    room = started_room(players=3)
    room.choose_word("p0", room.word_choices[0])
    room.end_turn()
    room.next_turn()
    assert room.current_drawer_id() == "p1"
    assert room.phase is GamePhase.WORD_SELECT


def test_next_turn_before_end_turn_raises() -> None:
    room = started_room(players=3)
    try:
        room.next_turn()
        raise AssertionError("expected RoomError")
    except RoomError:
        pass


def test_round_increments_after_everyone_drew() -> None:
    room = started_room(players=2)
    for _ in range(2):  # both players draw once = round 1 complete
        room.choose_word(room.current_drawer_id(), room.word_choices[0])
        room.end_turn()
        room.next_turn()
    assert room.round == 2
    assert room.current_drawer_id() == "p0"


def test_game_over_after_all_turns() -> None:
    room = started_room(players=2)  # 2 players * 3 rounds = 6 turns
    for _ in range(6):
        room.choose_word(room.current_drawer_id(), room.word_choices[0])
        room.end_turn()
        room.next_turn()
    assert room.phase is GamePhase.GAME_OVER
