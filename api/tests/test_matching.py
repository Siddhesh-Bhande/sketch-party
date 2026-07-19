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
    assert is_near_miss("aple", "apple") is True  # deletion
    assert is_near_miss("appl", "apple") is True  # deletion
    assert is_near_miss("axple", "apple") is True  # substitution


def test_exact_match_is_not_a_near_miss() -> None:
    assert is_near_miss("apple", "apple") is False


def test_two_character_difference_is_not_a_near_miss() -> None:
    assert is_near_miss("axxle", "apple") is False
