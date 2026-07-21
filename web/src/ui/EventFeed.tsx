import type { GameEvent } from '../store'

export interface EventFeedProps {
  events: GameEvent[]
}

/** A short scrollable activity feed (drawing started, guesses, reveals), newest at the bottom. */
export function EventFeed({ events }: EventFeedProps) {
  return (
    <ul
      aria-live="polite"
      aria-label="Activity feed"
      className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-xl border border-line bg-surface px-3 py-2 font-sans text-xs text-ink-muted"
    >
      {events.map((event) => (
        <li key={event.id}>{event.text}</li>
      ))}
    </ul>
  )
}
