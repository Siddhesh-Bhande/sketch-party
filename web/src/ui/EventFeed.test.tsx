import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EventFeed } from './EventFeed'

describe('EventFeed', () => {
  it('renders nothing when there are no events', () => {
    render(<EventFeed events={[]} />)

    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('renders events oldest first, newest last', () => {
    render(
      <EventFeed
        events={[
          { id: 'a', text: 'Ada is drawing' },
          { id: 'b', text: 'Grace guessed the word!' },
        ]}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Ada is drawing',
      'Grace guessed the word!',
    ])
  })

  it('is an aria-live="polite" region', () => {
    render(<EventFeed events={[{ id: 'a', text: 'Ada is drawing' }]} />)

    expect(screen.getByRole('list')).toHaveAttribute('aria-live', 'polite')
  })
})
