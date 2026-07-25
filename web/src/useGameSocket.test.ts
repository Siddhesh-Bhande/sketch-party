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
  close(code?: number) {
    this.readyState = 3
    this.onclose?.(code === undefined ? null : { code })
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
    turnSeconds: 240,
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

  it('sendStroke, sendUndo, and sendClearCanvas emit their frames and no-op when not open', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const socket = currentSocket()
    const stroke = { id: 's1', color: '#1b1e28', size: 4, points: [{ x: 0.1, y: 0.2 }] }
    act(() => result.current.sendStroke(stroke)) // socket not open yet
    act(() => result.current.sendUndo())
    act(() => result.current.sendClearCanvas())
    expect(socket.sent).toHaveLength(0)

    act(() => socket.open()) // sends the join frame
    act(() => result.current.sendStroke(stroke))
    act(() => result.current.sendUndo())
    act(() => result.current.sendClearCanvas())

    expect(socket.sent.map((frame) => JSON.parse(frame) as Record<string, unknown>)).toEqual([
      { type: 'join', name: 'Alex' },
      { type: 'stroke', stroke },
      { type: 'undo' },
      { type: 'clearCanvas' },
    ])
  })

  it('reopening closes the prior socket and detaches it so its events do not clobber status', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('AAAA', 'Alex'))
    const first = currentSocket()
    act(() => first.open())
    act(() => result.current.joinRoom('BBBB', 'Alex'))
    const second = currentSocket()
    expect(second).not.toBe(first)
    expect(first.readyState).toBe(3) // old socket was closed
    act(() => second.open())
    act(() => first.close()) // a stray late event on the old socket
    expect(useGameStore.getState().status).toBe('open')
    expect(second.url).toBe('ws://localhost:8000/ws/BBBB')
  })

  it('an unexpected onclose starts reconnecting rather than going straight to closed', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const socket = currentSocket()
    act(() => socket.open())
    expect(useGameStore.getState().status).toBe('open')
    act(() => socket.close())
    expect(useGameStore.getState().status).toBe('reconnecting')
  })
})

describe('useGameSocket auto-reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules a reconnect after an unexpected close and re-sends join with the stored playerId', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const first = currentSocket()
    act(() => first.open())
    act(() => first.receive(JSON.stringify(roomState())))

    act(() => first.close()) // unexpected close, e.g. the server dropped the connection
    expect(useGameStore.getState().status).toBe('reconnecting')

    act(() => {
      vi.advanceTimersByTime(500)
    })
    const second = currentSocket()
    expect(second).not.toBe(first)
    expect(second.url).toBe('ws://localhost:8000/ws/WXYZ')

    act(() => second.open())
    expect(parseSent(second, 0)).toEqual({ type: 'join', name: 'Alex', playerId: 'p1' })
    expect(useGameStore.getState().status).toBe('open')
  })

  it('retries the very first failed connection attempt (waking a cold-started demo)', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const first = currentSocket()

    act(() => first.close()) // the socket never opened at all
    expect(useGameStore.getState().status).toBe('reconnecting')

    act(() => {
      vi.advanceTimersByTime(500)
    })
    const second = currentSocket()
    expect(second).not.toBe(first)
    expect(second.url).toBe('ws://localhost:8000/ws/WXYZ')
    act(() => second.open())
    expect(parseSent(second, 0)).toEqual({ type: 'join', name: 'Alex' })
    expect(useGameStore.getState().status).toBe('open')
  })

  it('a deliberate disconnect does not schedule a reconnect', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const socket = currentSocket()
    act(() => socket.open())

    act(() => result.current.disconnect())
    expect(useGameStore.getState().status).toBe('closed')

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(FakeSocket.last).toBe(socket) // no new socket was ever created
  })

  it('resets the attempt counter after a successful reopen', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const first = currentSocket()
    act(() => first.open())
    act(() => first.receive(JSON.stringify(roomState())))

    act(() => first.close())
    act(() => {
      vi.advanceTimersByTime(500)
    })
    const second = currentSocket()
    act(() => second.open())
    act(() => second.receive(JSON.stringify(roomState()))) // confirmed join resets backoff
    expect(useGameStore.getState().status).toBe('open')

    // A second unexpected close should restart the backoff from 500ms, not
    // continue from the previous attempt count.
    act(() => second.close())
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(FakeSocket.last).toBe(second) // not yet reconnected
    act(() => {
      vi.advanceTimersByTime(1)
    })
    const third = currentSocket()
    expect(third).not.toBe(second)
  })

  it('gives up after the max number of attempts and sets status to closed with a friendly error', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    let socket = currentSocket()
    act(() => socket.open())
    act(() => socket.receive(JSON.stringify(roomState())))

    act(() => socket.close())
    const delays = [500, 1000, 2000, 4000, 8000, 8000]
    for (const delay of delays) {
      expect(useGameStore.getState().status).toBe('reconnecting')
      act(() => {
        vi.advanceTimersByTime(delay)
      })
      socket = currentSocket()
      act(() => socket.close()) // this reconnect attempt fails too
    }

    expect(useGameStore.getState().status).toBe('closed')
    expect(useGameStore.getState().error).toBeTruthy()

    // No further reconnect is scheduled once attempts are exhausted.
    const socketCountBefore = FakeSocket.last
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(FakeSocket.last).toBe(socketCountBefore)
  })

  it('does not reconnect when the server rejects the connection (4400-4409)', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const socket = currentSocket()
    act(() => socket.open()) // handshake accepted...
    act(() => socket.close(4409)) // ...but the join was rejected (e.g. room full)
    expect(useGameStore.getState().status).toBe('closed')
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(FakeSocket.last).toBe(socket) // no reconnect was attempted
  })

  it('bounds retries when each handshake opens but the join is never confirmed', () => {
    const { result } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    let socket = currentSocket()
    // No roomState is ever delivered: the transport opens but the join never
    // confirms. The counter must NOT reset on open, or this loops forever.
    act(() => socket.open())
    act(() => socket.close(1006)) // transient close -> retry
    const delays = [500, 1000, 2000, 4000, 8000, 8000]
    for (const delay of delays) {
      expect(useGameStore.getState().status).toBe('reconnecting')
      act(() => {
        vi.advanceTimersByTime(delay)
      })
      socket = currentSocket()
      act(() => socket.open()) // used to reset the backoff (the bug)
      act(() => socket.close(1006))
    }
    expect(useGameStore.getState().status).toBe('closed')
  })

  it('clears the pending reconnect timer on unmount', () => {
    const { result, unmount } = renderHook(() => useGameSocket({ socketFactory: factory }))
    act(() => result.current.joinRoom('WXYZ', 'Alex'))
    const socket = currentSocket()
    act(() => socket.open())
    act(() => socket.close()) // schedules a reconnect

    unmount()
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(FakeSocket.last).toBe(socket) // no reconnect happened after unmount
  })
})
