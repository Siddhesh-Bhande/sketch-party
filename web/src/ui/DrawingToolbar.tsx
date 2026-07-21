import { Button } from './Button'

interface ColorSwatch {
  label: string
  value: string
}

// Solid colors only, no gradients. The eraser paints the paper background color.
const PALETTE: ColorSwatch[] = [
  { label: 'Black', value: '#1b1e28' },
  { label: 'White', value: '#ffffff' },
  { label: 'Red', value: '#e63946' },
  { label: 'Orange', value: '#f4a261' },
  { label: 'Yellow', value: '#ffd166' },
  { label: 'Green', value: '#2a9d8f' },
  { label: 'Blue', value: '#457b9d' },
  { label: 'Purple', value: '#8338ec' },
  { label: 'Pink', value: '#ef476f' },
  { label: 'Brown', value: '#6f4518' },
  { label: 'Eraser', value: '#f6f3ec' },
]

interface BrushSize {
  label: string
  value: number
}

const BRUSH_SIZES: BrushSize[] = [
  { label: 'Thin', value: 4 },
  { label: 'Medium', value: 8 },
  { label: 'Thick', value: 16 },
]

export interface DrawingToolbarProps {
  color: string
  size: number
  onColorChange: (color: string) => void
  onSizeChange: (size: number) => void
  onUndo: () => void
  onClear: () => void
}

const SELECTED_RING = 'ring-2 ring-ink ring-offset-2 ring-offset-surface'
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

/**
 * Drawer toolbar: a solid-color palette (with an eraser), three brush sizes,
 * and Undo/Clear. Every control is a keyboard-focusable, labeled button; the
 * active color and size are marked with `aria-pressed` plus a ring so the
 * selection never relies on color alone.
 */
export function DrawingToolbar({
  color,
  size,
  onColorChange,
  onSizeChange,
  onUndo,
  onClear,
}: DrawingToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Color">
        {PALETTE.map((swatch) => {
          const selected = swatch.value === color
          return (
            <button
              key={swatch.value}
              type="button"
              aria-label={swatch.label}
              aria-pressed={selected}
              onClick={() => onColorChange(swatch.value)}
              className={`h-8 w-8 flex-none rounded-full border border-line ${FOCUS_RING} ${selected ? SELECTED_RING : ''}`}
              style={{ backgroundColor: swatch.value }}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Brush size">
        {BRUSH_SIZES.map((brush) => {
          const selected = brush.value === size
          return (
            <button
              key={brush.value}
              type="button"
              aria-label={brush.label}
              aria-pressed={selected}
              onClick={() => onSizeChange(brush.value)}
              className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl border ${FOCUS_RING} ${
                selected
                  ? `border-ink bg-ink text-paper ${SELECTED_RING}`
                  : 'border-line bg-surface text-ink'
              }`}
            >
              <span
                aria-hidden="true"
                className="rounded-full bg-current"
                style={{ width: brush.value, height: brush.value }}
              />
            </button>
          )
        })}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={onUndo}>
            Undo
          </Button>
          <Button variant="secondary" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  )
}
