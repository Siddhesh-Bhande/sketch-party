# Sketch Party — Phase 1: Backend Domain Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and fully unit-test the pure domain core of the Sketch Party backend: the word list, guess matching, scoring, and the server-authoritative room state machine, with no web framework or sockets yet.

**Architecture:** Pure Python, no I/O. Time is injected via a `clock` callable and randomness via an injected `random.Random`, so every rule is deterministic and unit-testable. The room is a state machine (`LOBBY -> WORD_SELECT -> DRAWING -> TURN_END -> GAME_OVER`) whose methods return small result objects. Phase 2 wraps this core in FastAPI WebSockets; the core never imports FastAPI.

**Tech Stack:** Python 3.12, `uv`, ruff (format + lint), mypy strict, pytest. Mirrors the DesertCharge `api/` layout and CI exactly.

---

## Phase roadmap (context, not part of this plan)

This spec is built in phases, one PR each. This document is **Phase 1 only**. Later phases get their own plans.

| Phase | Scope | Spec sections |
|---|---|---|
| **1 (this doc)** | Backend domain core: words, matching, scoring, room state machine, CI + repo hygiene | Game flow, Scoring, Answer matching, Testing (backend unit) |
| 2 | FastAPI WebSocket transport, HTTP routes, typed protocol, integration tests | Architecture, Real-time protocol, Demo caps/rate limits |
| 3 | Frontend foundation: Home, create/join, Lobby, `useGameSocket`, Zustand store | Frontend screens, Reconnection (client) |
| 4 | Drawing canvas + live stroke sync + replay | Drawing and canvas |
| 5 | Full game-loop UI: word select, drawing/guessing, timer, scores, game over | Game flow (UI), Scoring (display) |
| 6 | Reconnect, lone-visitor demo (second player + QR + keep-warm), a11y, perf, Playwright two-client e2e | Reconnection, Demo/iframe, A11y/perf, Testing (e2e) |
| 7 | Deploy (Fly.io + Vercel), CI polish, README case study | Deployment, CI and repo |

---

## File structure (Phase 1)

Created under `sketch-party/api/`:

- `pyproject.toml` — project + tool config (ruff, mypy strict, pytest), mirrors DesertCharge.
- `src/sketch_party/__init__.py` — package marker.
- `src/sketch_party/models.py` — enums and dataclasses shared across the core (`GamePhase`, `Difficulty`, `Player`, `RoomSettings`, `Turn`, `GuessResult`, `GuessOutcome`).
- `src/sketch_party/words.py` — curated tiered word list + `pick_word_choices`.
- `src/sketch_party/matching.py` — `normalize`, `is_correct`, `is_near_miss` (+ internal Levenshtein).
- `src/sketch_party/scoring.py` — `points_for_elapsed`, `drawer_points`.
- `src/sketch_party/room.py` — `Room` state machine + `RoomManager`.
- `tests/test_words.py`, `tests/test_matching.py`, `tests/test_scoring.py`, `tests/test_room.py`.

Repo-root files created for CI/hygiene: `README.md`, `LICENSE`, `.env.example`, `.github/workflows/ci.yml`. (`.gitignore` already exists.)

Each source file stays well under 300 lines and has one responsibility.

---

## Task 1: Scaffold the backend project

**Files:**
- Create: `sketch-party/api/pyproject.toml`
- Create: `sketch-party/api/src/sketch_party/__init__.py`
- Create: `sketch-party/api/tests/__init__.py`
- Create: `sketch-party/api/tests/test_smoke.py`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "sketch-party"
version = "0.1.0"
description = "Sketch Party backend: server-authoritative real-time drawing game."
requires-python = ">=3.12"
dependencies = []

