import { useState } from 'react'

import type { PlayerView } from '../protocol'
import { useGameStore } from '../store'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { PlayerChip } from '../ui/PlayerChip'
import { useJoinQrCode } from '../useJoinQrCode'

const MAX_PLAYERS = 10
const MIN_PLAYERS_TO_START = 2

export interface LobbyProps {
  startGame: () => void
}

/**
 * Picks a friendly guest name for a spawned second player, e.g. "Player 2",
 * skipping past any name already taken in the room.
 */
function nextGuestName(players: PlayerView[]): string {
  const taken = new Set(players.map((p) => p.name))
  let n = players.length + 1
  let name = `Player ${n}`
  while (taken.has(name)) {
    n += 1
    name = `Player ${n}`
  }
  return name
}

/** Waiting room: room code, player roster, and a host-only start control. */
export function Lobby({ startGame }: LobbyProps) {
  const room = useGameStore((state) => state.room)
  const myPlayerId = useGameStore((state) => state.me.playerId)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const joinUrl = room
    ? `${window.location.origin}${window.location.pathname}?room=${room.code}`
    : null
  const { dataUrl: qrDataUrl, error: qrError } = useJoinQrCode(joinUrl)

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

  const handleCopyLink = async () => {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      // Clipboard access can be denied (permissions, insecure context); ignore silently.
    }
  }

  const handleOpenSecondPlayer = () => {
    const guestName = nextGuestName(players)
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}&name=${encodeURIComponent(guestName)}`
    window.open(url, '_blank')
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

          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={handleOpenSecondPlayer}>
              Open a second player
            </Button>
            <p className="text-center text-xs text-ink-muted">
              Play across two tabs, or share the code below
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-paper px-4 py-4">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={`QR code to join room ${room.code}`}
                className="h-32 w-32 rounded-lg border border-line bg-surface"
              />
            )}
            {!qrDataUrl && !qrError && (
              <p className="text-xs text-ink-muted">Generating QR code...</p>
            )}
            {qrError && (
              <p className="text-xs text-ink-muted">QR code unavailable. Use the link below.</p>
            )}
            <div className="flex w-full items-center gap-2">
              <p className="flex-1 truncate rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-muted">
                {joinUrl}
              </p>
              <Button variant="secondary" onClick={handleCopyLink}>
                {linkCopied ? 'Copied!' : 'Copy link'}
              </Button>
            </div>
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
