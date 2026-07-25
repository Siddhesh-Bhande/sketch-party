// Typed wire protocol between client and server. Mirrors
// `api/src/sketch_party/protocol.py` field-for-field: Python stays
// snake_case, the JSON on the wire (and these TS types) are camelCase.

export type GamePhase = 'lobby' | 'word_select' | 'drawing' | 'turn_end' | 'game_over'

export type GuessResult = 'correct' | 'near' | 'wrong' | 'ignored'

export interface PlayerView {
  id: string
  name: string
  color: string
  score: number
  connected: boolean
}

// --- Shared drawing models ---------------------------------------------------

export interface Point {
  x: number
  y: number
}

export interface Stroke {
  id: string
  color: string
  size: number
  points: Point[]
}

// --- Client messages (outgoing) ---------------------------------------------

export interface JoinMsg {
  type: 'join'
  name: string
  playerId?: string
}

export interface StartGameMsg {
  type: 'startGame'
}

export interface ChooseWordMsg {
  type: 'chooseWord'
  word: string
}

export interface GuessMsg {
  type: 'guess'
  text: string
}

export interface PlayAgainMsg {
  type: 'playAgain'
}

export interface StrokeMsg {
  type: 'stroke'
  stroke: Stroke
}

export interface UndoMsg {
  type: 'undo'
}

export interface ClearCanvasMsg {
  type: 'clearCanvas'
}

export type ClientMessage =
  | JoinMsg
  | StartGameMsg
  | ChooseWordMsg
  | GuessMsg
  | PlayAgainMsg
  | StrokeMsg
  | UndoMsg
  | ClearCanvasMsg

// --- Server messages (incoming) ---------------------------------------------

export interface RoomStateMsg {
  type: 'roomState'
  code: string
  phase: GamePhase
  players: PlayerView[]
  round: number
  totalRounds: number
  currentDrawerId: string | null
  youAreDrawer: boolean
  wordLength: number | null
  secondsLeft: number | null
  turnSeconds: number
  yourPlayerId: string
}

export interface PlayerJoinedMsg {
  type: 'playerJoined'
  player: PlayerView
}

export interface PlayerLeftMsg {
  type: 'playerLeft'
  playerId: string
}

export interface WordChoicesMsg {
  type: 'wordChoices'
  choices: string[]
}

export interface TurnStartedMsg {
  type: 'turnStarted'
  drawerId: string
  drawerName: string
  round: number
  wordLength: number
  turnSeconds: number
  word: string | null
}

export interface GuessResultMsg {
  type: 'guessResult'
  result: GuessResult
  points: number
}

export interface PlayerGuessedMsg {
  type: 'playerGuessedCorrectly'
  playerId: string
  name: string
}

export interface TimerTickMsg {
  type: 'timerTick'
  secondsLeft: number
}

export interface TurnScore {
  playerId: string
  score: number
  gained: number
}

export interface TurnEndedMsg {
  type: 'turnEnded'
  word: string
  scores: TurnScore[]
}

export interface FinalScore {
  playerId: string
  name: string
  score: number
}

export interface GameOverMsg {
  type: 'gameOver'
  scores: FinalScore[]
}

export interface ErrorMsg {
  type: 'error'
  message: string
}

export interface StrokeBroadcastMsg {
  type: 'strokeBroadcast'
  stroke: Stroke
}

export interface CanvasReplaceMsg {
  type: 'canvasReplace'
  strokes: Stroke[]
}

export interface CanvasClearedMsg {
  type: 'canvasCleared'
}

export type ServerMessage =
  | RoomStateMsg
  | PlayerJoinedMsg
  | PlayerLeftMsg
  | WordChoicesMsg
  | TurnStartedMsg
  | GuessResultMsg
  | PlayerGuessedMsg
  | TimerTickMsg
  | TurnEndedMsg
  | GameOverMsg
  | ErrorMsg
  | StrokeBroadcastMsg
  | CanvasReplaceMsg
  | CanvasClearedMsg

/**
 * Parse a raw WebSocket text frame into a typed ServerMessage.
 * Returns null if the payload is not valid JSON.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    return JSON.parse(raw) as ServerMessage
  } catch {
    return null
  }
}
