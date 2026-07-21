import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from './App'
import { initialGameState, useGameStore } from './store'

beforeEach(() => {
  useGameStore.setState({ ...initialGameState })
})

describe('App', () => {
  it('renders the Home screen when there is no room', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Sketch Party' })).toBeInTheDocument()
  })

  it('renders the Lobby screen once the room is in the lobby phase', () => {
    useGameStore.setState({
      room: {
        code: 'WXYZ',
        phase: 'lobby',
        players: [{ id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true }],
        round: 0,
        totalRounds: 3,
        currentDrawerId: null,
        youAreDrawer: false,
        wordLength: null,
        secondsLeft: null,
      },
    })
    render(<App />)
    expect(screen.getByText('WXYZ')).toBeInTheDocument()
  })
})
