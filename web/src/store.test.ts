import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyServerMessage,
  deriveScreen,
  initialGameState,
  useGameStore,
  type GameState,
} from './store'
import type { PlayerView, RoomStateMsg, Stroke } from './protocol'

function makePlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  return { id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true, ...overrides }
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    status: 'idle',
    me: { playerId: null, name: null },
    room: null,
    error: null,
    strokes: [],
    wordChoices: [],
    ...overrides,
  }
}

function makeStroke(overrides: Partial<Stroke> = {}): Stroke {
  return { id: 's1', color: '#1b1e28', size: 4, points: [{ x: 0, y: 0 }], ...overrides }
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

  it('strokeBroadcast appends a new stroke by id', () => {
    const state = makeState({ strokes: [] })
    const patch = applyServerMessage(state, { type: 'strokeBroadcast', stroke: makeStroke() })

    expect(patch.strokes).toEqual([makeStroke()])
  })

  it('strokeBroadcast upserts (replaces in place) an existing stroke by id', () => {
    const existing = makeStroke({ points: [{ x: 0, y: 0 }] })
    const other = makeStroke({ id: 's2', points: [{ x: 0.9, y: 0.9 }] })
    const state = makeState({ strokes: [existing, other] })
    const updated = makeStroke({
      points: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
      ],
    })
    const patch = applyServerMessage(state, { type: 'strokeBroadcast', stroke: updated })

    expect(patch.strokes).toEqual([updated, other])
  })

  it('canvasReplace replaces the whole strokes array', () => {
    const state = makeState({ strokes: [makeStroke({ id: 'old' })] })
    const next = [makeStroke({ id: 'a' }), makeStroke({ id: 'b' })]
    const patch = applyServerMessage(state, { type: 'canvasReplace', strokes: next })

    expect(patch.strokes).toEqual(next)
  })

  it('canvasCleared empties the strokes array', () => {
    const state = makeState({ strokes: [makeStroke()] })
    const patch = applyServerMessage(state, { type: 'canvasCleared' })

    expect(patch.strokes).toEqual([])
  })

  it('turnStarted clears strokes for the new turn', () => {
    const state = makeState({ strokes: [makeStroke()] })
    const patch = applyServerMessage(state, {
      type: 'turnStarted',
      drawerId: 'p1',
      drawerName: 'Ada',
      round: 1,
      wordLength: 5,
      turnSeconds: 60,
      word: null,
    })

    expect(patch.strokes).toEqual([])
  })

  it('wordChoices sets the offered words', () => {
    const state = makeState()
    const patch = applyServerMessage(state, {
      type: 'wordChoices',
      choices: ['cat', 'dog', 'boat'],
    })

    expect(patch.wordChoices).toEqual(['cat', 'dog', 'boat'])
  })

  it('turnStarted clears any leftover word choices for the new turn', () => {
    const state = makeState({ wordChoices: ['cat', 'dog', 'boat'] })
    const patch = applyServerMessage(state, {
      type: 'turnStarted',
      drawerId: 'p1',
      drawerName: 'Ada',
      round: 1,
      wordLength: 5,
      turnSeconds: 60,
      word: null,
    })

    expect(patch.wordChoices).toEqual([])
  })
})

describe('useGameStore.applyLocalStroke', () => {
  beforeEach(() => {
    useGameStore.setState({ ...initialGameState })
  })

  it('appends a new stroke optimistically', () => {
    useGameStore.getState().applyLocalStroke(makeStroke())

    expect(useGameStore.getState().strokes).toEqual([makeStroke()])
  })

  it('upserts an existing stroke by id rather than duplicating it', () => {
    useGameStore.setState({ strokes: [makeStroke({ points: [{ x: 0, y: 0 }] })] })
    const updated = makeStroke({
      points: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
      ],
    })

    useGameStore.getState().applyLocalStroke(updated)

    expect(useGameStore.getState().strokes).toEqual([updated])
  })
})

describe('useGameStore.reset', () => {
  it('clears strokes back to an empty array', () => {
    useGameStore.setState({ strokes: [makeStroke()] })

    useGameStore.getState().reset()

    expect(useGameStore.getState().strokes).toEqual([])
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