[dependency-groups]
dev = [
    "ruff>=0.5",
    "mypy>=1.10",
    "pytest>=8.2",
    "pytest-asyncio>=0.23",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/sketch_party"]

[tool.ruff]
line-length = 100
target-version = "py312"
src = ["src", "tests"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM", "RUF"]

[tool.mypy]
python_version = "3.12"
strict = true
mypy_path = "src"
files = ["src", "tests"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["src"]
```

- [ ] **Step 2: Create the package and test markers**

Create `src/sketch_party/__init__.py` with a single line:

```python
"""Sketch Party backend domain core."""
```

Create empty `tests/__init__.py` (no content).

- [ ] **Step 3: Write a smoke test**

`tests/test_smoke.py`:

```python
import sketch_party


def test_package_imports() -> None:
    assert sketch_party.__doc__ is not None
```

- [ ] **Step 4: Sync and run tooling**

Run (from `sketch-party/api/`):

```bash
uv sync
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest -v
```

Expected: `uv sync` creates `.venv` and `uv.lock`; ruff/mypy pass; pytest shows `test_package_imports PASSED`.

- [ ] **Step 5: Commit**

```bash
git add sketch-party/api/pyproject.toml sketch-party/api/uv.lock sketch-party/api/src sketch-party/api/tests
git commit -m "chore: scaffold Sketch Party backend package"
```

---

## Task 2: Domain models and enums

**Files:**
- Create: `sketch-party/api/src/sketch_party/models.py`
- Test: `sketch-party/api/tests/test_models.py`

- [ ] **Step 1: Write the failing test**

`tests/test_models.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sketch_party.models'`.

- [ ] **Step 3: Write `models.py`**

```python
"""Shared enums and dataclasses for the domain core."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class GamePhase(str, Enum):
    LOBBY = "lobby"
    WORD_SELECT = "word_select"
    DRAWING = "drawing"
    TURN_END = "turn_end"
    GAME_OVER = "game_over"


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class GuessResult(str, Enum):
    CORRECT = "correct"
    NEAR = "near"
    WRONG = "wrong"
    IGNORED = "ignored"


@dataclass
class Player:
    id: str
    name: str
    color: str
    connected: bool = True
    score: int = 0


@dataclass(frozen=True)
class RoomSettings:
    rounds: int = 3
    turn_seconds: int = 240
    max_players: int = 10


@dataclass
class Turn:
    drawer_id: str
    word: str
    start_time: float
    guessed: dict[str, int] = field(default_factory=dict)
    ended: bool = False


@dataclass
class GuessOutcome:
    result: GuessResult
    points: int = 0
    turn_over: bool = False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_models.py -v`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add sketch-party/api/src/sketch_party/models.py sketch-party/api/tests/test_models.py
git commit -m "feat: add domain models and enums"
```

---

## Task 3: Word list and choices

**Files:**
- Create: `sketch-party/api/src/sketch_party/words.py`
- Test: `sketch-party/api/tests/test_words.py`

- [ ] **Step 1: Write the failing test**

`tests/test_words.py`:

```python
import random

from sketch_party.models import Difficulty
from sketch_party.words import WORDS, pick_word_choices


def test_word_bank_has_all_tiers_populated() -> None:
    for difficulty in Difficulty:
        assert len(WORDS[difficulty]) >= 15


def test_words_are_lowercase_and_unique() -> None:
    all_words = [w for bank in WORDS.values() for w in bank]
    assert all(w == w.lower() for w in all_words)
    assert len(all_words) == len(set(all_words))


def test_pick_word_choices_returns_three_distinct_words() -> None:
    rng = random.Random(42)
    choices = pick_word_choices(rng)
    assert len(choices) == 3
    assert len(set(choices)) == 3


def test_pick_word_choices_is_deterministic_with_seed() -> None:
    assert pick_word_choices(random.Random(1)) == pick_word_choices(random.Random(1))


def test_pick_word_choices_spans_difficulties() -> None:
    # One easy, one medium, one hard, so the drawer always has a range.
    rng = random.Random(7)
    choices = pick_word_choices(rng)
    tiers = {d for d in Difficulty for w in choices if w in WORDS[d]}
    assert tiers == {Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_words.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sketch_party.words'`.

- [ ] **Step 3: Write `words.py`**

Provide at least 15 words per tier. One choice is drawn from each tier so the drawer always sees an easy/medium/hard spread.

```python
"""Curated word bank and per-turn word selection."""

from __future__ import annotations

import random

from sketch_party.models import Difficulty

WORDS: dict[Difficulty, list[str]] = {
    Difficulty.EASY: [
        "apple", "house", "tree", "cat", "dog", "star", "sun", "moon",
        "fish", "car", "boat", "hat", "book", "ball", "cake", "shoe",
        "clock", "key", "leaf", "cup",
    ],
    Difficulty.MEDIUM: [
        "bicycle", "guitar", "rocket", "castle", "dragon", "umbrella",
        "penguin", "volcano", "lighthouse", "hammock", "cactus", "compass",
        "windmill", "tractor", "jellyfish", "snowman", "anchor", "trophy",
        "igloo", "kite",
    ],
    Difficulty.HARD: [
        "telescope", "hurricane", "escalator", "kangaroo", "saxophone",
        "chandelier", "parachute", "avalanche", "microscope", "helicopter",
        "waterfall", "treadmill", "stethoscope", "accordion", "porcupine",
        "trampoline", "wheelbarrow", "fingerprint", "constellation", "submarine",
    ],
}


def pick_word_choices(rng: random.Random) -> list[str]:
    """Pick one word from each difficulty tier, easy to hard."""
    return [rng.choice(WORDS[difficulty]) for difficulty in Difficulty]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_words.py -v`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add sketch-party/api/src/sketch_party/words.py sketch-party/api/tests/test_words.py
git commit -m "feat: add curated word bank and per-turn word selection"
```

---

## Task 4: Guess normalization and matching

**Files:**
- Create: `sketch-party/api/src/sketch_party/matching.py`
- Test: `sketch-party/api/tests/test_matching.py`

- [ ] **Step 1: Write the failing test**

`tests/test_matching.py`:

```python
from sketch_party.matching import is_correct, is_near_miss, normalize


def test_normalize_lowercases_and_trims() -> None:
    assert normalize("  Apple  ") == "apple"


def test_normalize_strips_punctuation_and_diacritics() -> None:
    assert normalize("Piñata!") == "pinata"
    assert normalize("ice-cream") == "icecream"


def test_normalize_collapses_whitespace() -> None:
    assert normalize("hot   dog") == "hot dog"


def test_is_correct_ignores_case_and_spacing() -> None:
    assert is_correct("APPLE", "apple") is True
    assert is_correct(" apple ", "apple") is True
    assert is_correct("apples", "apple") is False


def test_near_miss_detects_single_character_difference() -> None:
    assert is_near_miss("aple", "apple") is True     # deletion
    assert is_near_miss("appl", "apple") is True      # deletion
    assert is_near_miss("axple", "apple") is True     # substitution


def test_exact_match_is_not_a_near_miss() -> None:
    assert is_near_miss("apple", "apple") is False


def test_two_character_difference_is_not_a_near_miss() -> None:
    assert is_near_miss("axxle", "apple") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_matching.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sketch_party.matching'`.

- [ ] **Step 3: Write `matching.py`**

```python
"""Guess normalization and match / near-miss detection."""

from __future__ import annotations

import re
import unicodedata

_KEEP = re.compile(r"[^a-z0-9 ]")
_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    lowered = stripped.lower().strip()
    cleaned = _KEEP.sub("", lowered)
    return _SPACES.sub(" ", cleaned).strip()


def is_correct(guess: str, target: str) -> bool:
    return normalize(guess) == normalize(target)


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost))
        previous = current
    return previous[-1]


def is_near_miss(guess: str, target: str) -> bool:
    g, t = normalize(guess), normalize(target)
    if g == t:
        return False
    return _levenshtein(g, t) == 1
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_matching.py -v`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add sketch-party/api/src/sketch_party/matching.py sketch-party/api/tests/test_matching.py
git commit -m "feat: add guess normalization and near-miss matching"
```

---

## Task 5: Scoring functions

**Files:**
- Create: `sketch-party/api/src/sketch_party/scoring.py`
- Test: `sketch-party/api/tests/test_scoring.py`

Note: use half-up rounding (`int(mean + 0.5)`), NOT Python's `round()`, which uses banker's rounding and would turn a mean of 8.5 into 8.

- [ ] **Step 1: Write the failing test**

`tests/test_scoring.py`:

```python
import pytest

from sketch_party.scoring import drawer_points, points_for_elapsed


@pytest.mark.parametrize(
    ("elapsed", "expected"),
    [
        (0.0, 10),
        (60.0, 10),
        (60.1, 9),
        (120.0, 9),
        (120.1, 8),
        (180.0, 8),
        (180.1, 7),
        (240.0, 7),
    ],
)
def test_points_for_elapsed_buckets(elapsed: float, expected: int) -> None:
    assert points_for_elapsed(elapsed) == expected


def test_drawer_points_is_mean_including_zeros() -> None:
    # Three guessers: 10, 8, and one who never guessed (0). Mean 6.0 -> 6.
    assert drawer_points([10, 8, 0]) == 6


def test_drawer_points_rounds_half_up() -> None:
    # Mean 8.5 must round up to 9, not down (banker's rounding trap).
    assert drawer_points([10, 7]) == 9  # 8.5 -> 9
    assert drawer_points([9, 8]) == 9   # 8.5 -> 9


def test_drawer_points_zero_when_nobody_guessed() -> None:
    assert drawer_points([0, 0, 0]) == 0


def test_drawer_points_empty_is_zero() -> None:
    assert drawer_points([]) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_scoring.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sketch_party.scoring'`.

- [ ] **Step 3: Write `scoring.py`**

```python
"""Turn scoring: time buckets for guessers, mean for the drawer."""

from __future__ import annotations


def points_for_elapsed(elapsed_seconds: float) -> int:
    if elapsed_seconds <= 60:
        return 10
    if elapsed_seconds <= 120:
        return 9
    if elapsed_seconds <= 180:
        return 8
    return 7


def drawer_points(non_drawer_points: list[int]) -> int:
    """Mean of every non-drawer player's turn points, including 0s, half-up."""
    if not non_drawer_points:
        return 0
    mean = sum(non_drawer_points) / len(non_drawer_points)
    return int(mean + 0.5)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_scoring.py -v`
Expected: all tests PASS (8 parametrized bucket cases + 4 drawer cases).

- [ ] **Step 5: Commit**

```bash
git add sketch-party/api/src/sketch_party/scoring.py sketch-party/api/tests/test_scoring.py
git commit -m "feat: add time-bucket and drawer-average scoring"
```

---

## Task 6: Room lobby — join, leave, away

**Files:**
- Create: `sketch-party/api/src/sketch_party/room.py`
- Test: `sketch-party/api/tests/test_room.py`

The `Room` takes an injected `clock` (a `Callable[[], float]` returning seconds) and an injected `random.Random`, so tests control time and word choice.

- [ ] **Step 1: Write the failing test**

`tests/test_room.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_room.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sketch_party.room'`.

- [ ] **Step 3: Write the lobby portion of `room.py`**

Players are assigned a color from a fixed palette by join position.

```python
"""Server-authoritative room state machine and room manager."""

from __future__ import annotations

import random
from collections.abc import Callable

from sketch_party.models import (
    GamePhase,
    GuessOutcome,
    GuessResult,
    Player,
    RoomSettings,
    Turn,
)

PALETTE = [
    "#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#8338ec",
    "#ff6b6b", "#06d6a0", "#118ab2", "#ef476f", "#ffd166",
]


class RoomError(Exception):
    """Raised when an action is invalid for the current room state."""


class Room:
    def __init__(
        self,
        code: str,
        settings: RoomSettings,
        rng: random.Random,
        clock: Callable[[], float],
    ) -> None:
        self.code = code
        self.settings = settings
        self._rng = rng
        self._clock = clock
        self.players: dict[str, Player] = {}
        self.order: list[str] = []
        self.phase = GamePhase.LOBBY
        self.round = 0
        self.turns_played = 0
        self.total_turns = 0
        self.turn: Turn | None = None
        self.word_choices: list[str] = []

    def add_player(self, player_id: str, name: str) -> Player:
        if player_id in self.players:
            raise RoomError("player already in room")
        if len(self.players) >= self.settings.max_players:
            raise RoomError("room is full")
        color = PALETTE[len(self.order) % len(PALETTE)]
        player = Player(id=player_id, name=name, color=color)
        self.players[player_id] = player
        self.order.append(player_id)
        return player

    def mark_away(self, player_id: str) -> None:
        if player_id in self.players:
            self.players[player_id].connected = False

    def remove_player(self, player_id: str) -> None:
        self.players.pop(player_id, None)
        if player_id in self.order:
            self.order.remove(player_id)

    def is_empty(self) -> bool:
        return len(self.players) == 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_room.py -v`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add sketch-party/api/src/sketch_party/room.py sketch-party/api/tests/test_room.py
git commit -m "feat: add room lobby state (join, leave, away)"
```

---

## Task 7: Room game start and drawer rotation

**Files:**
- Modify: `sketch-party/api/src/sketch_party/room.py`
- Test: `sketch-party/api/tests/test_room.py` (add tests)

- [ ] **Step 1: Add failing tests**

Append to `tests/test_room.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_room.py -v`
Expected: FAIL with `AttributeError: 'Room' object has no attribute 'start_game'`.

- [ ] **Step 3: Add the methods to `room.py`**

Add these methods to the `Room` class (below `is_empty`). Import `pick_word_choices` at the top: add `from sketch_party.words import pick_word_choices`.

```python
    def current_drawer_id(self) -> str:
        if not self.order:
            raise RoomError("no players")
        return self.order[self.turns_played % len(self.order)]

    def start_game(self) -> None:
        if self.phase is not GamePhase.LOBBY:
            raise RoomError("game already started")
        if len(self.order) < 2:
            raise RoomError("need at least two players")
        self.total_turns = self.settings.rounds * len(self.order)
        self.turns_played = 0
        self.round = 1
        self._begin_turn()

    def _begin_turn(self) -> None:
        self.phase = GamePhase.WORD_SELECT
        self.word_choices = pick_word_choices(self._rng)
        self.turn = None

    def next_turn(self) -> None:
        if self.phase is not GamePhase.TURN_END:
            raise RoomError("turn not finished")
        self.turns_played += 1
        if self.turns_played >= self.total_turns:
            self.phase = GamePhase.GAME_OVER
            self.turn = None
            return
        self.round = (self.turns_played // len(self.order)) + 1
        self._begin_turn()
```

`end_turn` finalizes the current turn and rests at `TURN_END`; `next_turn` is a separate
step that advances to the next drawer's `WORD_SELECT` (or `GAME_OVER`). This keeps
`TURN_END` as a real interstitial phase, matching the spec's state machine.

Note: `choose_word` gets its full form here; `end_turn` gets a minimal form now that Task 8
replaces with the scoring version, and `submit_guess` is added in Task 8.

```python
    def choose_word(self, player_id: str, word: str) -> None:
        if self.phase is not GamePhase.WORD_SELECT:
            raise RoomError("not choosing a word")
        if player_id != self.current_drawer_id():
            raise RoomError("only the drawer chooses the word")
        if word not in self.word_choices:
            raise RoomError("word not offered")
        self.phase = GamePhase.DRAWING
        self.turn = Turn(drawer_id=player_id, word=word, start_time=self._clock())

    def end_turn(self) -> None:
        if self.turn is None:
            raise RoomError("no active turn")
        self.turn.ended = True
        self.phase = GamePhase.TURN_END
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_room.py -v`
Expected: all lobby + rotation tests PASS.

- [ ] **Step 5: Commit**

```bash
git add sketch-party/api/src/sketch_party/room.py sketch-party/api/tests/test_room.py
git commit -m "feat: add game start, drawer rotation, and round tracking"
```

---

## Task 8: Room guessing and turn scoring

**Files:**
- Modify: `sketch-party/api/src/sketch_party/room.py`
- Test: `sketch-party/api/tests/test_room.py` (add tests)

This wires matching + scoring into the room: guesses award time-bucket points, the drawer gets the mean at turn end, correct scores land on `Player.score`, and the turn ends early once every non-drawer has guessed.

- [ ] **Step 1: Add failing tests**

Append to `tests/test_room.py`. These use a mutable clock so elapsed time is controllable:

```python
from sketch_party.models import GuessResult


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
    room, clock = drawing_room(players=3)  # drawer p0, guessers p1 p2
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
    try:
        room.end_turn()
    except RoomError:
        pass
    assert room.players["p0"].score == drawer_score
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_room.py -v`
Expected: FAIL (submit_guess missing, and the minimal `end_turn` does not compute drawer points).

- [ ] **Step 3: Replace `choose_word`/`end_turn` and add `submit_guess`**

Add imports at the top of `room.py`:

```python
from sketch_party.matching import is_correct, is_near_miss
from sketch_party.scoring import drawer_points, points_for_elapsed
```

Replace the minimal `end_turn` from Task 7 with the scoring version, and add `submit_guess` + a helper. `choose_word` from Task 7 is unchanged.

```python
    def submit_guess(self, player_id: str, text: str) -> GuessOutcome:
        if self.phase is not GamePhase.DRAWING or self.turn is None:
            return GuessOutcome(result=GuessResult.IGNORED)
        if player_id == self.turn.drawer_id or player_id not in self.players:
            return GuessOutcome(result=GuessResult.IGNORED)
        if player_id in self.turn.guessed:
            return GuessOutcome(result=GuessResult.IGNORED)

        if is_correct(text, self.turn.word):
            elapsed = self._clock() - self.turn.start_time
            points = points_for_elapsed(elapsed)
            self.turn.guessed[player_id] = points
            self.players[player_id].score += points
            turn_over = self._all_non_drawers_guessed()
            if turn_over:
                self.end_turn()
            return GuessOutcome(
                result=GuessResult.CORRECT, points=points, turn_over=turn_over
            )
        if is_near_miss(text, self.turn.word):
            return GuessOutcome(result=GuessResult.NEAR)
        return GuessOutcome(result=GuessResult.WRONG)

    def _all_non_drawers_guessed(self) -> bool:
        assert self.turn is not None
        non_drawers = [pid for pid in self.order if pid != self.turn.drawer_id]
        return all(pid in self.turn.guessed for pid in non_drawers)

    def end_turn(self) -> None:
        if self.turn is None or self.turn.ended:
            raise RoomError("no active turn")
        drawer_id = self.turn.drawer_id
        non_drawer_points = [
            self.turn.guessed.get(pid, 0) for pid in self.order if pid != drawer_id
        ]
        self.players[drawer_id].score += drawer_points(non_drawer_points)
        self.turn.ended = True
        self.phase = GamePhase.TURN_END
```

Note: this scoring `end_turn` still rests at `TURN_END` and does not advance; `next_turn`
(Task 7) advances. Because `submit_guess` may call `end_turn` internally, the earlier Task 7
rotation tests that call `end_turn` then `next_turn` still work (no guesses means the turn is
not yet ended, so scoring adds 0 for the drawer). The `test_end_turn_is_idempotent_scorewise`
test relies on `end_turn` raising once `turn.ended` is true.

- [ ] **Step 4: Run the full backend suite**

Run: `uv run pytest -v`
Expected: every test across all files PASSES.

Then run the quality gates:

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy
```

Expected: all clean. (If mypy flags the `assert self.turn is not None` narrowing, keep the assert; it is the idiomatic narrow here.)

- [ ] **Step 5: Commit**

```bash
git add sketch-party/api/src/sketch_party/room.py sketch-party/api/tests/test_room.py
git commit -m "feat: wire guessing and turn scoring into the room"
```

---

## Task 9: Repo hygiene files and backend CI

**Files:**
- Create: `sketch-party/README.md`
- Create: `sketch-party/LICENSE`
- Create: `sketch-party/.env.example`
- Create: `sketch-party/.github/workflows/ci.yml`

- [ ] **Step 1: Write `README.md` (case-study stub)**

```markdown
# Sketch Party

Real-time, mobile-first drawing-and-guessing party game. 2 to 10 players join a room by
code, one draws a secret word while everyone guesses in real time, and points scale with
how fast you guess. No login, no database: rooms live in server memory.

Built to demonstrate real-time systems, a server-authoritative game loop over WebSockets,
a custom typed protocol, React performance, and accessibility around an inherently visual
surface.

## Status

Phase 1 (backend domain core) in progress. See `docs/superpowers/plans/` for the build plan.

## Local run (backend core)

```bash
cd api
uv sync
uv run pytest -v
```

## Architecture

Backend: FastAPI WebSockets + an in-memory, server-authoritative room manager (Phase 2).
Frontend: Vite + React 19 + TypeScript + Tailwind (Phase 3+). Single instance by design;
scaling out would use Redis pub/sub (documented as future work).
```

- [ ] **Step 2: Write `LICENSE`**

Standard MIT license text, copyright `2026 Siddhesh Bhande`. (Copy the MIT template; fill year and name.)

- [ ] **Step 3: Write `.env.example`**

```bash
# Backend (Phase 2+). No secrets required for the domain core.
# Comma-separated origins allowed to open a WebSocket (the portfolio + local dev).
ALLOWED_ORIGINS=http://localhost:5173
# Port the server binds (Fly/Render inject their own).
PORT=8000
```

- [ ] **Step 4: Write `.github/workflows/ci.yml`**

Mirror DesertCharge: a hygiene job (no em dashes, required files) and a backend job (uv, ruff format/lint, mypy, pytest). The frontend job is added in a later phase.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  hygiene:
    name: Repo hygiene
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: No em dashes
        run: |
          python3 - <<'PY'
          import subprocess, sys
          files = subprocess.check_output(["git", "ls-files"]).decode().splitlines()
          em_dash = chr(0x2014)
          offenders = []
          for path in files:
              try:
                  with open(path, encoding="utf-8") as handle:
                      for num, line in enumerate(handle, 1):
                          if em_dash in line:
                              offenders.append(f"{path}:{num}")
              except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError):
                  continue
          if offenders:
              print("Em dash (U+2014) is forbidden by rules.md. Found in:")
              print("\n".join(offenders))
              sys.exit(1)
          print("No em dashes found.")
          PY
      - name: Required project files present
        run: |
          missing=0
          for file in README.md LICENSE .gitignore .env.example; do
            if [ ! -f "$file" ]; then
              echo "Missing required file: $file"
              missing=1
            fi
          done
          [ "$missing" -eq 0 ] && echo "All required files present."
          exit "$missing"

  backend:
    name: Backend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4
      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "0.11.26"
      - name: Set up Python
        run: uv python install 3.12
      - name: Install dependencies
        run: uv sync
      - name: Format check
        run: uv run ruff format --check .
      - name: Lint
        run: uv run ruff check .
      - name: Type check
        run: uv run mypy
      - name: Test
        run: uv run pytest -v
```

- [ ] **Step 5: Verify locally and commit**

Run from `sketch-party/api/`: `uv run ruff format --check . && uv run ruff check . && uv run mypy && uv run pytest -v`
Expected: all clean.

```bash
git add sketch-party/README.md sketch-party/LICENSE sketch-party/.env.example sketch-party/.github/workflows/ci.yml
git commit -m "chore: add repo hygiene files and backend CI"
```

---

## Definition of done (Phase 1)

- [ ] `uv run pytest -v` green: models, words, matching, scoring, room (lobby + rotation + guessing/scoring).
- [ ] `uv run ruff format --check .`, `uv run ruff check .`, and `uv run mypy` all clean.
- [ ] Every source file under 300 lines, one responsibility each.
- [ ] Repo hygiene files present; CI workflow committed.
- [ ] All work committed as small Conventional Commits; ready for a Phase 1 PR.

## Self-review notes

- **Spec coverage (Phase 1 slice):** game flow state machine (Task 6-8), scoring incl. drawer-average edge cases (Task 5, 8), answer matching + near-miss (Task 4), word bank (Task 3), backend unit testing (all tasks). Transport, protocol, frontend, reconnect wiring, demo, a11y, deploy are explicitly deferred to Phases 2 to 7.
- **Determinism:** time via injected `clock`, randomness via injected `random.Random`; no wall-clock or global RNG in the core.
- **Rounding:** `drawer_points` uses half-up (`int(mean + 0.5)`) to avoid banker's rounding, covered by `test_drawer_points_rounds_half_up`.
- **Type consistency:** `current_drawer_id()`, `submit_guess()`, `choose_word()`, `end_turn()`, `next_turn()`, `_begin_turn()`, `_all_non_drawers_guessed()` names are used identically across tasks and tests. `end_turn` finalizes/scores and rests at `TURN_END`; `next_turn` advances.
