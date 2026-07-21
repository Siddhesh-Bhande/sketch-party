import type { PlayerView } from '../protocol'

export interface PlayerChipProps {
  player: PlayerView
  isHost?: boolean
  isDrawer?: boolean
}

/** A player's color dot, name, score, and optional host/drawer badge. */
export function PlayerChip({ player, isHost = false, isDrawer = false }: PlayerChipProps) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5">
      <span
        aria-hidden="true"
        className="h-3 w-3 flex-none rounded-full"
        style={{ backgroundColor: player.color }}
      />
      <span
        className={`flex-1 truncate text-sm font-medium ${
          player.connected ? 'text-ink' : 'text-ink-muted line-through'
        }`}
      >
        {player.name}
      </span>
      {isHost && (
        <span className="flex-none rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-strong">
          Host
        </span>
      )}
      {isDrawer && (
        <span className="flex-none rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink-muted">
          Drawing
        </span>
      )}
      <span className="flex-none font-mono text-sm text-ink-muted">{player.score}</span>
    </li>
  )
}
