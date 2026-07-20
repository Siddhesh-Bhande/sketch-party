import { describe, expect, it } from 'vitest'

import { parseServerMessage } from './protocol'

describe('parseServerMessage', () => {
  it('parses a valid error message and narrows the type discriminator', () => {
    const msg = parseServerMessage('{"type":"error","message":"x"}')
    expect(msg).not.toBeNull()
    expect(msg?.type).toBe('error')
    if (msg?.type === 'error') {
      expect(msg.message).toBe('x')
    }
  })

  it('parses a roomState message with camelCase fields', () => {
    const raw = JSON.stringify({
      type: 'roomState',
      code: 'WXYZ',
      phase: 'lobby',
      players: [{ id: 'p1', name: 'Ada', color: '#e63946', score: 0, connected: true }],
      round: 0,
      totalRounds: 3,
      currentDrawerId: null,
      youAreDrawer: false,
      wordLength: null,
      secondsLeft: null,
      yourPlayerId: 'p1',
    })
    const msg = parseServerMessage(raw)
    expect(msg).not.toBeNull()
    if (msg?.type === 'roomState') {
      expect(msg.code).toBe('WXYZ')
      expect(msg.players).toHaveLength(1)
      expect(msg.yourPlayerId).toBe('p1')
    } else {
      throw new Error('expected roomState message')
    }
  })

  it('returns null on malformed JSON', () => {
    expect(parseServerMessage('{not json')).toBeNull()
  })
})
