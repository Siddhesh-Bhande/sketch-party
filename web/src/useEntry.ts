import { useEffect, useRef, useState } from 'react'

const SESSION_KEY = 'sketch-party-session'

/** The room/player identity persisted to sessionStorage so a mid-game refresh can rejoin. */
export interface StoredSession {
  code: string
  name: string
  playerId?: string
}

export type EntryAction =
  | { kind: 'autoJoin'; code: string; name: string }
  | { kind: 'prefillHome'; code: string }
  | { kind: 'rejoin'; code: string; name: string; playerId?: string }
  | { kind: 'home' }

/**
 * Pure decision for what the app should do on first mount, given the URL's
 * query params and any stored session. An explicit `?room` in the URL always
 * wins over a stored session, so a fresh deep link takes priority over a
 * stale tab's rejoin.
 */
export function decideEntry(
  params: URLSearchParams,
  storedSession: StoredSession | null,
): EntryAction {
  const room = params.get('room')
  const name = params.get('name')

  if (room && name) {
    return { kind: 'autoJoin', code: room.toUpperCase(), name }
  }
  if (room) {
    return { kind: 'prefillHome', code: room.toUpperCase() }
  }
  if (storedSession) {
    return {
      kind: 'rejoin',
      code: storedSession.code,
      name: storedSession.name,
      playerId: storedSession.playerId,
    }
  }
  return { kind: 'home' }
}

/** Reads and validates the persisted session, tolerating missing or corrupt storage. */
export function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (typeof parsed.code !== 'string' || typeof parsed.name !== 'string') return null
    const playerId = typeof parsed.playerId === 'string' ? parsed.playerId : undefined
    return { code: parsed.code, name: parsed.name, playerId }
  } catch {
    return null
  }
}

export type JoinRoomFn = (code: string, name: string, playerId?: string) => void

/**
 * Runs the entry decision once on mount: auto-joins a deep-linked room (then
 * cleans the query string so a later refresh doesn't re-trigger it), rejoins
 * a stored session after a mid-game refresh, or leaves the room code for
 * Home to prefill. Returns the code Home should prefill, if any.
 */
export function useEntry(joinRoom: JoinRoomFn): string | undefined {
  const [initialCode, setInitialCode] = useState<string | undefined>(undefined)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const params = new URLSearchParams(window.location.search)
    const action = decideEntry(params, readStoredSession())

    switch (action.kind) {
      case 'autoJoin':
        joinRoom(action.code, action.name)
        window.history.replaceState(null, '', window.location.pathname)
        break
      case 'rejoin':
        joinRoom(action.code, action.name, action.playerId)
        break
      case 'prefillHome':
        setInitialCode(action.code)
        break
      case 'home':
        break
    }
  }, [joinRoom])

  return initialCode
}
