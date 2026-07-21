import { create } from 'zustand'

import type { GamePhase, PlayerView, ServerMessage, Stroke } from './protocol'

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed'

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

export interface GameState {
  status: ConnectionStatus
  me: Me
  room: RoomState | null
  error: string | null
  strokes: Stroke[]
}

export type Screen = 'home' | 'lobby' | 'game' | 'gameover'

export const initialGameState: GameState = {
  status: 'idle',
  me: { playerId: null, name: null },
  room: null,
  error: null,
  strokes: [],
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

    case 'turnStarted':
      return { strokes: [] }

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
