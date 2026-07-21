export interface TimerBarProps {
  secondsLeft: number
  turnSeconds: number
}

/** Below this many seconds remaining, the bar and readout switch to the warn color. */
const URGENT_THRESHOLD_SECONDS = 15

/** Formats a seconds count as `m:ss`, e.g. 75 -> "1:15". Never goes negative. */
function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * A horizontal countdown bar for the current turn: a solid-color fill sized
 * to `secondsLeft / turnSeconds` plus a `font-mono` `m:ss` readout. Under
 * `URGENT_THRESHOLD_SECONDS` the fill and readout switch to the warn color,
 * but the readout's exact number is always present so urgency is never
 * conveyed by color alone. `role="timer"` carries the remaining seconds as
 * text for assistive tech.
 */
export function TimerBar({ secondsLeft, turnSeconds }: TimerBarProps) {
  const clampedLeft = Math.max(0, secondsLeft)
  const percent = turnSeconds > 0 ? Math.min(100, (clampedLeft / turnSeconds) * 100) : 0
  const urgent = clampedLeft > 0 && clampedLeft <= URGENT_THRESHOLD_SECONDS
  const wholeSeconds = Math.max(0, Math.round(secondsLeft))
  const label = `${wholeSeconds} second${wholeSeconds === 1 ? '' : 's'} left`

  return (
    <div className="flex flex-col gap-1">
      <div
        role="timer"
        aria-label={label}
        className="h-2.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${
            urgent ? 'bg-accent' : 'bg-ink'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p
        className={`text-right font-mono text-xs ${
          urgent ? 'font-bold text-accent-strong' : 'text-ink-muted'
        }`}
      >
        {formatClock(secondsLeft)}
      </p>
    </div>
  )
}
