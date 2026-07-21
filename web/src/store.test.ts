import { describe, expect, it } from 'vitest'

import { applyServerMessage, deriveScreen, type GameState } from './store'
import type { PlayerView, RoomStateMsg } from './protocol'

function makePlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return { id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true, ...overrides }
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    status: 'idle',
    me: { playerId: null, name: null },
    room: null,
    error: null,
    ...overrides,
  }
}

function makeRoomStateMsg(overrides: Partial<RoomStateMsg> = {}): RoomStateMsg {
  return {
    type: 'roomState',
    code: 'WXYZ',
    phase: 'lobby',
    players: [makePlayer()],
    round: 0,
    totalRounds: 3,
    currentDrawerId: null,
    youAreDrawer: false,
    wordLength: null,
    secondsLeft: null,
    yourPlayerId: 'p1',
    ...overrides,
  }
}

describe('applyServerMessage', () => {
  it('roomState replaces room and sets me.playerId from yourPlayerId', () => {
    const state = makeState()
    const patch = applyServerMessage(state, makeRoomStateMsg())

    expect(patch.room?.code).toBe('WXYZ')
    expect(patch.room?.phase).toBe('lobby')
    expect(patch.room?.players).toEqual([makePlayer()])
    expect(patch.me?.playerId).toBe('p1')
  })

  it('roomState preserves an already-known local name', () => {
    const state = makeState({ me: { playerId: null, name: 'Ada' } })
    const patch = applyServerMessage(state, makeRoomStateMsg())

    expect(patch.me).toEqual({ playerId: 'p1', name: 'Ada' })
  })

  it('playerJoined appends to room.players', () => {
    const state = makeState({
      room: {
        code: 'WXYZ',
        phase: 'lobby',
        players: [makePlayer()],
        round: 0,
        totalRounds: 3,
        currentDrawerId: null,
        youAreDrawer: false,
        wordLength: null,
        secondsLeft: null,
      },
    })
    const patch = applyServerMessage(state, {
      type: 'playerJoined',
      player: makePlayer({ id: 'p2', name: 'Grace' }),
    })

    expect(patch.room?.players).toHaveLength(2)
    expect(patch.room?.players?.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('playerJoined does not duplicate a player already present (no-op patch)', () => {
    const state = makeState({
      room: {
        code: 'WXYZ',
        phase: 'lobby',
        players: [makePlayer()],
        round: 0,
        totalRounds: 3,
        currentDrawerId: null,
        youAreDrawer: false,
        wordLength: null,
        secondsLeft: null,
      },
    })
    const patch = applyServerMessage(state, {
      type: 'playerJoined',
      player: makePlayer({ id: 'p1', name: 'Ada' }),
    })

    expect(patch).toEqual({})
  })

  it('playerLeft marks the player disconnected but keeps them in the list', () => {
    const state = makeState({
      room: {
        code: 'WXYZ',
        phase: 'lobby',
        players: [makePlayer(), makePlayer({ id: 'p2', name: 'Grace' })],
        round: 0,
        totalRounds: 3,
        currentDrawerId: null,
        youAreDrawer: false,
        wordLength: null,
        secondsLeft: null,
      },
    })
    const patch = applyServerMessage(state, { type: 'playerLeft', playerId: 'p2' })

    expect(patch.room?.players).toHaveLength(2)
    const left = patch.room?.players?.find((p) => p.id === 'p2')
    expect(left?.connected).toBe(false)
  })

  it('error sets state.error', () => {
    const state = makeState()
    const patch = applyServerMessage(state, { type: 'error', message: 'room not found' })

    expect(patch.error).toBe('room not found')
  })

  it('messages not relevant yet return an empty patch (state unchanged)', () => {
    const state = makeState()
    const patch = applyServerMessage(state, { type: 'timerTick', secondsLeft: 30 })

    expect(patch).toEqual({})
  })
})

describe('deriveScreen', () => {
  it('returns home when there is no room', () => {
    expect(deriveScreen(makeState())).toBe('home')
  })

  it('returns lobby when phase is lobby', () => {
    const state = makeState({
      room: {
        code: 'WXYZ',
        phase: 'lobby',
        players: [],
        round: 0,
        totalRounds: 3,
        currentDrawerId: null,
        youAreDrawer: false,
        wordLength: null,
        secondsLeft: null,
      },
    })
    expect(deriveScreen(state)).toBe('lobby')
  })

  it.each(['word_select', 'drawing', 'turn_end'] as const)(
    'returns game when phase is %s',
    (phase) => {
      const state = makeState({
        room: {
          code: 'WXYZ',
          phase,
          players: [],
          round: 1,
          totalRounds: 3,
          currentDrawerId: 'p1',
          youAreDrawer: true,
          wordLength: 5,
          secondsLeft: 30,
        },
      })
      expect(deriveScreen(state)).toBe('game')
    },
  )

  it('returns gameover when phase is game_over', () => {
    const state = makeState({
      room: {
        code: 'WXYZ',
        phase: 'game_over',
        players: [],
        round: 3,
        totalRounds: 3,
        currentDrawerId: null,
        youAreDrawer: false,
        wordLength: null,
        secondsLeft: null,
      },
    })
    expect(deriveScreen(state)).toBe('gameover')
  })
})
