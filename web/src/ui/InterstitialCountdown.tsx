import { useEffect, useState } from 'react'

/**
 * A shrinking progress line plus text showing how long until the next turn
 * starts. Counts down locally from `seconds` (the server's interstitial gap),
 * so a player waiting on the turn-end reveal knows how long to wait. The text
 * is not an aria-live region on purpose: announcing every tick would flood a
 * screen reader, and the reveal panel already conveys the state.
 */
export function InterstitialCountdown({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    setRemaining(seconds)
    if (seconds <= 0) return
    const startedAt = Date.now()
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000
      setRemaining(Math.max(0, seconds - elapsed))
    }, 100)
    return () => clearInterval(id)
  }, [seconds])

  if (seconds <= 0) return null

  const pct = Math.max(0, Math.min(100, (remaining / seconds) * 100))
  const label = remaining > 0.5 ? `Next turn in ${Math.ceil(remaining)}s` : 'Starting next turn...'

  return (
    <div className="w-full">
      <p className="mb-1 text-center text-sm text-ink-muted">{label}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-100 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
