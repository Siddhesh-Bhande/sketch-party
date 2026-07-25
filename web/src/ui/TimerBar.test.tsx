import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TimerBar } from './TimerBar'

describe('TimerBar', () => {
  it('formats the readout as m:ss', () => {
    render(<TimerBar secondsLeft={75} turnSeconds={90} />)

    expect(screen.getByText('1:15')).toBeInTheDocument()
  })

  it('pads single-digit seconds with a leading zero', () => {
    render(<TimerBar secondsLeft={5} turnSeconds={60} />)

    expect(screen.getByText('0:05')).toBeInTheDocument()
  })

  it('shows 0:00 once the timer reaches zero', () => {
    render(<TimerBar secondsLeft={0} turnSeconds={60} />)

    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('exposes role="timer" with the remaining seconds as text, not just color', () => {
    render(<TimerBar secondsLeft={13} turnSeconds={60} />)

    expect(screen.getByRole('timer', { name: '13 seconds left' })).toBeInTheDocument()
  })

  it('uses singular wording for exactly one second left', () => {
    render(<TimerBar secondsLeft={1} turnSeconds={60} />)

    expect(screen.getByRole('timer', { name: '1 second left' })).toBeInTheDocument()
  })

  it('fills the bar proportionally to secondsLeft / turnSeconds', () => {
    render(<TimerBar secondsLeft={30} turnSeconds={60} />)

    const timer = screen.getByRole('timer')
    const fill = timer.firstElementChild as HTMLElement
    expect(fill.style.width).toBe('50%')
  })

  it('clamps a secondsLeft above turnSeconds to a full bar', () => {
    render(<TimerBar secondsLeft={999} turnSeconds={60} />)

    const timer = screen.getByRole('timer')
    const fill = timer.firstElementChild as HTMLElement
    expect(fill.style.width).toBe('100%')
  })
})
