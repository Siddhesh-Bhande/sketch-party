import type { FormEvent } from 'react'
import { useState } from 'react'

import { Button } from './Button'

export interface GuessResultLike {
  result: string
  points: number
}

export interface GuessInputProps {
  onGuess: (text: string) => void
  lastResult: GuessResultLike | null
}

interface Feedback {
  text: string
  className: string
}

/** Maps a guess result to its inline feedback text and color; unknown/'ignored' results show nothing. */
function feedbackFor(lastResult: GuessResultLike | null): Feedback | null {
  if (!lastResult) return null
  switch (lastResult.result) {
    case 'correct':
      return { text: `Correct! +${lastResult.points}`, className: 'text-p3 font-semibold' }
    case 'near':
      return { text: 'So close!', className: 'text-ink' }
    case 'wrong':
      return { text: 'Not quite', className: 'text-ink-muted' }
    default:
      return null
  }
}

/**
 * A guess text field with submit button. Enter submits; the field clears on
 * submit and ignores empty/whitespace-only guesses. Feedback for the most
 * recent guess renders inline in an `aria-live="polite"` region; once a
 * guess is correct, the field is disabled for the rest of the turn.
 */
export function GuessInput({ onGuess, lastResult }: GuessInputProps) {
  const [value, setValue] = useState('')
  const guessed = lastResult?.result === 'correct'
  const feedback = feedbackFor(lastResult)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (guessed) return
    const trimmed = value.trim()
    if (!trimmed) return
    onGuess(trimmed)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <label htmlFor="guess-input" className="sr-only">
          Your guess
        </label>
        <input
          id="guess-input"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={guessed}
          placeholder="Type your guess"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50"
        />
        <Button type="submit" variant="primary" disabled={guessed}>
          Guess
        </Button>
      </div>
      <div aria-live="polite" className="min-h-[1.25em] text-sm">
        {feedback && <p className={feedback.className}>{feedback.text}</p>}
        {guessed && <p className="text-ink-muted">You guessed it!</p>}
      </div>
    </form>
  )
}
