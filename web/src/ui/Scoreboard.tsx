import type { PlayerView } from '../protocol'

export interface ScoreboardProps {
  players: PlayerView[]
  currentDrawerId: string | null
  meId: string | null
}

/**
 * A compact, sorted-by-score-descending player list. The drawer is tagged
 * with a "drawing" badge, the local player with a "you" badge, and
 * disconnected players are muted, struck through, and tagged "away" so none
 * of these states rely on color alone.
 */
export function Scoreboard({ players, currentDrawerId, meId }: ScoreboardProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score)

  return (
    <ol className="flex flex-col gap-1.5" aria-label="Scoreboard">
      {sorted.map((player) => {
        const isDrawer = player.id === currentDrawerId
        const isMe = player.id === meId
        return (
          <li
            key={player.id}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{ backgroundColor: player.color }}
            />
            <span
              className={`flex-1 truncate text-sm font-medium ${
                player.connected ? 'text-ink' : 'text-ink-muted line-through'
              }`}
            >
              {player.name}
            </span>
            {isDrawer && (
              <span className="flex-none rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                drawing
              </span>
            )}
            {isMe && (
              <span className="flex-none rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent-strong">
                you
              </span>
            )}
            {!player.connected && (
              <span className="flex-none text-[11px] font-medium text-ink-muted">away</span>
            )}
            <span className="flex-none font-mono text-sm text-ink">{player.score}</span>
          </li>
        )
      })}
    </ol>
  )
}
