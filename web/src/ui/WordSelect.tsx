import { Button } from './Button'
import { Panel } from './Panel'

export interface WordSelectProps {
  choices: string[]
  onChoose: (word: string) => void
}

/** The drawer's word picker: a titled panel with each choice as a large tappable button. */
export function WordSelect({ choices, onChoose }: WordSelectProps) {
  return (
    <Panel className="flex flex-col gap-3 text-center">
      <h2 className="font-display text-xl text-ink">Choose a word to draw</h2>
      <div className="flex flex-col gap-2" data-testid="word-choices">
        {choices.map((word) => (
          <Button
            key={word}
            variant="primary"
            className="py-4 text-base"
            onClick={() => onChoose(word)}
          >
            {word}
          </Button>
        ))}
      </div>
    </Panel>
  )
}
