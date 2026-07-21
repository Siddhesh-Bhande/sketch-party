import { useState } from 'react'

import { useGameStore } from '../store'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { PlayerChip } from '../ui/PlayerChip'

const MAX_PLAYERS = 10
const MIN_PLAYERS_TO_START = 2

export interface LobbyProps {
  startGame: () => void
}

/** Waiting room: room code, player roster, and a host-only start control. */
export function Lobby({ startGame }: LobbyProps) {
  const room = useGameStore((state) => state.room)
  const myPlayerId = useGameStore((state) => state.me.playerId)
  const [copied, setCopied] = useState(false)

  if (!room) return null

  const players = room.players
  const hostId = players[0]?.id ?? null
  const isHost = myPlayerId !== null && myPlayerId === hostId
  const canStart = players.length >= MIN_PLAYERS_TO_START

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied (permissions, insecure context); ignore silently.
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Panel className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                Room code
              </p>
              <p className="font-mono text-3xl font-semibold tracking-[0.2em] text-ink">
                {room.code}
              </p>
            </div>
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Players</h2>
              <p aria-live="polite" className="text-xs text-ink-muted">
                {players.length} of {MAX_PLAYERS} players
              </p>
            </div>
            <ul className="flex flex-col gap-2" aria-label="Players in the room">
              {players.map((player, index) => (
                <PlayerChip key={player.id} player={player} isHost={index === 0} />
              ))}
            </ul>
          </div>

          {isHost ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                onClick={startGame}
                disabled={!canStart}
                aria-describedby={canStart ? undefined : 'lobby-start-hint'}
              >
                Start game
              </Button>
              {!canStart && (
                <p id="lobby-start-hint" className="text-center text-xs text-ink-muted">
                  Need at least {MIN_PLAYERS_TO_START} players to start.
                </p>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-ink-muted">Waiting for the host to start</p>
          )}
        </Panel>
      </div>
    </main>
  )
}
