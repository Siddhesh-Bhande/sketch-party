import contextlib
import random

from sketch_party.models import GamePhase, GuessResult, RoomSettings
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


def drawing_room(players: int = 3) -> tuple[Room, dict[str, float]]:
    clock = {"t": 0.0}
    room = Room("WXYZ", RoomSettings(), random.Random(0), lambda: clock["t"])
    for i in range(players):
        room.add_player(f"p{i}", f"Player{i}")
    room.start_game()
    room.choose_word("p0", room.word_choices[0])  # p0 is drawer, word chosen
    return room, clock


def test_correct_guess_awards_bucket_points() -> None:
    room, clock = drawing_room()
    word = room.turn.word  # type: ignore[union-attr]
    clock["t"] = 30.0  # 30s -> 10 points
    outcome = room.submit_guess("p1", word)
    assert outcome.result is GuessResult.CORRECT
    assert outcome.points == 10
    assert room.players["p1"].score == 10


def test_drawer_cannot_guess() -> None:
    room, _ = drawing_room()
    outcome = room.submit_guess("p0", room.turn.word)  # type: ignore[union-attr]
    assert outcome.result is GuessResult.IGNORED


def test_wrong_guess_scores_nothing() -> None:
    room, _ = drawing_room()
    outcome = room.submit_guess("p1", "definitely-not-the-word")
    assert outcome.result is GuessResult.WRONG
    assert room.players["p1"].score == 0


def test_near_miss_is_reported_without_points() -> None:
    room, _ = drawing_room()
    target = room.turn.word  # type: ignore[union-attr]
    outcome = room.submit_guess("p1", target[:-1])  # drop last char -> distance 1
    assert outcome.result is GuessResult.NEAR
    assert room.players["p1"].score == 0


def test_second_correct_guess_by_same_player_is_ignored() -> None:
    room, _ = drawing_room()
    word = room.turn.word  # type: ignore[union-attr]
    room.submit_guess("p1", word)
    outcome = room.submit_guess("p1", word)
    assert outcome.result is GuessResult.IGNORED


def test_turn_ends_when_all_non_drawers_guess() -> None:
    room, _clock = drawing_room(players=3)  # drawer p0, guessers p1 p2
    word = room.turn.word  # type: ignore[union-attr]
    room.submit_guess("p1", word)
    outcome = room.submit_guess("p2", word)
    assert outcome.turn_over is True
    assert room.phase is GamePhase.TURN_END


def test_drawer_gets_mean_of_guessers_including_zeros() -> None:
    room, clock = drawing_room(players=3)  # drawer p0, guessers p1 p2
    word = room.turn.word  # type: ignore[union-attr]
    clock["t"] = 30.0
    room.submit_guess("p1", word)  # 10 points
    # p2 never guesses; end the turn by time.
    room.end_turn()
    # Mean of [10, 0] = 5.
    assert room.players["p0"].score == 5


def test_end_turn_is_idempotent_scorewise() -> None:
    room, _ = drawing_room(players=2)
    word = room.turn.word  # type: ignore[union-attr]
    room.submit_guess("p1", word)  # ends the turn (only one non-drawer)
    drawer_score = room.players["p0"].score
    # Turn already ended; a manual end_turn must not double-score.
    with contextlib.suppress(RoomError):
        room.end_turn()
    assert room.players["p0"].score == drawer_score


# --- Code review follow-ups: color collision, and defensive guards ---


def test_color_reassigned_after_leave_rejoin_avoids_collision() -> None:
    room = make_room()
    room.add_player("p0", "Alex")
    room.add_player("p1", "Sam")
    room.remove_player("p0")
    room.add_player("p2", "Robin")
    assert room.players["p2"].color != room.players["p1"].color
    colors = [p.color for p in room.players.values()]
    assert len(colors) == len(set(colors))


def test_end_turn_when_drawer_left_does_not_raise() -> None:
    room = started_room(players=3)
    room.choose_word("p0", room.word_choices[0])
    word = room.turn.word  # type: ignore[union-attr]
    room.submit_guess("p1", word)  # only one of two non-drawers guessed
    room.remove_player("p0")
    room.end_turn()
    assert room.phase is GamePhase.TURN_END


def test_next_turn_with_emptied_roster_ends_game() -> None:
    room = started_room(players=2)
    room.choose_word(room.current_drawer_id(), room.word_choices[0])
    room.end_turn()
    room.remove_player("p0")
    room.remove_player("p1")
    room.next_turn()
    assert room.phase is GamePhase.GAME_OVER


def test_choose_word_by_non_drawer_raises() -> None:
    room = started_room(players=3)
    try:
        room.choose_word("p1", room.word_choices[0])
        raise AssertionError("expected RoomError")
    except RoomError:
        pass


def test_choose_word_with_unoffered_word_raises() -> None:
    room = started_room(players=3)
    try:
        room.choose_word("p0", "not-an-offered-word")
        raise AssertionError("expected RoomError")
    except RoomError:
        pass


def test_choose_word_outside_word_select_raises() -> None:
    room = started_room(players=3)
    room.choose_word("p0", room.word_choices[0])  # now in DRAWING
    try:
        room.choose_word("p0", room.word_choices[0])
        raise AssertionError("expected RoomError")
    except RoomError:
        pass


def test_submit_guess_after_game_over_is_ignored() -> None:
    room = started_room(players=2)
    for _ in range(6):  # 2 players * 3 rounds = 6 turns
        room.choose_word(room.current_drawer_id(), room.word_choices[0])
        room.end_turn()
        room.next_turn()
    assert room.phase is GamePhase.GAME_OVER
    outcome = room.submit_guess("p0", "anything")
    assert outcome.result is GuessResult.IGNORED


def test_submit_guess_from_unknown_player_is_ignored() -> None:
    room, _ = drawing_room()
    outcome = room.submit_guess("ghost", "anything")
    assert outcome.result is GuessResult.IGNORED
