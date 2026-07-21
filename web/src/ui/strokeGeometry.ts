// Pure geometry helpers for DrawingCanvas: normalized (0..1) point <-> canvas
// pixel coordinates, and the growing-stroke helpers used by the pointer
// handlers. Kept free of the DOM so it is directly unit-testable.

import type { Point, Stroke } from '../protocol'

/** Maps a normalized (0..1) point to pixel coordinates for a canvas of the given size. */
export function toCanvasCoords(point: Point, width: number, height: number): Point {
  return { x: point.x * width, y: point.y * height }
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Maps a pixel coordinate to a normalized (0..1) point, clamped to the
 * canvas bounds. A zero-size canvas maps everything to the origin instead
 * of dividing by zero.
 */
export function toNormalized(x: number, y: number, width: number, height: number): Point {
  const nx = width > 0 ? x / width : 0
  const ny = height > 0 ? y / height : 0
  return { x: clamp01(nx), y: clamp01(ny) }
}

/** Starts a new single-point stroke with the given id, color, and size. */
export function buildStroke(id: string, color: string, size: number, point: Point): Stroke {
  return { id, color, size, points: [point] }
}

/** Returns a new stroke with `point` appended; does not mutate `stroke`. */
export function appendPoint(stroke: Stroke, point: Point): Stroke {
  return { ...stroke, points: [...stroke.points, point] }
}
