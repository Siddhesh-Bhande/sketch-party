"""Typed wire protocol between clients and the server.

Every message is a Pydantic model. Python stays snake_case; the JSON on the
wire is camelCase (to match the future TS client) via a shared alias
generator. Incoming client messages are parsed through a discriminated-union
`TypeAdapter`; outgoing server messages are dumped with `dump()`.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from pydantic.alias_generators import to_camel

from sketch_party.models import GuessResult


class WireModel(BaseModel):
    """Base for all wire messages: camelCase JSON, snake_case Python."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def dump(msg: WireModel) -> dict[str, Any]:
    """Serialize a wire message to a camelCase-keyed dict."""
    return msg.model_dump(by_alias=True)


# --- Shared drawing models ---------------------------------------------------


class Point(WireModel):
    """A single normalized (0..1) coordinate on the drawing canvas."""

    x: float
    y: float


class Stroke(WireModel):
    """A client-generated polyline; `id` makes stroke updates idempotent."""

    id: str
    color: str
    size: int
    points: list[Point]


# --- Client messages (incoming) ---------------------------------------------


class JoinMsg(WireModel):
    type: Literal["join"] = "join"
    name: str
    player_id: str | None = None


class StartGameMsg(WireModel):
    type: Literal["startGame"] = "startGame"


class ChooseWordMsg(WireModel):
    type: Literal["chooseWord"] = "chooseWord"
    word: str


class GuessMsg(WireModel):
    type: Literal["guess"] = "guess"
    text: str


class PlayAgainMsg(WireModel):
    type: Literal["playAgain"] = "playAgain"


class StrokeMsg(WireModel):
    type: Literal["stroke"] = "stroke"
    stroke: Stroke


class UndoMsg(WireModel):
    type: Literal["undo"] = "undo"


class ClearCanvasMsg(WireModel):
    type: Literal["clearCanvas"] = "clearCanvas"


ClientMessage = Annotated[
    JoinMsg
    | StartGameMsg
    | ChooseWordMsg
    | GuessMsg
    | PlayAgainMsg
    | StrokeMsg
    | UndoMsg
    | ClearCanvasMsg,
    Field(discriminator="type"),
]
client_adapter: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)


# --- Server messages (outgoing) ---------------------------------------------


class PlayerView(WireModel):
    id: str
    name: str
    color: str
    score: int
    connected: bool


class ErrorMsg(WireModel):
    type: Literal["error"] = "error"
    message: str


class RoomStateMsg(WireModel):
    type: Literal["roomState"] = "roomState"
    code: str
    phase: str
    players: list[PlayerView]
    round: int
    total_rounds: int
    current_drawer_id: str | None
    you_are_drawer: bool
    word_length: int | None
    seconds_left: int | None
    turn_seconds: int
    your_player_id: str


class PlayerJoinedMsg(WireModel):
    type: Literal["playerJoined"] = "playerJoined"
    player: PlayerView


class PlayerLeftMsg(WireModel):
    type: Literal["playerLeft"] = "playerLeft"
    player_id: str


class WordChoicesMsg(WireModel):
    type: Literal["wordChoices"] = "wordChoices"
    choices: list[str]


class TurnStartedMsg(WireModel):
    type: Literal["turnStarted"] = "turnStarted"
    drawer_id: str
    drawer_name: str
    round: int
    word_length: int
    turn_seconds: int
    word: str | None = None


class GuessResultMsg(WireModel):
    type: Literal["guessResult"] = "guessResult"
    result: GuessResult
    points: int


class PlayerGuessedMsg(WireModel):
    type: Literal["playerGuessedCorrectly"] = "playerGuessedCorrectly"
    player_id: str
    name: str


class TimerTickMsg(WireModel):
    type: Literal["timerTick"] = "timerTick"
    seconds_left: int


class TurnScore(WireModel):
    player_id: str
    score: int
    gained: int


class TurnEndedMsg(WireModel):
    type: Literal["turnEnded"] = "turnEnded"
    word: str
    scores: list[TurnScore]


class FinalScore(WireModel):
    player_id: str
    name: str
    score: int


class GameOverMsg(WireModel):
    type: Literal["gameOver"] = "gameOver"
    scores: list[FinalScore]


class StrokeBroadcastMsg(WireModel):
    """One new/updated stroke, broadcast to everyone except the drawer."""

    type: Literal["strokeBroadcast"] = "strokeBroadcast"
    stroke: Stroke


class CanvasReplaceMsg(WireModel):
    """Full stroke-list replace: used for undo, and mid-turn replay on join."""

    type: Literal["canvasReplace"] = "canvasReplace"
    strokes: list[Stroke]


class CanvasClearedMsg(WireModel):
    type: Literal["canvasCleared"] = "canvasCleared"
