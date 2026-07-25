import { useCallback, useEffect, useRef } from 'react'

import { config } from './config'
import type { ClientMessage, Stroke } from './protocol'
import { parseServerMessage } from './protocol'
import { useGameStore } from './store'

const SESSION_KEY = 'sketch-party-session'
const WS_OPEN = 1

/** Backoff delays (ms) for reconnect attempts: 500ms, 1s, 2s, 4s, 8s, then capped at 8s. */
const RECONNECT_BASE_DELAY_MS = 500
const RECONNECT_MAX_DELAY_MS = 8000
/** Give up after this many reconnect attempts and surface a friendly error. */
const MAX_RECONNECT_ATTEMPTS = 6
const RECONNECT_GAVE_UP_MESSAGE = 'Could not reconnect. Please refresh the page and rejoin.'

/** The room/player identity needed to re-attach on reconnect. */
interface Session {
  code: string
  name: string
  playerId?: string
}

/** The slice of the WebSocket API this hook relies on, so tests can fake it. */
export interface WebSocketLike {
  send(data: string): void
  close(): void
  readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
}

export type SocketFactory = (url: string) => WebSocketLike

export interface UseGameSocketOptions {
  socketFactory?: SocketFactory
}

const defaultFactory: SocketFactory = (url) => new WebSocket(url) as unknown as WebSocketLike

/**
 * Owns a single game WebSocket. The socket factory is injectable so this hook
 * and its consumers can be tested with no real network. The connection is
 * opened by createRoom/joinRoom and the status transitions are wired into the
 * store. If the socket closes unexpectedly (not via a deliberate `disconnect()`),
 * it auto-reconnects with exponential backoff, re-sending `join` with the
 * stored playerId so the backend re-attaches the same player.
 */
export function useGameSocket(options: UseGameSocketOptions = {}) {
  const socketFactory = options.socketFactory ?? defaultFactory
  const socketRef = useRef<WebSocketLike | null>(null)

  // Reconnect bookkeeping. These live in refs (not state) so the retry loop
  // survives re-renders and isn't part of React's render cycle.
  const sessionRef = useRef<Session | null>(null)
  const deliberateCloseRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Indirection so `openSocket` can call the latest `scheduleReconnect` even
  // though the two are mutually recursive (openSocket schedules a reconnect on
  // close; a reconnect calls back into openSocket).
  const scheduleReconnectRef = useRef<() => void>(() => {})

  const setStatus = useGameStore((state) => state.setStatus)
  const setError = useGameStore((state) => state.setError)
  const ingest = useGameStore((state) => state.ingest)

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const openSocket = useCallback(
    (code: string, name: string, playerId?: string, isReconnectAttempt = false) => {
      clearReconnectTimer()
      // Close any prior socket first, detaching its handlers so a late close/error
      // event from the old connection cannot clobber the new one's status.
      const previous = socketRef.current
      if (previous) {
        previous.onopen = null
        previous.onmessage = null
        previous.onclose = null
        previous.onerror = null
        previous.close()
      }
      deliberateCloseRef.current = false
      if (!isReconnectAttempt) {
        reconnectAttemptsRef.current = 0
      }
      sessionRef.current = { code, name, playerId }
      setStatus(isReconnectAttempt ? 'reconnecting' : 'connecting')
      setError(null)
      const socket = socketFactory(`${config.wsUrl}/ws/${code}`)
      socketRef.current = socket

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0
        setStatus('open')
        const join: ClientMessage = playerId
          ? { type: 'join', name, playerId }
          : { type: 'join', name }
        socket.send(JSON.stringify(join))
      }
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return
        const message = parseServerMessage(event.data)
        if (!message) return
        ingest(message)
        if (message.type === 'roomState') {
          const session = sessionRef.current
          if (session) sessionRef.current = { ...session, playerId: message.yourPlayerId }
          try {
            sessionStorage.setItem(
              SESSION_KEY,
              JSON.stringify({ code, playerId: message.yourPlayerId, name }),
            )
          } catch {
            // Ignore storage failures (private mode, quota); reconnect is best effort.
          }
        }
      }
      socket.onclose = () => {
        if (deliberateCloseRef.current) {
          setStatus('closed')
          return
        }
        scheduleReconnectRef.current()
      }
      socket.onerror = () => {
        // A WebSocket error is always followed by a close event; the actual
        // status transition and reconnect scheduling happen in onclose.
      }
    },
    [socketFactory, setStatus, setError, ingest, clearReconnectTimer],
  )

  const scheduleReconnect = useCallback(() => {
    const session = sessionRef.current
    if (!session) {
      setStatus('closed')
      return
    }
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setStatus('closed')
      setError(RECONNECT_GAVE_UP_MESSAGE)
      return
    }
    const attempt = reconnectAttemptsRef.current
    reconnectAttemptsRef.current += 1
    setStatus('reconnecting')
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      openSocket(session.code, session.name, session.playerId, true)
    }, delay)
  }, [openSocket, setStatus, setError])

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect
  }, [scheduleReconnect])

  const createRoom = useCallback(
    async (name: string, settings?: { rounds?: number; turnSeconds?: number }) => {
      setStatus('connecting')
      setError(null)
      try {
        const response = await fetch(`${config.apiUrl}/rooms`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(settings ?? {}),
        })
        if (!response.ok) {
          setStatus('closed')
          setError('Could not create a room. Please try again.')
          return
        }
        const data = (await response.json()) as { code: string }
        openSocket(data.code, name)
      } catch {
        setStatus('closed')
        setError('Could not reach the server. Please try again.')
      }
    },
    [openSocket, setStatus, setError],
  )

  const joinRoom = useCallback(
    (code: string, name: string, playerId?: string) => {
      openSocket(code.toUpperCase(), name, playerId)
    },
    [openSocket],
  )

  const sendMessage = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (socket && socket.readyState === WS_OPEN) {
      socket.send(JSON.stringify(message))
    }
  }, [])

  const startGame = useCallback(() => sendMessage({ type: 'startGame' }), [sendMessage])
  const chooseWord = useCallback(
    (word: string) => sendMessage({ type: 'chooseWord', word }),
    [sendMessage],
  )
  const guess = useCallback((text: string) => sendMessage({ type: 'guess', text }), [sendMessage])
  const playAgain = useCallback(() => sendMessage({ type: 'playAgain' }), [sendMessage])
  const sendStroke = useCallback(
    (stroke: Stroke) => sendMessage({ type: 'stroke', stroke }),
    [sendMessage],
  )
  const sendUndo = useCallback(() => sendMessage({ type: 'undo' }), [sendMessage])
  const sendClearCanvas = useCallback(() => sendMessage({ type: 'clearCanvas' }), [sendMessage])

  const disconnect = useCallback(() => {
    deliberateCloseRef.current = true
    clearReconnectTimer()
    reconnectAttemptsRef.current = 0
    sessionRef.current = null
    const socket = socketRef.current
    socketRef.current = null
    socket?.close()
  }, [clearReconnectTimer])

  useEffect(() => {
    return () => {
      deliberateCloseRef.current = true
      clearReconnectTimer()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [clearReconnectTimer])

  return {
    createRoom,
    joinRoom,
    startGame,
    chooseWord,
    guess,
    playAgain,
    sendStroke,
    sendUndo,
    sendClearCanvas,
    sendMessage,
    disconnect,
  }
}
