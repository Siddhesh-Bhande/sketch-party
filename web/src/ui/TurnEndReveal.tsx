import type { PlayerView, TurnScore } from '../protocol'
import { Panel } from './Panel'

export interface TurnEndRevealProps {
  reveal: { word: string; scores: TurnScore[] }
  players: PlayerView[]
}

/** Shows the just-ended turn's secret word and each player's point gain. */
export function TurnEndReveal({ reveal, players }: TurnEndRevealProps) {
  const nameById = new Map(players.map((p) => [p.id, p.name]))

  return (
    <Panel className="flex flex-col gap-3 text-center">
      <p className="font-display text-xl text-ink">
        The word was <b>{reveal.word}</b>
      </p>
      <ul className="flex flex-col gap-1.5 text-left">
        {reveal.scores.map((score) => (
          <li key={score.playerId} className="flex items-center justify-between text-sm">
            <span className="text-ink">{nameById.get(score.playerId) ?? 'Unknown'}</span>
            <span
              className={`font-mono ${
                score.gained > 0 ? 'font-semibold text-p3' : 'text-ink-muted'
              }`}
            >
              {score.gained > 0 ? `+${score.gained}` : score.gained}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
