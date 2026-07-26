import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerView } from '../protocol'
import { initialGameState, useGameStore } from '../store'
import { Lobby } from './Lobby'

const DUMMY_DATA_URL = 'data:image/png;base64,dummy'

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async () => DUMMY_DATA_URL),
}))

function makePlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return { id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true, ...overrides }
}

function seedRoom(players: PlayerView[], myPlayerId: string | null = players[0]?.id ?? null) {
  useGameStore.setState({
    ...initialGameState,
    me: { playerId: myPlayerId, name: null },
    room: {
      code: 'WXYZ',
      phase: 'lobby',
      players,
      round: 0,
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

describe('Lobby', () => {
  it('renders the room code', () => {
    seedRoom([makePlayer()])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    expect(screen.getByText('WXYZ')).toBeInTheDocument()
  })

  it('enables Start game for the host with 2 or more players', () => {
    seedRoom([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', name: 'Grace' })])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled()
  })

  it('disables Start game for the host with only 1 player, and says why', () => {
    seedRoom([makePlayer({ id: 'p1' })])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    const startButton = screen.getByRole('button', { name: 'Start game' })
    expect(startButton).toBeDisabled()
    expect(screen.getByText(/need at least 2 players/i)).toBeInTheDocument()
  })

  it('shows a waiting note for non-hosts instead of a Start button', () => {
    seedRoom([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', name: 'Grace' })], 'p2')
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Start game' })).not.toBeInTheDocument()
    expect(screen.getByText('Waiting for the host to start')).toBeInTheDocument()
  })

  it('calls the injected startGame when the host clicks Start game', async () => {
    const user = userEvent.setup()
    const startGame = vi.fn()
    seedRoom([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', name: 'Grace' })])
    render(<Lobby startGame={startGame} leaveRoom={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(startGame).toHaveBeenCalled()
  })

  it('labels players[0] as the host in the player list', () => {
    seedRoom([makePlayer({ id: 'p1', name: 'Ada' }), makePlayer({ id: 'p2', name: 'Grace' })])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    expect(screen.getByText('Host')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('Grace')).toBeInTheDocument()
  })

  it('shows a live player count', () => {
    seedRoom([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', name: 'Grace' })])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    expect(screen.getByText('2 of 10 players')).toBeInTheDocument()
  })

  it('copies the room code and shows a confirmation', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    seedRoom([makePlayer()])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Copy' }))

    expect(writeText).toHaveBeenCalledWith('WXYZ')
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })

  it('opens a pre-joined second player tab with a room and guest name in the URL', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    openSpy.mockClear()
    seedRoom([makePlayer({ id: 'p1', name: 'Ada' })])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /open a second player/i }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const [url, target] = openSpy.mock.calls.at(-1)!
    expect(url).toContain('?room=WXYZ&name=')
    expect(target).toBe('_blank')
  })

  it('picks a guest name that does not collide with players already in the room', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    openSpy.mockClear()
    seedRoom([makePlayer({ id: 'p1', name: 'Ada' }), makePlayer({ id: 'p2', name: 'Player 2' })])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /open a second player/i }))

    const [url] = openSpy.mock.calls.at(-1)!
    expect(url).toContain(`name=${encodeURIComponent('Player 3')}`)
  })

  it('renders a QR code for the join link once generated', async () => {
    seedRoom([makePlayer()])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    const img = await screen.findByAltText('QR code to join room WXYZ')
    expect(img).toHaveAttribute('src', DUMMY_DATA_URL)
  })

  it('shows the plain join link with its own Copy button', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    seedRoom([makePlayer()])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    expect(screen.getByText(/\?room=WXYZ/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('?room=WXYZ'))
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })

  it('does not crash and shows a fallback message when QR generation fails', async () => {
    const qrcode = await import('qrcode')
    vi.mocked(qrcode.toDataURL).mockRejectedValueOnce(new Error('canvas unavailable'))
    seedRoom([makePlayer()])
    render(<Lobby startGame={vi.fn()} leaveRoom={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/qr code unavailable/i)).toBeInTheDocument()
    })
    expect(screen.queryByAltText(/QR code to join room/)).not.toBeInTheDocument()
  })
})
