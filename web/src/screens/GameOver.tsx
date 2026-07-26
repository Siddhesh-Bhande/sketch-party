import { useGameStore } from '../store'
import { Button } from '../ui/Button'
import { LeaveButton } from '../ui/LeaveButton'
import { Panel } from '../ui/Panel'

export interface GameOverProps {
  playAgain: () => void
  leaveRoom: () => void
}

/**
 * Final standings once the game ends: winner(s) highlighted (ties allowed)
 * and a host-only "Play again" button. Host is the player at `room.players[0]`;
 * if `room` is gone (e.g. after a reset), the button always shows.
 */
export function GameOver({ playAgain, leaveRoom }: GameOverProps) {
  const finalScores = useGameStore((state) => state.finalScores)
  const me = useGameStore((state) => state.me)
  const room = useGameStore((state) => state.room)

  const sorted = [...(finalScores ?? [])].sort((a, b) => b.score - a.score)
  const topScore = sorted[0]?.score ?? null

  const hostId = room?.players[0]?.id ?? null
  const isHost = !room || hostId === null || me.playerId === hostId

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Panel className="flex flex-col gap-5">
          <h1 className="text-center font-display text-2xl text-ink">Game over</h1>

          <ol className="flex flex-col gap-2">
            {sorted.map((score) => {
              const isWinner = topScore !== null && score.score === topScore
              return (
                <li
                  key={score.playerId}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
                    isWinner ? 'border-ink bg-paper' : 'border-line bg-surface'
                  }`}
                >
                  <span
                    className={`flex-1 truncate text-sm ${
                      isWinner ? 'font-semibold text-ink' : 'text-ink'
                    }`}
                  >
                    {score.name}
                  </span>
                  {isWinner && (
                    <span className="flex-none rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-strong">
                      Winner
                    </span>
                  )}
                  <span className="flex-none font-mono text-sm text-ink">{score.score}</span>
                </li>
              )
            })}
          </ol>

          {isHost ? (
            <Button variant="primary" onClick={playAgain}>
              Play again
            </Button>
          ) : (
            <p className="text-center text-sm text-ink-muted">
              Waiting for the host to start a new game.
            </p>
          )}
          <LeaveButton onLeave={leaveRoom} />
        </Panel>
      </div>
    </main>
  )
}
