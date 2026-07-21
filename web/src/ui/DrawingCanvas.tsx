import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useRef } from 'react'

import type { Point, Stroke } from '../protocol'
import { appendPoint, buildStroke, toCanvasCoords, toNormalized } from './strokeGeometry'

const THROTTLE_MS = 50

export interface DrawingCanvasProps {
  strokes: Stroke[]
  editable: boolean
  color: string
  size: number
  onStroke?: (stroke: Stroke) => void
}

function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  const first = stroke.points[0]
  if (!first) return
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const start = toCanvasCoords(first, width, height)
  ctx.moveTo(start.x, start.y)
  if (stroke.points.length === 1) ctx.lineTo(start.x, start.y)
  for (const point of stroke.points.slice(1)) {
    const { x, y } = toCanvasCoords(point, width, height)
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}

/**
 * Renders normalized (0..1) strokes onto a device-pixel-crisp `<canvas>`. When
 * `editable`, pointer input drives a growing local stroke reported via
 * `onStroke` (throttled while dragging, and once more on release).
 */
export function DrawingCanvas({ strokes, editable, color, size, onStroke }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef(strokes)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const lastSentRef = useRef(0)
  const liveRef = useRef({ color, size, onStroke })

  useEffect(() => {
    liveRef.current = { color, size, onStroke }
  }, [color, size, onStroke])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of strokesRef.current) paintStroke(ctx, stroke, width, height)
    if (currentStrokeRef.current) paintStroke(ctx, currentStrokeRef.current, width, height)
  }, [])

  useEffect(() => {
    strokesRef.current = strokes
    draw()
  }, [strokes, draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  const pointFromEvent = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    return toNormalized(x, y, rect.width, rect.height)
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!editable) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const { color: liveColor, size: liveSize } = liveRef.current
      currentStrokeRef.current = buildStroke(
        crypto.randomUUID(),
        liveColor,
        liveSize,
        pointFromEvent(event),
      )
      lastSentRef.current = 0
      draw()
    },
    [editable, pointFromEvent, draw],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const current = currentStrokeRef.current
      if (!editable || !current) return
      const stroke = appendPoint(current, pointFromEvent(event))
      currentStrokeRef.current = stroke
      draw()
      const now = performance.now()
      if (now - lastSentRef.current >= THROTTLE_MS) {
        lastSentRef.current = now
        liveRef.current.onStroke?.(stroke)
      }
    },
    [editable, pointFromEvent, draw],
  )

  const handlePointerUp = useCallback(() => {
    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null
    draw()
    if (stroke) liveRef.current.onStroke?.(stroke)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Drawing canvas"
      className="h-full w-full touch-none rounded-2xl border border-line bg-surface"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  )
}
