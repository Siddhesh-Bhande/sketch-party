import { beforeEach, describe, expect, it } from 'vitest'

import {
  appendEvent,
  applyServerMessage,
  deriveScreen,
  initialGameState,
  useGameStore,
  type GameEvent,
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
    events: [],
    lastGuessResult: null,
    turnReveal: null,
    finalScores: null,
    myWord: null,
    turnSeconds: 0,
    interstitialSeconds: 0,
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
    turnSeconds: 240,
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

  it('timerTick with no room returns an empty patch (state unchanged)', () => {
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

function makeRoom(
  overrides: Partial<NonNullable<GameState['room']>> = {},
): NonNullable<GameState['room']> {
  return {
    code: 'WXYZ',
    phase: 'word_select',
    players: [makePlayer(), makePlayer({ id: 'p2', name: 'Grace', score: 10 })],
    round: 1,
    totalRounds: 3,
    currentDrawerId: 'p1',
    youAreDrawer: false,
    wordLength: null,
    secondsLeft: null,
    ...overrides,
  }
}

describe('appendEvent', () => {
  it('appends an event with a generated id', () => {
    const events = appendEvent([], 'hello')

    expect(events).toHaveLength(1)
    expect(events[0]?.text).toBe('hello')
    expect(typeof events[0]?.id).toBe('string')
    expect(events[0]?.id.length).toBeGreaterThan(0)
  })

  it('keeps existing events and appends the new one last', () => {
    const existing: GameEvent[] = [{ id: 'a', text: 'first' }]
    const events = appendEvent(existing, 'second')

    expect(events.map((e) => e.text)).toEqual(['first', 'second'])
  })

  it('caps the feed at 50 events, dropping the oldest', () => {
    let events: GameEvent[] = []
    for (let i = 0; i < 55; i++) {
      events = appendEvent(events, `event-${i}`)
    }

    expect(events).toHaveLength(50)
    expect(events[0]?.text).toBe('event-5')
    expect(events[49]?.text).toBe('event-54')
  })

  it('does not mutate the input array', () => {
    const existing: GameEvent[] = [{ id: 'a', text: 'first' }]
    appendEvent(existing, 'second')

    expect(existing).toHaveLength(1)
  })
})

describe('applyServerMessage: game-loop messages', () => {
  it('turnStarted transitions the room to drawing and sets drawer flags for the drawer', () => {
    const state = makeState({
      me: { playerId: 'p1', name: 'Ada' },
      room: makeRoom({ phase: 'word_select', currentDrawerId: null, youAreDrawer: false }),
    })
    const patch = applyServerMessage(state, {
      type: 'turnStarted',
      drawerId: 'p1',
      drawerName: 'Ada',
      round: 1,
      wordLength: 5,
      turnSeconds: 60,
      word: 'apple',
    })

    expect(patch.room?.phase).toBe('drawing')
    expect(patch.room?.currentDrawerId).toBe('p1')
    expect(patch.room?.youAreDrawer).toBe(true)
    expect(patch.room?.wordLength).toBe(5)
    expect(patch.room?.secondsLeft).toBe(60)
    expect(patch.myWord).toBe('apple')
    expect(patch.turnSeconds).toBe(60)
  })

  it('turnStarted sets store.turnSeconds to the full turn duration, independent of secondsLeft', () => {
    const state = makeState({
      me: { playerId: 'p1', name: 'Ada' },
      room: makeRoom({ phase: 'word_select', currentDrawerId: null, youAreDrawer: false }),
      turnSeconds: 0,
    })
    const patch = applyServerMessage(state, {
      type: 'turnStarted',
      drawerId: 'p1',
      drawerName: 'Ada',
      round: 1,
      wordLength: 5,
      turnSeconds: 90,
      word: 'apple',
    })

    expect(patch.turnSeconds).toBe(90)
  })

  it('turnStarted sets youAreDrawer false and myWord null for a guesser', () => {
    const state = makeState({
      me: { playerId: 'p2', name: 'Grace' },
      room: makeRoom({ phase: 'word_select', currentDrawerId: null, youAreDrawer: false }),
    })
    const patch = applyServerMessage(state, {
      type: 'turnStarted',
      drawerId: 'p1',
      drawerName: 'Ada',
      round: 1,
      wordLength: 5,
      turnSeconds: 60,
      word: null,
    })

    expect(patch.room?.youAreDrawer).toBe(false)
    expect(patch.myWord).toBeNull()
  })

  it('turnStarted clears turnReveal and lastGuessResult from the previous turn', () => {
    const state = makeState({
      me: { playerId: 'p2', name: 'Grace' },
      room: makeRoom(),
      turnReveal: { word: 'boat', scores: [] },
      lastGuessResult: { result: 'correct', points: 100 },
    })
    const patch = applyServerMessage(state, {
      type: 'turnStarted',
      drawerId: 'p1',
      drawerName: 'Ada',
      round: 1,
      wordLength: 5,
      turnSeconds: 60,
      word: null,
    })

    expect(patch.turnReveal).toBeNull()
    expect(patch.lastGuessResult).toBeNull()
  })

  it('turnStarted appends an "is drawing" event', () => {
    const state = makeState({ me: { playerId: 'p2', name: 'Grace' }, room: makeRoom() })
    const patch = applyServerMessage(state, {
      type: 'turnStarted',
      drawerId: 'p1',
      drawerName: 'Ada',
      round: 1,
      wordLength: 5,
      turnSeconds: 60,
      word: null,
    })

    expect(patch.events).toHaveLength(1)
    expect(patch.events?.[0]?.text).toBe('Ada is drawing')
  })

  it('turnStarted does not set room when state.room is null', () => {
    const state = makeState({ me: { playerId: 'p1', name: 'Ada' }, room: null })
    const patch = applyServerMessage(state, {
      type: 'turnStarted',
      drawerId: 'p1',
      drawerName: 'Ada',
      round: 1,
      wordLength: 5,
      turnSeconds: 60,
      word: 'apple',
    })

    expect(patch.room).toBeUndefined()
    expect(patch.myWord).toBe('apple')
  })

  it('timerTick updates room.secondsLeft and leaves the rest of room unchanged', () => {
    const room = makeRoom({ phase: 'drawing', secondsLeft: 45 })
    const state = makeState({ room })
    const patch = applyServerMessage(state, { type: 'timerTick', secondsLeft: 30 })

    expect(patch.room).toEqual({ ...room, secondsLeft: 30 })
  })

  it('guessResult sets lastGuessResult and does not append an event', () => {
    const state = makeState({ room: makeRoom() })
    const patch = applyServerMessage(state, {
      type: 'guessResult',
      result: 'correct',
      points: 100,
    })

    expect(patch.lastGuessResult).toEqual({ result: 'correct', points: 100 })
    expect(patch.events).toBeUndefined()
  })

  it('playerGuessedCorrectly appends an event', () => {
    const state = makeState({ room: makeRoom() })
    const patch = applyServerMessage(state, {
      type: 'playerGuessedCorrectly',
      playerId: 'p2',
      name: 'Grace',
    })

    expect(patch.events).toHaveLength(1)
    expect(patch.events?.[0]?.text).toBe('Grace guessed the word!')
  })

  it('turnEnded transitions to turn_end, updates matching player scores, and sets turnReveal', () => {
    const state = makeState({
      room: makeRoom({
        phase: 'drawing',
        players: [
          makePlayer({ id: 'p1', score: 0 }),
          makePlayer({ id: 'p2', name: 'Grace', score: 10 }),
        ],
      }),
    })
    const scores = [
      { playerId: 'p1', score: 50, gained: 50 },
      { playerId: 'p2', score: 110, gained: 100 },
    ]
    const patch = applyServerMessage(state, {
      type: 'turnEnded',
      word: 'apple',
      scores,
      interstitialSeconds: 5,
    })

    expect(patch.room?.phase).toBe('turn_end')
    expect(patch.room?.players?.find((p) => p.id === 'p1')?.score).toBe(50)
    expect(patch.room?.players?.find((p) => p.id === 'p2')?.score).toBe(110)
    expect(patch.turnReveal).toEqual({ word: 'apple', scores })
    expect(patch.interstitialSeconds).toBe(5)
    expect(patch.events?.[0]?.text).toBe('The word was apple')
  })

  it('turnEnded leaves scores of players not present in msg.scores unchanged', () => {
    const state = makeState({
      room: makeRoom({
        players: [makePlayer({ id: 'p1', score: 0 }), makePlayer({ id: 'p3', score: 25 })],
      }),
    })
    const patch = applyServerMessage(state, {
      type: 'turnEnded',
      word: 'apple',
      scores: [{ playerId: 'p1', score: 50, gained: 50 }],
      interstitialSeconds: 5,
    })

    expect(patch.room?.players?.find((p) => p.id === 'p3')?.score).toBe(25)
  })

  it('turnEnded does not set room when state.room is null', () => {
    const state = makeState({ room: null })
    const patch = applyServerMessage(state, {
      type: 'turnEnded',
      word: 'apple',
      scores: [],
      interstitialSeconds: 5,
    })

    expect(patch.room).toBeUndefined()
    expect(patch.turnReveal).toEqual({ word: 'apple', scores: [] })
  })

  it('gameOver transitions to game_over and sets finalScores', () => {
    const state = makeState({ room: makeRoom({ phase: 'turn_end' }) })
    const scores = [
      { playerId: 'p1', name: 'Ada', score: 150 },
      { playerId: 'p2', name: 'Grace', score: 200 },
    ]
    const patch = applyServerMessage(state, { type: 'gameOver', scores })

    expect(patch.room?.phase).toBe('game_over')
    expect(patch.finalScores).toEqual(scores)
    expect(patch.events?.[0]?.text).toBe('Game over')
  })

  it('gameOver does not set room when state.room is null', () => {
    const state = makeState({ room: null })
    const patch = applyServerMessage(state, { type: 'gameOver', scores: [] })

    expect(patch.room).toBeUndefined()
    expect(patch.finalScores).toEqual([])
  })

  it('roomState clears turnReveal, lastGuessResult, and myWord but leaves events alone', () => {
    const state = makeState({
      events: [{ id: 'a', text: 'existing' }],
      turnReveal: { word: 'boat', scores: [] },
      lastGuessResult: { result: 'correct', points: 100 },
      myWord: 'boat',
    })
    const patch = applyServerMessage(state, makeRoomStateMsg({ phase: 'word_select' }))

    expect(patch.turnReveal).toBeNull()
    expect(patch.lastGuessResult).toBeNull()
    expect(patch.myWord).toBeNull()
    expect(patch.events).toBeUndefined()
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

  it('clears the game-loop fields back to their initial values', () => {
    useGameStore.setState({
      events: [{ id: 'a', text: 'hello' }],
      lastGuessResult: { result: 'correct', points: 100 },
      turnReveal: { word: 'boat', scores: [] },
      finalScores: [{ playerId: 'p1', name: 'Ada', score: 100 }],
      myWord: 'boat',
      turnSeconds: 90,
    })

    useGameStore.getState().reset()

    expect(useGameStore.getState().events).toEqual([])
    expect(useGameStore.getState().lastGuessResult).toBeNull()
    expect(useGameStore.getState().turnReveal).toBeNull()
    expect(useGameStore.getState().finalScores).toBeNull()
    expect(useGameStore.getState().myWord).toBeNull()
    expect(useGameStore.getState().turnSeconds).toBe(0)
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
