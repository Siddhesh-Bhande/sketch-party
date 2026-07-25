import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initialGameState, useGameStore } from '../store'
import { Home } from './Home'

beforeEach(() => {
  useGameStore.setState({ ...initialGameState })
})

describe('Home', () => {
  it('renders the wordmark and a one-line tagline', () => {
    render(<Home createRoom={vi.fn()} joinRoom={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Sketch Party' })).toBeInTheDocument()
    expect(screen.getByText(/draw/i)).toBeInTheDocument()
  })

  it('disables Create room until a nickname is entered', async () => {
    const user = userEvent.setup()
    render(<Home createRoom={vi.fn()} joinRoom={vi.fn()} />)

    const createButton = screen.getByRole('button', { name: 'Create room' })
    expect(createButton).toBeDisabled()

    await user.type(screen.getByLabelText('Your nickname'), 'Alex')
    expect(createButton).toBeEnabled()
  })

  it('calls the injected createRoom with the trimmed nickname', async () => {
    const user = userEvent.setup()
    const createRoom = vi.fn()
    render(<Home createRoom={createRoom} joinRoom={vi.fn()} />)

    await user.type(screen.getByLabelText('Your nickname'), '  Alex  ')
    await user.click(screen.getByRole('button', { name: 'Create room' }))

    expect(createRoom).toHaveBeenCalledWith('Alex')
  })

  it('disables Join until a nickname and a 4-letter code are entered, and uppercases the code', async () => {
    const user = userEvent.setup()
    const joinRoom = vi.fn()
    render(<Home createRoom={vi.fn()} joinRoom={joinRoom} />)

    const joinButton = screen.getByRole('button', { name: 'Join' })
    expect(joinButton).toBeDisabled()

    await user.type(screen.getByLabelText('Your nickname'), 'Sam')
    expect(joinButton).toBeDisabled()

    await user.type(screen.getByLabelText('Room code'), 'wxyz')
    expect(screen.getByLabelText('Room code')).toHaveValue('WXYZ')
    expect(joinButton).toBeEnabled()

    await user.click(joinButton)
    expect(joinRoom).toHaveBeenCalledWith('WXYZ', 'Sam')
  })

  it('shows a store error inline', () => {
    useGameStore.setState({ error: 'Room not found' })
    render(<Home createRoom={vi.fn()} joinRoom={vi.fn()} />)

    expect(screen.getByText('Room not found')).toBeInTheDocument()
  })

  it('caps the nickname at 20 characters', () => {
    render(<Home createRoom={vi.fn()} joinRoom={vi.fn()} />)
    expect(screen.getByLabelText('Your nickname')).toHaveAttribute('maxLength', '20')
  })

  it('prefills the room code field from initialCode and focuses the nickname input', () => {
    render(<Home createRoom={vi.fn()} joinRoom={vi.fn()} initialCode="WXYZ" />)

    expect(screen.getByLabelText('Room code')).toHaveValue('WXYZ')
    expect(screen.getByLabelText('Your nickname')).toHaveFocus()
  })

  it('enables Join immediately once a name is typed when a code was prefilled', async () => {
    const user = userEvent.setup()
    const joinRoom = vi.fn()
    render(<Home createRoom={vi.fn()} joinRoom={joinRoom} initialCode="WXYZ" />)

    const joinButton = screen.getByRole('button', { name: 'Join' })
    expect(joinButton).toBeDisabled()

    await user.type(screen.getByLabelText('Your nickname'), 'Sam')
    expect(joinButton).toBeEnabled()

    await user.click(joinButton)
    expect(joinRoom).toHaveBeenCalledWith('WXYZ', 'Sam')
  })

  it('does not prefill or steal focus when initialCode is absent', () => {
    render(<Home createRoom={vi.fn()} joinRoom={vi.fn()} />)

    expect(screen.getByLabelText('Room code')).toHaveValue('')
    expect(screen.getByLabelText('Your nickname')).not.toHaveFocus()
  })

  it('prefills and focuses even when initialCode arrives a render after mount', () => {
    const { rerender } = render(<Home createRoom={vi.fn()} joinRoom={vi.fn()} />)
    expect(screen.getByLabelText('Room code')).toHaveValue('')

    rerender(<Home createRoom={vi.fn()} joinRoom={vi.fn()} initialCode="WXYZ" />)

    expect(screen.getByLabelText('Room code')).toHaveValue('WXYZ')
    expect(screen.getByLabelText('Your nickname')).toHaveFocus()
  })
})
