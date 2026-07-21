import { describe, expect, it } from 'vitest'

import { appendPoint, buildStroke, toCanvasCoords, toNormalized } from './strokeGeometry'

describe('toCanvasCoords', () => {
  it('scales a normalized point to canvas pixel coordinates', () => {
    expect(toCanvasCoords({ x: 0.5, y: 0.25 }, 200, 400)).toEqual({ x: 100, y: 100 })
  })

  it('maps the origin and far corner to the canvas edges', () => {
    expect(toCanvasCoords({ x: 0, y: 0 }, 300, 300)).toEqual({ x: 0, y: 0 })
    expect(toCanvasCoords({ x: 1, y: 1 }, 300, 300)).toEqual({ x: 300, y: 300 })
  })
})

describe('toNormalized', () => {
  it('maps pixel coordinates back to a 0..1 point', () => {
    expect(toNormalized(100, 100, 200, 400)).toEqual({ x: 0.5, y: 0.25 })
  })

  it('clamps out-of-bounds coordinates to 0..1', () => {
    expect(toNormalized(-50, 500, 200, 400)).toEqual({ x: 0, y: 1 })
  })

  it('treats a zero-size canvas as the origin instead of dividing by zero', () => {
    expect(toNormalized(10, 10, 0, 0)).toEqual({ x: 0, y: 0 })
  })
})

describe('buildStroke', () => {
  it('creates a single-point stroke with the given id, color, and size', () => {
    const stroke = buildStroke('abc', '#ff0000', 8, { x: 0.1, y: 0.2 })
    expect(stroke).toEqual({ id: 'abc', color: '#ff0000', size: 8, points: [{ x: 0.1, y: 0.2 }] })
  })
})

describe('appendPoint', () => {
  it('returns a new stroke with the point appended, without mutating the original', () => {
    const stroke = buildStroke('abc', '#000000', 4, { x: 0, y: 0 })
    const next = appendPoint(stroke, { x: 1, y: 1 })

    expect(next.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ])
    expect(stroke.points).toEqual([{ x: 0, y: 0 }])
    expect(next).not.toBe(stroke)
  })

  it('appends multiple points in order', () => {
    let stroke = buildStroke('abc', '#000000', 4, { x: 0, y: 0 })
    stroke = appendPoint(stroke, { x: 0.2, y: 0.2 })
    stroke = appendPoint(stroke, { x: 0.4, y: 0.4 })

    expect(stroke.points).toEqual([
      { x: 0, y: 0 },
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.4 },
    ])
  })
})
