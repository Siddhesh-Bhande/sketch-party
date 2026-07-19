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
