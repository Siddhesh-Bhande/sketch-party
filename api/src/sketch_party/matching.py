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
