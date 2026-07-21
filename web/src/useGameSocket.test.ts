import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RoomStateMsg } from './protocol'
import { initialGameState, useGameStore } from './store'
import type { WebSocketLike } from './useGameSocket'
import { useGameSocket } from './useGameSocket'

class FakeSocket implements WebSocketLike {
  static last: FakeSocket | null = null
  url: string
  sent: string[] = []
  readyState = 0
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeSocket.last = this
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
    this.onclose?.(null)
  }
  open() {
    this.readyState = 1
    this.onopen?.(null)
  }
  receive(data: string) {
    this.onmessage?.({ data })
  }
}

const factory = (url: string) => new FakeSocket(url)

function currentSocket(): FakeSocket {
  const socket = FakeSocket.last
  if (!socket) throw new Error('no socket was created')
  return socket
}

function parseSent(socket: FakeSocket, index: number): Record<string, unknown> {
  const raw = socket.sent[index]
  if (raw === undefined) throw new Error(`no frame sent at index ${index}`)
  return JSON.parse(raw) as Record<string, unknown>
}

function roomState(): RoomStateMsg {
  return {
    type: 'roomState',
    code: 'WXYZ',
    phase: 'lobby',
    players: [{ id: 'p1', name: 'Alex', color: '#e63946', score: 0, connected: true }],
    round: 0,
    totalRounds: 3,
    currentDrawerId: null,
    youAreDrawer: false,
    wordLength: null,
    secondsLeft: null,
    yourPlayerId: 'p1',
  }
}

beforeEach(() => {
  useGameStore.setState({ ...initialGameState })
  FakeSocket.last = null
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useGameSocket', () => {
  it('createRoom posts then opens a socket and sends join on open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ code: 'WXYZ' }) })),
    )
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    await act(async () => {
      await result.current.createRoom('Alex')
    })
    const socket = currentSocket()
    expect(socket.url).toBe('ws://localhost:8000/ws/WXYZ')
    act(() => socket.open())
    expect(socket.sent).toHaveLength(1)
    expect(parseSent(socket, 0)).toEqual({ type: 'join', name: 'Alex' })
    expect(useGameStore.getState().status).toBe('open')
  })

  it('joinRoom opens a socket without a POST and uppercases the code', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('wxyz', 'Sam'))
    const socket = currentSocket()
    expect(socket.url).toBe('ws://localhost:8000/ws/WXYZ')
    act(() => socket.open())
    expect(parseSent(socket, 0)).toEqual({ type: 'join', name: 'Sam' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ingests an incoming roomState into the store and persists the session', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const socket = currentSocket()
    act(() => socket.open())
    act(() => socket.receive(JSON.stringify(roomState())))
    expect(useGameStore.getState().room?.code).toBe('WXYZ')
    expect(useGameStore.getState().me.playerId).toBe('p1')
    const stored = sessionStorage.getItem('sketch-party-session') ?? 'null'
    expect(JSON.parse(stored)).toMatchObject({ code: 'WXYZ', playerId: 'p1', name: 'Alex' })
  })

  it('send helpers emit JSON when open and are no-ops when not open', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const socket = currentSocket()
    act(() => result.current.guess('apple')) // socket not open yet
    expect(socket.sent).toHaveLength(0)
    act(() => socket.open()) // sends the join frame
    act(() => result.current.startGame())
    act(() => result.current.guess('apple'))
    expect(socket.sent.map((frame) => (JSON.parse(frame) as { type: string }).type)).toEqual([
      'join',
      'startGame',
      'guess',
    ])
  })

  it('onclose sets status to closed', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const socket = currentSocket()
    act(() => socket.open())
    expect(useGameStore.getState().status).toBe('open')
    act(() => socket.close())
    expect(useGameStore.getState().status).toBe('closed')
  })
})
