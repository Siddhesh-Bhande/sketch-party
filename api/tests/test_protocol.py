import pytest
from pydantic import ValidationError

from sketch_party.protocol import (
    ErrorMsg,
    GuessMsg,
    JoinMsg,
    PlayerView,
    RoomStateMsg,
    client_adapter,
    dump,
)


def test_parse_join_with_camelcase() -> None:
    msg = client_adapter.validate_python({"type": "join", "name": "Alex", "playerId": "p1"})
    assert isinstance(msg, JoinMsg)
    assert msg.player_id == "p1"


def test_parse_guess() -> None:
    msg = client_adapter.validate_python({"type": "guess", "text": "apple"})
    assert isinstance(msg, GuessMsg)
    assert msg.text == "apple"


def test_unknown_type_rejected() -> None:
    with pytest.raises(ValidationError):
        client_adapter.validate_python({"type": "nope"})


def test_dump_emits_camelcase_and_type() -> None:
    view = PlayerView(id="p1", name="Alex", color="#fff", score=3, connected=True)
    msg = RoomStateMsg(
        code="WXYZ",
        phase="lobby",
        players=[view],
        round=0,
        total_rounds=3,
        current_drawer_id=None,
        you_are_drawer=False,
        word_length=None,
        seconds_left=None,
        your_player_id="p1",
    )
    data = dump(msg)
    assert data["type"] == "roomState"
    assert data["totalRounds"] == 3
    assert data["players"][0]["connected"] is True


def test_error_message() -> None:
    assert dump(ErrorMsg(message="bad"))["type"] == "error"
