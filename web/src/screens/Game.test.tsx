import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerView } from '../protocol'
import type { RoomState } from '../store'
import { initialGameState, useGameStore } from '../store'
import { Game } from './Game'

function makePlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return { id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true, ...overrides }
}

function seedRoom(overrides: Partial<RoomState> = {}, wordChoices: string[] = []) {
  useGameStore.setState({
    ...initialGameState,
    me: { playerId: 'p1', name: 'Ada' },
    wordChoices,
    room: {
      code: 'WXYZ',
      phase: 'word_select',
      players: [makePlayer(), makePlayer({ id: 'p2', name: 'Grace' })],
      round: 1,
      totalRounds: 3,
      currentDrawerId: 'p1',
      youAreDrawer: false,
      wordLength: null,
      secondsLeft: null,
      ...overrides,
    },
  })
}

function renderGame(overrides: Partial<Parameters<typeof Game>[0]> = {}) {
  const props = {
    chooseWord: vi.fn(),
    sendStroke: vi.fn(),
    sendUndo: vi.fn(),
    sendClearCanvas: vi.fn(),
    ...overrides,
  }
  render(<Game {...props} />)
  return props
}

// jsdom does not implement ResizeObserver; DrawingCanvas only uses it to
// re-measure on layout changes, which does not matter for these tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  useGameStore.setState({ ...initialGameState })
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Game', () => {
  it('renders nothing when there is no room', () => {
    const { container } = render(
      <Game
        chooseWord={vi.fn()}
        sendStroke={vi.fn()}
        sendUndo={vi.fn()}
        sendClearCanvas={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  describe('word_select, drawer', () => {
    it('shows the word choices as buttons and calls chooseWord on click', async () => {
      const user = userEvent.setup()
      seedRoom({ phase: 'word_select', youAreDrawer: true }, ['cat', 'dog', 'boat'])
      const { chooseWord } = renderGame()

      expect(screen.getByRole('button', { name: 'cat' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'dog' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'boat' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'dog' }))
      expect(chooseWord).toHaveBeenCalledWith('dog')
    })
  })

  describe('word_select, guesser', () => {
    it('shows a waiting message naming the drawer', () => {
      seedRoom({ phase: 'word_select', youAreDrawer: false, currentDrawerId: 'p1' })
      renderGame()

      expect(screen.getByText('Waiting for Ada to pick a word.')).toBeInTheDocument()
    })
  })

  describe('drawing, drawer', () => {
    it('renders an editable canvas and the toolbar', () => {
      seedRoom({ phase: 'drawing', youAreDrawer: true, wordLength: 4 })
      renderGame()

      expect(screen.getByRole('img', { name: 'Drawing canvas' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    })
  })

  describe('drawing, guesser', () => {
    it('renders a read-only canvas, no toolbar, and the masked word', () => {
      seedRoom({
        phase: 'drawing',
        youAreDrawer: false,
        currentDrawerId: 'p1',
        wordLength: 5,
      })
      renderGame()

      expect(screen.getByRole('img', { name: 'Drawing canvas' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Color' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
      expect(screen.getByText('Ada is drawing')).toBeInTheDocument()
      expect(screen.getByLabelText('Word: 5 letters')).toBeInTheDocument()
    })
  })

  describe('turn_end', () => {
    it('shows a simple turn-over panel', () => {
      seedRoom({ phase: 'turn_end', youAreDrawer: false })
      renderGame()

      expect(screen.getByText('Turn over')).toBeInTheDocument()
    })
  })
})
