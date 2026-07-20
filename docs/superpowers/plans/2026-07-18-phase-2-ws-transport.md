# Sketch Party - Phase 2: WebSocket Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wrap the Phase 1 pure `Room` core in a FastAPI WebSocket server: a typed JSON protocol, a `RoomManager` and `ConnectionManager`, a `GameHub` that drives the game loop, a server-authoritative async turn timer, and integration tests that drive multiple clients through a full turn.

**Architecture:** The pure `Room` (Phase 1) stays synchronous and framework-free. A `GameHub` owns rooms + connections and is the only async layer that mutates rooms, always under a per-room `asyncio.Lock`. The server owns the timer: an asyncio task ticks every second and ends a turn at the cap; an early finish (all guessed) cancels it. Every message is a Pydantic model; incoming messages are parsed through a discriminated-union `TypeAdapter`, outgoing are dumped with camelCase aliases to match the future TS client.

**Tech Stack:** FastAPI, uvicorn[standard], pydantic v2, pydantic-settings, slowapi, httpx (dev). Python 3.12, uv, ruff, mypy strict, pytest, pytest-asyncio.

**Scope note (plan detail):** This phase involves async coordination, so this plan specifies exact interfaces, protocol shapes, and representative tests, and gives the core implementation for the intricate parts. Where an implementer must exercise judgment on async wiring, that is called out; the spec + code-quality review gates verify it. Follow TDD throughout: write the failing test, confirm failure, implement, confirm pass, commit per task.

---

## File structure (Phase 2)

Under `api/src/sketch_party/`:
- `config.py` - `Settings` (pydantic-settings): allowed origins, caps (max rooms, max players, max name length, max guess length).
- `protocol.py` - all wire message models + `client_adapter` (parse) and a `dump(msg)` helper.
- `manager.py` - `RoomManager` (create/get/remove rooms, unique codes) and `ConnectionManager` (code -> player_id -> sender).
- `hub.py` - `GameHub`: async orchestration of join/start/chooseWord/guess/playAgain + the async turn timer + broadcasts. The only place `Room` methods are called.
- `app.py` - FastAPI app: `POST /rooms`, `GET /healthz`, `WebSocket /ws/{code}`, CORS, slowapi limiter, wires a single `GameHub`.

Tests under `api/tests/`: `test_protocol.py`, `test_manager.py`, `test_hub.py`, `test_timer.py`, `test_app_ws.py`.

New deps only; do NOT modify Phase 1 modules except to add a `word_length` read (none needed - hub reads `room.turn.word`).

---

## Task 1: Dependencies and config

**Files:** modify `api/pyproject.toml`; create `api/src/sketch_party/config.py`, `api/tests/test_config.py`.

- [ ] **Step 1: Add dependencies to `pyproject.toml`.** Set `dependencies` to:
```toml
dependencies = [
    "fastapi>=0.111",
    "uvicorn[standard]>=0.30",
    "pydantic>=2.7",
    "pydantic-settings>=2.3",
    "slowapi>=0.1.9",
]
```
and add to the dev group: `"httpx>=0.27"`. Add a mypy override so slowapi is ignored:
```toml
[[tool.mypy.overrides]]
module = ["slowapi.*"]
ignore_missing_imports = true
```
Run `uv sync`.

- [ ] **Step 2: Write the failing test** `tests/test_config.py`:
```python
from sketch_party.config import Settings


def test_defaults() -> None:
    s = Settings()
    assert s.max_rooms >= 100
    assert s.max_players == 10
    assert s.max_name_length == 20
    assert s.max_guess_length == 60
    assert "http://localhost:5173" in s.allowed_origins


def test_allowed_origins_parse_csv(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.com,https://b.com")
    s = Settings()
    assert s.allowed_origins == ["https://a.com", "https://b.com"]
```

- [ ] **Step 3: Implement `config.py`:**
```python
"""Runtime settings loaded from environment."""

from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    allowed_origins: list[str] = ["http://localhost:5173"]
    max_rooms: int = 500
    max_players: int = 10
    max_name_length: int = 20
    max_guess_length: int = 60
    turn_seconds: int = 240
    interstitial_seconds: int = 5

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value
```

- [ ] **Step 4:** `uv run pytest tests/test_config.py -v` passes. **Step 5:** commit `feat: add config settings and web dependencies`.

---

## Task 2: Wire protocol

**Files:** create `api/src/sketch_party/protocol.py`, `api/tests/test_protocol.py`.

All models use a shared camelCase-alias base so JSON is camelCase but Python stays snake_case.

