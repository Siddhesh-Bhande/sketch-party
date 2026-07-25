import { create } from 'zustand'

import type {
  FinalScore,
  GamePhase,
  PlayerView,
  ServerMessage,
  Stroke,
  TurnScore,
} from './protocol'

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'reconnecting'

export interface Me {
  playerId: string | null
  name: string | null
}

export interface RoomState {
  code: string
  phase: GamePhase
  players: PlayerView[]
  round: number
  totalRounds: number
  currentDrawerId: string | null
  youAreDrawer: boolean
  wordLength: number | null
  secondsLeft: number | null
}

/** A single entry in the capped activity feed (drawing started, guesses, reveals, ...). */
export interface GameEvent {
  id: string
  text: string
}

export interface GameState {
  status: ConnectionStatus
  me: Me
  room: RoomState | null
  error: string | null
  strokes: Stroke[]
  /** Words offered to the drawer by the latest `wordChoices` message. */
  wordChoices: string[]
  /** Capped activity feed (drawing started, guesses, reveals, ...), newest last. */
  events: GameEvent[]
  /** Private feedback for the current player's own most recent guess. */
  lastGuessResult: { result: string; points: number } | null
  /** Word reveal and per-player score deltas from the turn that just ended. */
  turnReveal: { word: string; scores: TurnScore[] } | null
  /** Final leaderboard once the game ends. */
  finalScores: FinalScore[] | null
  /** The word the current drawer is drawing; null for everyone else. */
  myWord: string | null
  /** Full duration (seconds) of the current turn, for rendering the timer bar's fill ratio. */
  turnSeconds: number
}

export type Screen = 'home' | 'lobby' | 'game' | 'gameover'

export const initialGameState: GameState = {
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
}

/** Maximum number of entries kept in the activity feed. */
const MAX_EVENTS = 50

/**
 * Appends a new event with a generated id to `events`, capping the result to
 * the last `MAX_EVENTS` entries (newest last). Never mutates `events`.
 */
export function appendEvent(events: GameEvent[], text: string): GameEvent[] {
  const next = [...events, { id: crypto.randomUUID(), text }]
  return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next
}

/**
 * Upserts `stroke` into `strokes` by id: replaces the matching stroke in
 * place if present, otherwise appends it. Never mutates `strokes`.
 */
function upsertStroke(strokes: Stroke[], stroke: Stroke): Stroke[] {
  const index = strokes.findIndex((s) => s.id === stroke.id)
  if (index === -1) return [...strokes, stroke]
  const next = strokes.slice()
  next[index] = stroke
  return next
}

/**
 * Pure reducer: given the current state and an incoming server message,
 * returns a partial state patch to shallow-merge in. Total (never throws)
 * and immutable (never mutates `state`). Messages this reducer does not
 * yet care about return `{}` so the merge is a no-op.
 */
export function applyServerMessage(state: GameState, msg: ServerMessage): Partial<GameState> {
  switch (msg.type) {
    case 'roomState':
      return {
        room: {
          code: msg.code,
          phase: msg.phase,
          players: msg.players,
          round: msg.round,
          totalRounds: msg.totalRounds,
          currentDrawerId: msg.currentDrawerId,
          youAreDrawer: msg.youAreDrawer,
          wordLength: msg.wordLength,
          secondsLeft: msg.secondsLeft,
        },
        me: { ...state.me, playerId: msg.yourPlayerId },
        turnSeconds: msg.turnSeconds,
        // A fresh roomState means a new word-select/lobby: stale reveal
        // state from the previous turn must not leak forward.
        turnReveal: null,
        lastGuessResult: null,
        myWord: null,
      }

    case 'playerJoined': {
      if (!state.room) return {}
      if (state.room.players.some((p) => p.id === msg.player.id)) return {}
      return {
        room: { ...state.room, players: [...state.room.players, msg.player] },
      }
    }

    case 'playerLeft': {
      if (!state.room) return {}
      return {
        room: {
          ...state.room,
          players: state.room.players.map((p) =>
            p.id === msg.playerId ? { ...p, connected: false } : p,
          ),
        },
      }
    }

    case 'error':
      return { error: msg.message }

    case 'strokeBroadcast':
      return { strokes: upsertStroke(state.strokes, msg.stroke) }

    case 'canvasReplace':
      return { strokes: msg.strokes }

    case 'canvasCleared':
      return { strokes: [] }

    case 'wordChoices':
      return { wordChoices: msg.choices }

    case 'turnStarted': {
      const patch: Partial<GameState> = {
        strokes: [],
        wordChoices: [],
        turnReveal: null,
        lastGuessResult: null,
        myWord: msg.word ?? null,
        turnSeconds: msg.turnSeconds,
        events: appendEvent(state.events, `${msg.drawerName} is drawing`),
      }
      if (state.room) {
        patch.room = {
          ...state.room,
          phase: 'drawing',
          currentDrawerId: msg.drawerId,
          youAreDrawer: state.me.playerId === msg.drawerId,
          wordLength: msg.wordLength,
          secondsLeft: msg.turnSeconds,
        }
      }
      return patch
    }

    case 'timerTick': {
      if (!state.room) return {}
      return { room: { ...state.room, secondsLeft: msg.secondsLeft } }
    }

    case 'guessResult':
      return { lastGuessResult: { result: msg.result, points: msg.points } }

    case 'playerGuessedCorrectly':
      return { events: appendEvent(state.events, `${msg.name} guessed the word!`) }

    case 'turnEnded': {
      const scoreById = new Map(msg.scores.map((s) => [s.playerId, s.score]))
      const patch: Partial<GameState> = {
        turnReveal: { word: msg.word, scores: msg.scores },
        events: appendEvent(state.events, `The word was ${msg.word}`),
      }
      if (state.room) {
        patch.room = {
          ...state.room,
          phase: 'turn_end',
          players: state.room.players.map((p) => {
            const score = scoreById.get(p.id)
            return score === undefined ? p : { ...p, score }
          }),
        }
      }
      return patch
    }

    case 'gameOver': {
      const patch: Partial<GameState> = {
        finalScores: msg.scores,
        events: appendEvent(state.events, 'Game over'),
      }
      if (state.room) {
        patch.room = { ...state.room, phase: 'game_over' }
      }
      return patch
    }

    default:
      return {}
  }
}

/** Derive which screen to render from the current game state. */
export function deriveScreen(state: GameState): Screen {
  if (!state.room) return 'home'
  switch (state.room.phase) {
    case 'lobby':
      return 'lobby'
    case 'word_select':
    case 'drawing':
    case 'turn_end':
      return 'game'
    case 'game_over':
    default:
      return 'gameover'
  }
}

export interface GameStore extends GameState {
  setStatus: (status: ConnectionStatus) => void
  setError: (error: string | null) => void
  setMe: (me: Partial<Me>) => void
  ingest: (msg: ServerMessage) => void
  /** Optimistic local upsert for the drawer, applied before the network round-trip. */
  applyLocalStroke: (stroke: Stroke) => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialGameState,
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setMe: (me) => set((state) => ({ me: { ...state.me, ...me } })),
  ingest: (msg) => set((state) => applyServerMessage(state, msg)),
  applyLocalStroke: (stroke) => set((state) => ({ strokes: upsertStroke(state.strokes, stroke) })),
  reset: () => set({ ...initialGameState }),
}))
