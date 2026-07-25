import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GuessInput } from './GuessInput'

describe('GuessInput', () => {
  it('submits the trimmed value and clears the field on submit', async () => {
    const user = userEvent.setup()
    const onGuess = vi.fn()
    render(<GuessInput onGuess={onGuess} lastResult={null} />)

    const input = screen.getByRole('textbox')
    await user.type(input, '  banana  ')
    await user.click(screen.getByRole('button', { name: 'Guess' }))

    expect(onGuess).toHaveBeenCalledWith('banana')
    expect(input).toHaveValue('')
  })

  it('submits on Enter', async () => {
    const user = userEvent.setup()
    const onGuess = vi.fn()
    render(<GuessInput onGuess={onGuess} lastResult={null} />)

    await user.type(screen.getByRole('textbox'), 'kite{Enter}')

    expect(onGuess).toHaveBeenCalledWith('kite')
  })

  it('ignores an empty or whitespace-only guess', async () => {
    const user = userEvent.setup()
    const onGuess = vi.fn()
    render(<GuessInput onGuess={onGuess} lastResult={null} />)

    await user.type(screen.getByRole('textbox'), '   {Enter}')

    expect(onGuess).not.toHaveBeenCalled()
  })

  it('shows positive feedback and the points gained for a correct guess', () => {
    render(<GuessInput onGuess={vi.fn()} lastResult={{ result: 'correct', points: 150 }} />)

    expect(screen.getByText('Correct! +150')).toBeInTheDocument()
    expect(screen.getByText('You guessed it!')).toBeInTheDocument()
  })

  it('shows "So close!" for a near guess', () => {
    render(<GuessInput onGuess={vi.fn()} lastResult={{ result: 'near', points: 0 }} />)

    expect(screen.getByText('So close!')).toBeInTheDocument()
  })

  it('shows a subtle "Not quite" for a wrong guess', () => {
    render(<GuessInput onGuess={vi.fn()} lastResult={{ result: 'wrong', points: 0 }} />)

    expect(screen.getByText('Not quite')).toBeInTheDocument()
  })

  it('disables the input and button for the rest of the turn once correct', () => {
    render(<GuessInput onGuess={vi.fn()} lastResult={{ result: 'correct', points: 150 }} />)

    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guess' })).toBeDisabled()
  })

  it('does not submit while disabled after a correct guess', async () => {
    const user = userEvent.setup()
    const onGuess = vi.fn()
    render(<GuessInput onGuess={onGuess} lastResult={{ result: 'correct', points: 150 }} />)

    await user.click(screen.getByRole('button', { name: 'Guess' }))

    expect(onGuess).not.toHaveBeenCalled()
  })

  it('puts the feedback region in an aria-live="polite" container', () => {
    render(<GuessInput onGuess={vi.fn()} lastResult={{ result: 'wrong', points: 0 }} />)

    const feedback = screen.getByText('Not quite')
    expect(feedback.closest('[aria-live="polite"]')).not.toBeNull()
  })
})
