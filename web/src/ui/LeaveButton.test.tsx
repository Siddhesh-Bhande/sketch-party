import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LeaveButton } from './LeaveButton'

describe('LeaveButton', () => {
  it('fires onLeave when clicked', async () => {
    const user = userEvent.setup()
    const onLeave = vi.fn()
    render(<LeaveButton onLeave={onLeave} />)

    await user.click(screen.getByRole('button', { name: 'Leave room' }))

    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