- [ ] **Step 1: Write the failing test** `tests/test_protocol.py`:
```python
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
        code="WXYZ", phase="lobby", players=[view], round=0, total_rounds=3,
        current_drawer_id=None, you_are_drawer=False, word_length=None,
        seconds_left=None, your_player_id="p1",
    )
    data = dump(msg)
    assert data["type"] == "roomState"
    assert data["totalRounds"] == 3
    assert data["players"][0]["connected"] is True


def test_error_message() -> None:
    assert dump(ErrorMsg(message="bad"))["type"] == "error"
```

- [ ] **Step 2:** run it, confirm ImportError. **Step 3: Implement `protocol.py`.** Define a `WireModel` base with `ConfigDict(alias_generator=to_camel, populate_by_name=True)`; a `dump(msg) -> dict` that returns `msg.model_dump(by_alias=True)`. Client messages: `JoinMsg(type:"join", name, player_id: str | None = None)`, `StartGameMsg(type:"startGame")`, `ChooseWordMsg(type:"chooseWord", word)`, `GuessMsg(type:"guess", text)`, `PlayAgainMsg(type:"playAgain")`; `ClientMessage = Annotated[union, Field(discriminator="type")]`; `client_adapter = TypeAdapter(ClientMessage)`. Server messages (all `WireModel`): `PlayerView(id,name,color,score,connected)`; `ErrorMsg(type:"error", message)`; `RoomStateMsg(type:"roomState", code, phase, players:list[PlayerView], round, total_rounds, current_drawer_id: str|None, you_are_drawer: bool, word_length: int|None, seconds_left: int|None, your_player_id)`; `PlayerJoinedMsg(type:"playerJoined", player: PlayerView)`; `PlayerLeftMsg(type:"playerLeft", player_id)`; `WordChoicesMsg(type:"wordChoices", choices:list[str])`; `TurnStartedMsg(type:"turnStarted", drawer_id, drawer_name, round, word_length, turn_seconds, word: str|None = None)`; `GuessResultMsg(type:"guessResult", result, points)`; `PlayerGuessedMsg(type:"playerGuessedCorrectly", player_id, name)`; `TimerTickMsg(type:"timerTick", seconds_left)`; `TurnScore(player_id, score, gained)`; `TurnEndedMsg(type:"turnEnded", word, scores:list[TurnScore])`; `FinalScore(player_id, name, score)`; `GameOverMsg(type:"gameOver", scores:list[FinalScore])`. Each `type` is a `Literal[...]` with a default value. **Step 4:** tests pass. **Step 5:** commit `feat: add typed wire protocol`.

---

## Task 3: RoomManager and ConnectionManager

**Files:** create `api/src/sketch_party/manager.py`, `api/tests/test_manager.py`.

`ConnectionManager` depends only on a minimal async sender interface so tests use a fake:
```python
class Sender(Protocol):
    async def send_text(self, data: str) -> None: ...
```

- [ ] **Step 1: Write failing tests** `tests/test_manager.py` covering: `create_room` returns a 4-uppercase-letter code and stores a `Room`; codes are unique across many creates; `create_room` raises `RoomError` when `max_rooms` reached; `get` returns the room or `None`; `remove_empty` deletes rooms with no players. For `ConnectionManager`: `connect` then `broadcast` calls `send_text` on all senders in a room with the dumped JSON; `broadcast(exclude=player_id)` skips that player; `send(code, player_id, msg)` reaches only that player; `disconnect` removes a sender so later broadcasts skip it. Use a `FakeWS` recording `sent: list[str]`.

