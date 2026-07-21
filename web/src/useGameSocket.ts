import { useCallback, useEffect, useRef } from 'react'

import { config } from './config'
import type { ClientMessage, Stroke } from './protocol'
import { parseServerMessage } from './protocol'
import { useGameStore } from './store'

const SESSION_KEY = 'sketch-party-session'
const WS_OPEN = 1

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
 * and its consumers can be tested with no real network. Full auto-reconnect is
 * added in Phase 6; here the connection is opened by createRoom/joinRoom and the
 * status transitions are wired into the store.
 */
export function useGameSocket(options: UseGameSocketOptions = {}) {
  const socketFactory = options.socketFactory ?? defaultFactory
  const socketRef = useRef<WebSocketLike | null>(null)
  const nameRef = useRef<string>('')

  const setStatus = useGameStore((state) => state.setStatus)
  const setError = useGameStore((state) => state.setError)
  const ingest = useGameStore((state) => state.ingest)

  const openSocket = useCallback(
    (code: string, name: string, playerId?: string) => {
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
      nameRef.current = name
      setStatus('connecting')
      setError(null)
      const socket = socketFactory(`${config.wsUrl}/ws/${code}`)
      socketRef.current = socket

      socket.onopen = () => {
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
          try {
            sessionStorage.setItem(
              SESSION_KEY,
              JSON.stringify({ code, playerId: message.yourPlayerId, name: nameRef.current }),
            )
          } catch {
            // Ignore storage failures (private mode, quota); reconnect is best effort.
          }
        }
      }
      socket.onclose = () => setStatus('closed')
      socket.onerror = () => setStatus('closed')
    },
    [socketFactory, setStatus, setError, ingest],
  )

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
    socketRef.current?.close()
    socketRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

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
