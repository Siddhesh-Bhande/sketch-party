import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DrawingToolbar } from './DrawingToolbar'

function renderToolbar(overrides: Partial<Parameters<typeof DrawingToolbar>[0]> = {}) {
  const props = {
    color: '#e63946',
    size: 4,
    onColorChange: vi.fn(),
    onSizeChange: vi.fn(),
    onUndo: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  }
  render(<DrawingToolbar {...props} />)
  return props
}

describe('DrawingToolbar', () => {
  it('marks the active color as pressed and other colors as not pressed', () => {
    renderToolbar({ color: '#e63946' })

    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onColorChange with the swatch value when a color is clicked', async () => {
    const user = userEvent.setup()
    const { onColorChange } = renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Blue' }))

    expect(onColorChange).toHaveBeenCalledWith('#457b9d')
  })

  it('includes an eraser swatch that paints the canvas background color', async () => {
    const user = userEvent.setup()
    const { onColorChange } = renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Eraser' }))

    expect(onColorChange).toHaveBeenCalledWith('#ffffff')
  })

  it('marks the active brush size as pressed and others as not pressed', () => {
    renderToolbar({ size: 8 })

    expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Thin' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSizeChange with the brush value when a size is clicked', async () => {
    const user = userEvent.setup()
    const { onSizeChange } = renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Thick' }))

    expect(onSizeChange).toHaveBeenCalledWith(16)
  })

  it('fires onUndo when Undo is clicked', async () => {
    const user = userEvent.setup()
    const { onUndo } = renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('fires onClear when Clear is clicked', async () => {
    const user = userEvent.setup()
    const { onClear } = renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