```python
import json
import random

from sketch_party.config import Settings
from sketch_party.manager import ConnectionManager, RoomManager
from sketch_party.models import RoomSettings
from sketch_party.protocol import ErrorMsg


class FakeWS:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send_text(self, data: str) -> None:
        self.sent.append(data)


def make_rm() -> RoomManager:
    return RoomManager(settings=Settings(max_rooms=3), clock=lambda: 0.0, rng=random.Random(0))


def test_create_room_returns_code_and_stores() -> None:
    rm = make_rm()
    code = rm.create_room(RoomSettings())
    assert len(code) == 4 and code.isupper() and code.isalpha()
    assert rm.get(code) is not None


def test_create_room_unique_codes() -> None:
    rm = RoomManager(settings=Settings(max_rooms=50), clock=lambda: 0.0, rng=random.Random(1))
    codes = {rm.create_room(RoomSettings()) for _ in range(30)}
    assert len(codes) == 30


def test_create_room_enforces_max() -> None:
    rm = make_rm()  # max 3
    for _ in range(3):
        rm.create_room(RoomSettings())
    try:
        rm.create_room(RoomSettings())
        raise AssertionError("expected RoomError")
    except Exception as exc:  # noqa: BLE001
        assert type(exc).__name__ == "RoomError"


async def test_broadcast_hits_all_and_exclude_skips() -> None:
    cm = ConnectionManager()
    a, b = FakeWS(), FakeWS()
    await cm.connect("WXYZ", "p1", a)
    await cm.connect("WXYZ", "p2", b)
    await cm.broadcast("WXYZ", ErrorMsg(message="hi"))
    assert len(a.sent) == 1 and len(b.sent) == 1
    assert json.loads(a.sent[0])["type"] == "error"
    a.sent.clear(); b.sent.clear()
    await cm.broadcast("WXYZ", ErrorMsg(message="x"), exclude="p1")
    assert a.sent == [] and len(b.sent) == 1


async def test_send_targets_one_and_disconnect_removes() -> None:
    cm = ConnectionManager()
    a, b = FakeWS(), FakeWS()
    await cm.connect("R", "p1", a)
    await cm.connect("R", "p2", b)
    await cm.send("R", "p1", ErrorMsg(message="only-you"))
    assert len(a.sent) == 1 and b.sent == []
    cm.disconnect("R", "p1")
    await cm.broadcast("R", ErrorMsg(message="again"))
    assert len(a.sent) == 1  # unchanged
```

- [ ] **Step 2:** confirm failure. **Step 3: Implement `manager.py`.** `RoomManager` holds `dict[str, Room]`, injected `settings`, `clock`, `rng`; `create_room` loops generating a 4-letter uppercase code until unused (raise `RoomError` if `len(rooms) >= settings.max_rooms`), constructs `Room(code, room_settings, self._rng, self._clock)`; `get`, `remove_empty`. `ConnectionManager` holds `dict[str, dict[str, Sender]]`; `connect`/`disconnect`/`send`/`broadcast` (broadcast dumps once via `json.dumps(dump(msg))` and sends to each; ignore a sender whose `send_text` raises, and mark it for disconnect). Import `dump` from protocol and `RoomError` from room. **Step 4:** all pass (mark the two async tests are auto-detected via `asyncio_mode=auto`). **Step 5:** commit `feat: add room and connection managers`.

---

## Task 4: GameHub game-loop handlers (no timer yet)

**Files:** create `api/src/sketch_party/hub.py`, `api/tests/test_hub.py`.

`GameHub` wires `RoomManager` + `ConnectionManager`, holds a per-room `asyncio.Lock`, and exposes async handlers. This task implements everything EXCEPT the async wall-clock timer (Task 5): the turn timer is represented by an injected `start_timer`/`cancel_timer` callback pair so the hub is unit-testable without real time. Provide a default no-op pair; Task 5 supplies the real ones.

Handlers to implement (all async, all take `code` and `player_id` where relevant):
- `handle_connect(code, name, player_id_hint) -> str`: create the player id if none, add to `Room` (respect `max_name_length` by truncation, `max_players` via `RoomError`), register the connection, send the joiner a `RoomStateMsg`, broadcast `PlayerJoinedMsg` to others. Returns the player id.
- `handle_start(code, player_id)`: only `order[0]` (host) may start; call `room.start_game()`; then `begin_word_select(code)` (broadcast: send `WordChoicesMsg` to the drawer, broadcast a `RoomStateMsg` reflecting WORD_SELECT to all).
- `handle_choose_word(code, player_id, word)`: `room.choose_word(...)`; broadcast `TurnStartedMsg` to guessers (word=None) and send the drawer its own `TurnStartedMsg` with the word; then `start_timer(code)`.
- `handle_guess(code, player_id, text)`: reject if `len(text) > max_guess_length`; call `room.submit_guess`; send the guesser a private `GuessResultMsg`; on CORRECT also broadcast `PlayerGuessedMsg` and a `RoomStateMsg` (scores changed); if the outcome `turn_over`, `cancel_timer(code)` and `await end_and_advance(code)`.
- `handle_play_again(code, player_id)`: host only; reset scores and return room to LOBBY (add a small `Room.reset()` in Phase 1 module? No - keep Phase 1 frozen: implement reset in the hub by constructing a fresh `Room` with the same players via `RoomManager`, OR add `Room.reset()`.) DECISION: add a tiny `reset()` method to `room.py` (clears phase to LOBBY, zeroes scores, clears turn/round/turns_played). This is a Phase 1 file edit justified by Phase 2 need; keep it minimal and add a test in `test_room.py`.
- `end_and_advance(code)`: `room.end_turn()` if not already ended; broadcast `TurnEndedMsg` (word + per-player gained points - compute gained by diffing scores captured before/after, or read `room.turn.guessed` for guessers and recompute drawer gain); `await asyncio.sleep(settings.interstitial_seconds)` OUTSIDE the lock; `room.next_turn()`; if GAME_OVER broadcast `GameOverMsg`, else `begin_word_select(code)`.
- `handle_disconnect(code, player_id)`: mark away; if the room becomes empty, remove it; if the away player was the drawer mid-turn, `cancel_timer` and `end_and_advance`.

