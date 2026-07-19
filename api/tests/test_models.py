from sketch_party.models import (
    Difficulty,
    GamePhase,
    GuessOutcome,
    GuessResult,
    Player,
    RoomSettings,
    Turn,
)


def test_defaults() -> None:
    settings = RoomSettings()
    assert settings.rounds == 3
    assert settings.turn_seconds == 240
    assert settings.max_players == 10


def test_player_starts_connected_zero_score() -> None:
    player = Player(id="p1", name="Alex", color="#e63946")
    assert player.connected is True
    assert player.score == 0


def test_turn_tracks_guesses() -> None:
    turn = Turn(drawer_id="p1", word="apple", start_time=0.0)
    assert turn.guessed == {}
    assert turn.ended is False


def test_enum_values_are_strings() -> None:
    assert GamePhase.LOBBY.value == "lobby"
    assert Difficulty.EASY.value == "easy"
    assert GuessResult.CORRECT.value == "correct"


def test_guess_outcome_defaults() -> None:
    outcome = GuessOutcome(result=GuessResult.WRONG)
    assert outcome.points == 0
    assert outcome.turn_over is False
