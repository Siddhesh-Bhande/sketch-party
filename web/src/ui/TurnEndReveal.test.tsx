import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PlayerView } from '../protocol'
import { TurnEndReveal } from './TurnEndReveal'

function makePlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return { id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true, ...overrides }
}

describe('TurnEndReveal', () => {
  it('shows the revealed word', () => {
    render(<TurnEndReveal reveal={{ word: 'banana', scores: [] }} players={[makePlayer()]} />)

    expect(screen.getByText('banana')).toBeInTheDocument()
  })

  it('shows each player and the points they gained this turn', () => {
    const players = [makePlayer({ id: 'p1', name: 'Ada' }), makePlayer({ id: 'p2', name: 'Grace' })]
    render(
      <TurnEndReveal
        reveal={{
          word: 'banana',
          scores: [
            { playerId: 'p1', score: 150, gained: 150 },
            { playerId: 'p2', score: 10, gained: 0 },
          ],
        }}
        players={players}
      />,
    )

    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('+150')).toBeInTheDocument()
    expect(screen.getByText('Grace')).toBeInTheDocument()
  })

  it('shows a gain of 0 plainly, without a plus sign', () => {
    render(
      <TurnEndReveal
        reveal={{ word: 'banana', scores: [{ playerId: 'p1', score: 10, gained: 0 }] }}
        players={[makePlayer({ id: 'p1', name: 'Ada' })]}
      />,
    )

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('+0')).not.toBeInTheDocument()
  })
})
