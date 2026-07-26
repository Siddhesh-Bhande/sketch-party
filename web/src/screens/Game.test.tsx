import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerView } from '../protocol'
import type { GameState, RoomState } from '../store'
import { initialGameState, useGameStore } from '../store'
import { Game } from './Game'

function makePlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return { id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true, ...overrides }
}

function seedRoom(roomOverrides: Partial<RoomState> = {}, stateOverrides: Partial<GameState> = {}) {
  useGameStore.setState({
    ...initialGameState,
    me: { playerId: 'p1', name: 'Ada' },
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
      ...roomOverrides,
    },
    ...stateOverrides,
  })
}

function renderGame(overrides: Partial<Parameters<typeof Game>[0]> = {}) {
  const props = {
    chooseWord: vi.fn(),
    guess: vi.fn(),
    sendStroke: vi.fn(),
    sendUndo: vi.fn(),
    sendClearCanvas: vi.fn(),
    leaveRoom: vi.fn(),
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
        guess={vi.fn()}
        sendStroke={vi.fn()}
        sendUndo={vi.fn()}
        sendClearCanvas={vi.fn()}
        leaveRoom={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  describe('word_select, drawer', () => {
    it('shows the word choices as buttons and calls chooseWord on click', async () => {
      const user = userEvent.setup()
      seedRoom(
        { phase: 'word_select', youAreDrawer: true },
        { wordChoices: ['cat', 'dog', 'boat'] },
      )
      const { chooseWord } = renderGame()

      expect(screen.getByText('Choose a word to draw')).toBeInTheDocument()
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
    it('renders an editable canvas, the toolbar, the timer, and the secret word', () => {
      seedRoom(
        { phase: 'drawing', youAreDrawer: true, wordLength: 4, secondsLeft: 45 },
        { myWord: 'cake', turnSeconds: 60 },
      )
      renderGame()

      expect(screen.getByRole('img', { name: 'Drawing canvas' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
      expect(screen.getByRole('timer')).toBeInTheDocument()
      expect(screen.getByText('You are drawing: cake')).toBeInTheDocument()
      // The drawer does not guess, so there is no guess box.
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('drawing, guesser', () => {
    it('renders a read-only canvas, no toolbar, the masked word, and a guess box', () => {
      seedRoom(
        {
          phase: 'drawing',
          youAreDrawer: false,
          currentDrawerId: 'p1',
          wordLength: 5,
          secondsLeft: 20,
        },
        { turnSeconds: 60 },
      )
      renderGame()

      expect(screen.getByRole('img', { name: 'Drawing canvas' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Color' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
      expect(screen.getByLabelText('Word: 5 letters')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.queryByText(/You are drawing/)).not.toBeInTheDocument()
    })

    it('marks the drawer and the local player in the scoreboard', () => {
      seedRoom({
        phase: 'drawing',
        youAreDrawer: false,
        currentDrawerId: 'p2',
        wordLength: 5,
      })
      renderGame()

      const drawerRow = screen.getByText('Grace').closest('li') as HTMLElement
      expect(within(drawerRow).getByText('drawing')).toBeInTheDocument()
      const meRow = screen.getByText('Ada').closest('li') as HTMLElement
      expect(within(meRow).getByText('you')).toBeInTheDocument()
    })

    it('submits a guess through the injected guess callback', async () => {
      const user = userEvent.setup()
      seedRoom({ phase: 'drawing', youAreDrawer: false, currentDrawerId: 'p2', wordLength: 5 })
      const { guess } = renderGame()

      await user.type(screen.getByRole('textbox'), 'kite{Enter}')
      expect(guess).toHaveBeenCalledWith('kite')
    })

    it('shows guess feedback from the store', () => {
      seedRoom(
        { phase: 'drawing', youAreDrawer: false, currentDrawerId: 'p2', wordLength: 5 },
        { lastGuessResult: { result: 'near', points: 0 } },
      )
      renderGame()

      expect(screen.getByText('So close!')).toBeInTheDocument()
    })
  })

  describe('turn_end', () => {
    it("reveals the word and each player's point gain, plus the updated scoreboard", () => {
      seedRoom(
        {
          phase: 'turn_end',
          players: [
            makePlayer({ id: 'p1', name: 'Ada', score: 50 }),
            makePlayer({ id: 'p2', name: 'Grace', score: 110 }),
          ],
        },
        {
          turnReveal: {
            word: 'kite',
            scores: [
              { playerId: 'p1', score: 50, gained: 50 },
              { playerId: 'p2', score: 110, gained: 100 },
            ],
          },
        },
      )
      renderGame()

      expect(screen.getByText('kite')).toBeInTheDocument()
      expect(screen.getByText('+50')).toBeInTheDocument()
      expect(screen.getByText('+100')).toBeInTheDocument()

      // The scoreboard (a distinct, labeled list from the reveal panel's list)
      // reflects the updated scores, sorted with the new leader first.
      const scoreboard = screen.getByRole('list', { name: 'Scoreboard' })
      const rows = within(scoreboard).getAllByRole('listitem')
      expect(rows[0]).toHaveTextContent('Grace')
      expect(rows[1]).toHaveTextContent('Ada')
    })
  })

  it('shows the scoreboard during turn_end even before the reveal arrives', () => {
    // A reconnect in the interstitial delivers a roomState that nulls turnReveal;
    // the turn_end screen must still show content, not go blank.
    seedRoom({ phase: 'turn_end' }, { turnReveal: null })
    renderGame()
    const scoreboard = screen.getByRole('list', { name: 'Scoreboard' })
    expect(within(scoreboard).getAllByRole('listitem')).toHaveLength(2)
  })
})
