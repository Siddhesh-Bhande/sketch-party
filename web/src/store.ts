import { create } from 'zustand'

import type { GamePhase, PlayerView, ServerMessage } from './protocol'

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
}

export type Screen = 'home' | 'lobby' | 'game' | 'gameover'

export const initialGameState: GameState = {
  status: 'idle',
  me: { playerId: null, name: null },
  room: null,
  error: null,
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
  reset: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialGameState,
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setMe: (me) => set((state) => ({ me: { ...state.me, ...me } })),
  ingest: (msg) => set((state) => applyServerMessage(state, msg)),
  reset: () => set({ ...initialGameState }),
}))
