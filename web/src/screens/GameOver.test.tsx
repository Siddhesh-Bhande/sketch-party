import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FinalScore, PlayerView } from '../protocol'
import { initialGameState, useGameStore } from '../store'
import { GameOver } from './GameOver'

function makePlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return { id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true, ...overrides }
}

function seed(options: {
  finalScores: FinalScore[]
  players: PlayerView[]
  myPlayerId: string | null
}) {
  useGameStore.setState({
    ...initialGameState,
    finalScores: options.finalScores,
    me: { playerId: options.myPlayerId, name: null },
    room: {
      code: 'WXYZ',
      phase: 'game_over',
      players: options.players,
      round: 3,
      totalRounds: 3,
      currentDrawerId: null,
      youAreDrawer: false,
      wordLength: null,
      secondsLeft: null,
    },
  })
}

beforeEach(() => {
  useGameStore.setState({ ...initialGameState })
})

describe('GameOver', () => {
  it('shows a "Game over" heading', () => {
    seed({
      finalScores: [{ playerId: 'p1', name: 'Ada', score: 100 }],
      players: [makePlayer({ id: 'p1' })],
      myPlayerId: 'p1',
    })
    render(<GameOver playAgain={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Game over' })).toBeInTheDocument()
  })

  it('shows the final standings sorted by score descending', () => {
    seed({
      finalScores: [
        { playerId: 'p1', name: 'Ada', score: 100 },
        { playerId: 'p2', name: 'Grace', score: 300 },
        { playerId: 'p3', name: 'Lin', score: 200 },
      ],
      players: [makePlayer({ id: 'p1' })],
      myPlayerId: 'p1',
    })
    render(<GameOver playAgain={vi.fn()} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Grace'),
      expect.stringContaining('Lin'),
      expect.stringContaining('Ada'),
    ])
  })

  it('highlights the winner', () => {
    seed({
      finalScores: [
        { playerId: 'p1', name: 'Ada', score: 100 },
        { playerId: 'p2', name: 'Grace', score: 300 },
      ],
      players: [makePlayer({ id: 'p1' })],
      myPlayerId: 'p1',
    })
    render(<GameOver playAgain={vi.fn()} />)

    const winnerRow = screen.getByText('Grace').closest('li') as HTMLElement
    expect(within(winnerRow).getByText('Winner')).toBeInTheDocument()
    const loserRow = screen.getByText('Ada').closest('li') as HTMLElement
    expect(within(loserRow).queryByText('Winner')).not.toBeInTheDocument()
  })

  it('marks all tied top scorers as winners', () => {
    seed({
      finalScores: [
        { playerId: 'p1', name: 'Ada', score: 300 },
        { playerId: 'p2', name: 'Grace', score: 300 },
        { playerId: 'p3', name: 'Lin', score: 100 },
      ],
      players: [makePlayer({ id: 'p1' })],
      myPlayerId: 'p1',
    })
    render(<GameOver playAgain={vi.fn()} />)

    expect(
      within(screen.getByText('Ada').closest('li') as HTMLElement).getByText('Winner'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByText('Grace').closest('li') as HTMLElement).getByText('Winner'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByText('Lin').closest('li') as HTMLElement).queryByText('Winner'),
    ).not.toBeInTheDocument()
  })

  it('shows a host-only Play again button that calls playAgain when clicked', async () => {
    const user = userEvent.setup()
    const playAgain = vi.fn()
    seed({
      finalScores: [{ playerId: 'p1', name: 'Ada', score: 100 }],
      players: [makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', name: 'Grace' })],
      myPlayerId: 'p1',
    })
    render(<GameOver playAgain={playAgain} />)

    const button = screen.getByRole('button', { name: 'Play again' })
    await user.click(button)
    expect(playAgain).toHaveBeenCalled()
  })

  it('shows a waiting message instead of the button for non-hosts', () => {
    seed({
      finalScores: [{ playerId: 'p1', name: 'Ada', score: 100 }],
      players: [makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', name: 'Grace' })],
      myPlayerId: 'p2',
    })
    render(<GameOver playAgain={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument()
    expect(screen.getByText('Waiting for the host to start a new game.')).toBeInTheDocument()
  })

  it('falls back to always showing Play again when room is gone', () => {
    useGameStore.setState({
      ...initialGameState,
      finalScores: [{ playerId: 'p1', name: 'Ada', score: 100 }],
      me: { playerId: null, name: null },
      room: null,
    })
    render(<GameOver playAgain={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
  })
})
