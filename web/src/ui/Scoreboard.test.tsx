import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PlayerView } from '../protocol'
import { Scoreboard } from './Scoreboard'

function makePlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return { id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true, ...overrides }
}

describe('Scoreboard', () => {
  it('sorts players by score descending', () => {
    const players = [
      makePlayer({ id: 'p1', name: 'Ada', score: 10 }),
      makePlayer({ id: 'p2', name: 'Grace', score: 50 }),
      makePlayer({ id: 'p3', name: 'Lin', score: 30 }),
    ]
    render(<Scoreboard players={players} currentDrawerId={null} meId={null} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByText(/Ada|Grace|Lin/).textContent)).toEqual([
      'Grace',
      'Lin',
      'Ada',
    ])
  })

  it('marks the current drawer with a "drawing" badge', () => {
    const players = [makePlayer({ id: 'p1', name: 'Ada' }), makePlayer({ id: 'p2', name: 'Grace' })]
    render(<Scoreboard players={players} currentDrawerId="p2" meId={null} />)

    const row = screen.getByText('Grace').closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('drawing')).toBeInTheDocument()
    expect(
      within(screen.getByText('Ada').closest('li') as HTMLElement).queryByText('drawing'),
    ).not.toBeInTheDocument()
  })

  it('marks the current player with a "you" badge', () => {
    const players = [makePlayer({ id: 'p1', name: 'Ada' }), makePlayer({ id: 'p2', name: 'Grace' })]
    render(<Scoreboard players={players} currentDrawerId={null} meId="p1" />)

    const row = screen.getByText('Ada').closest('li')
    expect(within(row as HTMLElement).getByText('you')).toBeInTheDocument()
  })

  it('shows disconnected players as muted, struck through, and tagged "away"', () => {
    const players = [makePlayer({ id: 'p1', name: 'Ada', connected: false })]
    render(<Scoreboard players={players} currentDrawerId={null} meId={null} />)

    expect(screen.getByText('Ada')).toHaveClass('line-through')
    expect(screen.getByText('away')).toBeInTheDocument()
  })

  it('shows each player score in a monospace font', () => {
    const players = [makePlayer({ id: 'p1', name: 'Ada', score: 42 })]
    render(<Scoreboard players={players} currentDrawerId={null} meId={null} />)

    expect(screen.getByText('42')).toHaveClass('font-mono')
  })
})
