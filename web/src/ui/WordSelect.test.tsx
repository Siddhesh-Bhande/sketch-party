import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { WordSelect } from './WordSelect'

describe('WordSelect', () => {
  it('shows a title and the choices as tappable, keyboard-focusable buttons', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn()
    render(<WordSelect choices={['cat', 'dog', 'boat']} onChoose={onChoose} />)

    expect(screen.getByText('Choose a word to draw')).toBeInTheDocument()
    const catButton = screen.getByRole('button', { name: 'cat' })
    expect(screen.getByRole('button', { name: 'dog' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'boat' })).toBeInTheDocument()

    catButton.focus()
    expect(catButton).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'boat' }))
    expect(onChoose).toHaveBeenCalledWith('boat')
  })
})
