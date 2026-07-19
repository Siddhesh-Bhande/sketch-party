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
