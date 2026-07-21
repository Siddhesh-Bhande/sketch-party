import { Panel } from '../ui/Panel'

/** Stand-in for the Game and GameOver screens, filled in during Phases 4-5. */
export function GamePlaceholder() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Panel className="w-full max-w-sm text-center">
        <p className="font-display text-2xl text-ink">Game starting...</p>
        <p className="mt-2 text-sm text-ink-muted">
          The drawing canvas and scoreboard arrive in the next update.
        </p>
      </Panel>
    </main>
  )
}