Concurrency: every handler body that touches the room runs under `self._lock(code)`. `end_and_advance` releases the lock during the interstitial sleep, then re-acquires to advance. Capture `room.turns_played` as a turn id where needed to avoid double-advance.

- [ ] **Step 1: Write failing tests** `tests/test_hub.py`. Build a `GameHub` with a `RoomManager` (seeded rng, `clock` returning a controllable value via a mutable holder), a `ConnectionManager` using `FakeWS`, and recording `start_timer`/`cancel_timer` stubs. Cover:
  - two connects: joiner gets `roomState`, first player gets `playerJoined` for the second.
  - non-host start raises / is ignored with an `error`; host start moves to WORD_SELECT and the drawer receives `wordChoices`.
  - choose_word by drawer broadcasts `turnStarted` (guesser copy has `word is None`, drawer copy has the word) and calls `start_timer`.
  - a correct guess at controlled elapsed time yields the right bucket points, sends a private `guessResult`, broadcasts `playerGuessedCorrectly`; when the last non-drawer guesses, `cancel_timer` is called and `turnEnded` is broadcast.
  - `end_and_advance` after a single guesser: drawer gains the mean; a `turnEnded` with correct `gained` values is broadcast; next `wordChoices`/`roomState` or `gameOver`.
  Write focused assertions on the JSON the `FakeWS`es received. Use `settings.interstitial_seconds = 0` in tests to keep them fast.

- [ ] **Step 2:** confirm failures. **Step 3:** implement `hub.py` and the small `Room.reset()` (+ its test). **Step 4:** `uv run pytest -v` all green; `ruff`/`mypy` clean. **Step 5:** commit `feat: add game hub handlers`.

---

## Task 5: Async server-authoritative turn timer

**Files:** modify `api/src/sketch_party/hub.py`; create `api/tests/test_timer.py`.

Add real `start_timer(code)` / `cancel_timer(code)` to `GameHub`. `start_timer` creates an `asyncio.Task` running `_run_timer(code, turn_id)` where `turn_id = room.turns_played` captured at start. `_run_timer` loops: `await asyncio.sleep(1)`, under the lock check the room is still the same turn and DRAWING; broadcast `TimerTickMsg(seconds_left)`; when elapsed >= `settings.turn_seconds`, break and `await end_and_advance(code)` (guarding that the turn id still matches and is not ended). Store tasks in `dict[str, asyncio.Task]`; `cancel_timer` cancels and drops the task. `end_and_advance` must also cancel any lingering timer for that code.

To keep tests fast, `_run_timer` reads the tick interval and cap from settings; tests use `Settings(turn_seconds=2, interstitial_seconds=0)` and a real monotonic clock in the `RoomManager` so elapsed advances. Prefer computing `seconds_left` from the injected clock and `room.turn.start_time` rather than counting loop iterations (robust to scheduling jitter).

- [ ] **Step 1: Write failing async tests** `tests/test_timer.py`: with `turn_seconds=2`, start a game, choose a word, then `await asyncio.sleep(2.2)` and assert the room reached `TURN_END` then advanced (phase WORD_SELECT or GAME_OVER) and that at least one `timerTick` was broadcast with a decreasing `secondsLeft`. Also: an early correct-guess-by-all cancels the timer (no further ticks after the turn ends).
- [ ] **Step 2-4:** implement; confirm green; ruff/mypy clean. **Step 5:** commit `feat: add server-authoritative async turn timer`.

---

## Task 6: FastAPI app and WebSocket endpoint + integration tests

**Files:** create `api/src/sketch_party/app.py`, `api/tests/test_app_ws.py`; add a `[project.scripts]`/uvicorn entry note in README (Phase 7 handles deploy).

