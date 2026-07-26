import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InterstitialCountdown } from './InterstitialCountdown'

afterEach(() => {
  vi.useRealTimers()
})

describe('InterstitialCountdown', () => {
  it('renders nothing when there is no interstitial', () => {
    const { container } = render(<InterstitialCountdown seconds={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the initial countdown label', () => {
    render(<InterstitialCountdown seconds={5} />)
    expect(screen.getByText('Next turn in 5s')).toBeInTheDocument()
  })

  it('counts down as time passes', () => {
    vi.useFakeTimers()
    render(<InterstitialCountdown seconds={5} />)
    expect(screen.getByText('Next turn in 5s')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('Next turn in 3s')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('Starting next turn...')).toBeInTheDocument()
  })
})
