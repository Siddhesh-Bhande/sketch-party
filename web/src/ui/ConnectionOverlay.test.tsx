import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConnectionOverlay } from './ConnectionOverlay'

describe('ConnectionOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when idle', () => {
    render(<ConnectionOverlay status="idle" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders nothing when open', () => {
    render(<ConnectionOverlay status="open" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(<ConnectionOverlay status="closed" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows "Connecting..." immediately when connecting', () => {
    render(<ConnectionOverlay status="connecting" />)
    expect(screen.getByRole('status')).toHaveTextContent('Connecting...')
  })

  it('switches to the waking-the-demo copy after ~3 seconds of connecting', () => {
    render(<ConnectionOverlay status="connecting" />)
    expect(screen.getByRole('status')).toHaveTextContent('Connecting...')

    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Connecting...')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('status')).toHaveTextContent(/waking the demo/i)
  })

  it('shows "Reconnecting..." immediately, without waiting for the waking delay', () => {
    render(<ConnectionOverlay status="reconnecting" />)
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting...')

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting...')
  })

  it('is an aria-live="polite" status region', () => {
    render(<ConnectionOverlay status="connecting" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('resets the waking timer when status changes away from and back to connecting', () => {
    const { rerender } = render(<ConnectionOverlay status="connecting" />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByRole('status')).toHaveTextContent(/waking the demo/i)

    rerender(<ConnectionOverlay status="open" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    rerender(<ConnectionOverlay status="connecting" />)
    expect(screen.getByRole('status')).toHaveTextContent('Connecting...')
  })
})