`app.py`: build `Settings`, a single `GameHub`, a slowapi `Limiter` (key by remote address). Routes:
- `GET /healthz` -> `{"status": "ok"}`.
- `POST /rooms` (rate-limited, e.g. `10/minute`): body `{rounds?, turnSeconds?}` -> `{"code": ...}` via `RoomManager.create_room`.
- `WebSocket /ws/{code}`: on connect, verify the origin is allowed (close 4403 if not) and the room exists (close 4404 if not); `await ws.accept()`; read the first message, require it is `join`; `player_id = await hub.handle_connect(...)`; then loop `receive_text` -> `client_adapter.validate_json` -> dispatch to the matching `hub.handle_*`; on `WebSocketDisconnect` call `hub.handle_disconnect`. Wrap per-message handling so a `RoomError`/`ValidationError` sends an `ErrorMsg` instead of dropping the socket. Add CORS middleware for the HTTP routes using `settings.allowed_origins`.

The WebSocket needs a `send_text`-compatible sender; FastAPI's `WebSocket.send_text` satisfies the `Sender` protocol directly, so register the raw `WebSocket` with the `ConnectionManager`.

- [ ] **Step 1: Write failing integration tests** `tests/test_app_ws.py` using `fastapi.testclient.TestClient` (sync websocket API):
```python
from fastapi.testclient import TestClient

from sketch_party.app import create_app


def test_healthz() -> None:
    with TestClient(create_app()) as client:
        assert client.get("/healthz").json()["status"] == "ok"


def test_create_room_and_play_a_turn() -> None:
    app = create_app()
    with TestClient(app) as client:
        code = client.post("/rooms", json={"rounds": 1, "turnSeconds": 240}).json()["code"]
        with client.websocket_connect(f"/ws/{code}") as d, client.websocket_connect(f"/ws/{code}") as g:
            d.send_json({"type": "join", "name": "Drawer"})
            g.send_json({"type": "join", "name": "Guesser"})
            # drain join/roomState/playerJoined frames, then host starts
            _drain(d); _drain(g)
            d.send_json({"type": "startGame"})
            choices = _wait_for(d, "wordChoices")["choices"]
            d.send_json({"type": "chooseWord", "word": choices[0]})
            started = _wait_for(d, "turnStarted")
            word = started["word"]
            assert word is not None
            g.send_json({"type": "guess", "text": word})
            result = _wait_for(g, "guessResult")
            assert result["result"] == "correct" and result["points"] == 10
```
Provide `_drain`/`_wait_for` helpers that read frames with a bounded loop (the TestClient websocket `receive_json` blocks; read a fixed number or until a given `type` appears). Also test: creating a WS to a missing room closes; a `POST /rooms` beyond the rate limit returns 429 (call it 11 times).

`create_app()` must build a fresh `GameHub` per app so tests are isolated. Use a real monotonic clock but allow the drawer's first-minute bucket to be deterministic (guess immediately -> elapsed < 60 -> 10 points).

- [ ] **Step 2-4:** implement `app.py` with `create_app()` factory; confirm green; ruff/mypy clean. Ensure `uv run pytest -v` runs the whole suite green. **Step 5:** commit `feat: add FastAPI app with websocket endpoint and integration tests`.

---

## Task 7: README run section and phase status

**Files:** modify `README.md`.

- [ ] Update the Status section to "Phase 2 (WebSocket transport) complete" and add a "Run the server" block:
```bash
cd api
uv sync
uv run uvicorn sketch_party.app:create_app --factory --reload
```
Add one line under Architecture noting the server is authoritative for word, timer, and scoring. Commit `docs: document running the websocket server`.

---

## Definition of done (Phase 2)

- [ ] `uv run pytest -v` green: config, protocol, manager, hub, timer, app integration.
- [ ] `ruff format --check`, `ruff check`, `mypy` strict all clean.
- [ ] Server-authoritative: clients never send scores or elapsed time; the hub computes points from the injected clock and `Room`.
- [ ] Two clients can create a room, join, start, choose a word, and a guess scores end to end over real WebSockets (integration test).
- [ ] No em dashes; files under ~300 lines (split `hub.py` only if it clearly exceeds and the reviewer agrees).
- [ ] Conventional Commits; ready for the Phase 2 PR.

## Self-review notes
- Protocol camelCase via alias generator keeps Python snake_case and matches the future TS client.
- The hub is the single async mutator of `Room`, always under a per-room lock; the timer captures a turn id (`turns_played`) to avoid double-advance; early finish cancels the timer.
- `Room.reset()` is the only Phase 1 edit, kept minimal and tested.
- Guess length is capped at the WS boundary (Phase 1 review carry-forward). The `StrEnum` carry-forward is handled opportunistically: when protocol needs the enum values as strings they already serialize correctly; if the reviewer prefers, convert `models.py` enums to `enum.StrEnum` in this phase.
