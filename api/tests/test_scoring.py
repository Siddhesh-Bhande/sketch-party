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
