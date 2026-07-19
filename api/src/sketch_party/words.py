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
