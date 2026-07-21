import type { KeyboardEvent } from 'react'
import { useState } from 'react'

import { useGameStore } from '../store'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { TextInput } from '../ui/TextInput'

const NAME_MAX_LENGTH = 20
const CODE_LENGTH = 4

export interface HomeProps {
  createRoom: (name: string) => void
  joinRoom: (code: string, name: string) => void
}

/** Create-or-join landing screen. Renders when the player has no room yet. */
export function Home({ createRoom, joinRoom }: HomeProps) {
  const error = useGameStore((state) => state.error)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const trimmedName = name.trim()
  const canCreate = trimmedName.length > 0
  const canJoin = canCreate && code.length === CODE_LENGTH

  function handleCreate() {
    if (!canCreate) return
    createRoom(trimmedName)
  }

  function handleJoin() {
    if (!canJoin) return
    joinRoom(code, trimmedName)
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') handleCreate()
  }

  function handleCodeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') handleJoin()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-semibold text-ink">
            Sketch <span className="text-accent">Party</span>
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Draw, guess, and race the clock with friends.
          </p>
        </div>

        <Panel className="flex flex-col gap-5">
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent-strong"
            >
              {error}
            </p>
          )}

          <TextInput
            label="Your nickname"
            placeholder="Enter a nickname"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleNameKeyDown}
            required
          />

          <Button variant="primary" onClick={handleCreate} disabled={!canCreate}>
            Create room
          </Button>

          <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-ink-muted uppercase">
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
            or join with a code
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextInput
                label="Room code"
                placeholder="ABCD"
                value={code}
                maxLength={CODE_LENGTH}
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase().slice(0, CODE_LENGTH))
                }
                onKeyDown={handleCodeKeyDown}
                className="font-mono tracking-[0.3em] uppercase"
              />
            </div>
            <Button variant="secondary" onClick={handleJoin} disabled={!canJoin}>
              Join
            </Button>
          </div>
        </Panel>
      </div>
    </main>
  )
}
