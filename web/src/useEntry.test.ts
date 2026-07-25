import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { decideEntry, readStoredSession, useEntry } from './useEntry'

const SESSION_KEY = 'sketch-party-session'

function setUrl(search: string) {
  window.history.pushState({}, '', `/${search}`)
}

beforeEach(() => {
  sessionStorage.clear()
  setUrl('')
})

afterEach(() => {
  sessionStorage.clear()
  setUrl('')
})

describe('decideEntry', () => {
  it('auto-joins when both room and name are present in the URL', () => {
    const params = new URLSearchParams('room=wxyz&name=Alex')
    expect(decideEntry(params, null)).toEqual({ kind: 'autoJoin', code: 'WXYZ', name: 'Alex' })
  })

  it('prefills Home when only room is present in the URL', () => {
    const params = new URLSearchParams('room=wxyz')
    expect(decideEntry(params, null)).toEqual({ kind: 'prefillHome', code: 'WXYZ' })
  })

  it('rejoins with the stored session when there are no URL params', () => {
    const params = new URLSearchParams('')
    const session = { code: 'WXYZ', name: 'Alex', playerId: 'p1' }
    expect(decideEntry(params, session)).toEqual({
      kind: 'rejoin',
      code: 'WXYZ',
      name: 'Alex',
      playerId: 'p1',
    })
  })

  it('falls back to home when there is no URL param and no stored session', () => {
    const params = new URLSearchParams('')
    expect(decideEntry(params, null)).toEqual({ kind: 'home' })
  })

  it('lets an explicit ?room in the URL win over a stored session', () => {
    const params = new URLSearchParams('room=wxyz&name=Alex')
    const session = { code: 'AAAA', name: 'Sam', playerId: 'p9' }
    expect(decideEntry(params, session)).toEqual({ kind: 'autoJoin', code: 'WXYZ', name: 'Alex' })
  })

  it('lets a room-only URL win over a stored session too', () => {
    const params = new URLSearchParams('room=wxyz')
    const session = { code: 'AAAA', name: 'Sam', playerId: 'p9' }
    expect(decideEntry(params, session)).toEqual({ kind: 'prefillHome', code: 'WXYZ' })
  })
})

describe('readStoredSession', () => {
  it('returns null when nothing is stored', () => {
    expect(readStoredSession()).toBeNull()
  })

  it('returns the parsed session when valid JSON is stored', () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ code: 'WXYZ', name: 'Alex', playerId: 'p1' }),
    )
    expect(readStoredSession()).toEqual({ code: 'WXYZ', name: 'Alex', playerId: 'p1' })
  })

  it('returns null when the stored value is malformed JSON', () => {
    sessionStorage.setItem(SESSION_KEY, '{not json')
    expect(readStoredSession()).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: 'WXYZ' }))
    expect(readStoredSession()).toBeNull()
  })
})

describe('useEntry', () => {
  it('auto-joins and strips the query string when both room and name are in the URL', () => {
    setUrl('?room=wxyz&name=Alex')
    const joinRoom = vi.fn()
    const { result } = renderHook(() => useEntry(joinRoom))

    expect(joinRoom).toHaveBeenCalledWith('WXYZ', 'Alex')
    expect(result.current).toBeUndefined()
    expect(window.location.search).toBe('')
  })

  it('returns the code to prefill and does not join when only room is in the URL', () => {
    setUrl('?room=wxyz')
    const joinRoom = vi.fn()
    const { result } = renderHook(() => useEntry(joinRoom))

    expect(joinRoom).not.toHaveBeenCalled()
    expect(result.current).toBe('WXYZ')
  })

  it('rejoins with the stored playerId on a mid-game refresh', () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ code: 'WXYZ', name: 'Alex', playerId: 'p1' }),
    )
    const joinRoom = vi.fn()
    renderHook(() => useEntry(joinRoom))

    expect(joinRoom).toHaveBeenCalledWith('WXYZ', 'Alex', 'p1')
  })

  it('does nothing when there is no URL param and no stored session', () => {
    const joinRoom = vi.fn()
    const { result } = renderHook(() => useEntry(joinRoom))

    expect(joinRoom).not.toHaveBeenCalled()
    expect(result.current).toBeUndefined()
  })

  it('only runs the entry decision once even if the hook re-renders', () => {
    setUrl('?room=wxyz&name=Alex')
    const joinRoom = vi.fn()
    const { rerender } = renderHook(() => useEntry(joinRoom))
    act(() => rerender())
    act(() => rerender())

    expect(joinRoom).toHaveBeenCalledTimes(1)
  })
})
