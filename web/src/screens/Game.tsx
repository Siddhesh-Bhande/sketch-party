import { useState } from 'react'

import type { PlayerView, Stroke } from '../protocol'
import { useGameStore } from '../store'
import { Button } from '../ui/Button'
import { DrawingCanvas } from '../ui/DrawingCanvas'
import { DrawingToolbar } from '../ui/DrawingToolbar'
import { Panel } from '../ui/Panel'

const DEFAULT_COLOR = '#1b1e28'
const DEFAULT_SIZE = 8

export interface GameProps {
  chooseWord: (word: string) => void
  sendStroke: (stroke: Stroke) => void
  sendUndo: () => void
  sendClearCanvas: () => void
}

/** Looks up a player's display name by id, or null if unknown. */
function findPlayerName(players: PlayerView[], playerId: string | null): string | null {
  if (!playerId) return null
  return players.find((p) => p.id === playerId)?.name ?? null
}

interface WordSelectPanelProps {
  choices: string[]
  onChoose: (word: string) => void
}

/** Minimal word-choice panel for the drawer; Phase 5 replaces this with a polished picker. */
function WordSelectPanel({ choices, onChoose }: WordSelectPanelProps) {
  return (
    <Panel className="flex flex-col gap-3 text-center">
      <p className="font-display text-xl text-ink">Pick a word to draw</p>
      <div className="flex flex-col gap-2">
        {choices.map((word) => (
          <Button key={word} variant="primary" onClick={() => onChoose(word)}>
            {word}
          </Button>
        ))}
      </div>
    </Panel>
  )
}

/** Underscore blanks standing in for the secret word's letters. */
function MaskedWord({ length }: { length: number | null }) {
  if (!length) return null
  const blanks = Array.from({ length }, () => '_').join(' ')
  return (
    <p
      aria-label={`Word: ${length} letters`}
      className="font-mono text-xl tracking-[0.3em] text-ink"
    >
      {blanks}
    </p>
  )
}

/**
 * The in-round screen: word_select shows a chooser (drawer) or a waiting
 * note (guessers); drawing shows the shared canvas, editable with a toolbar
 * for the drawer and read-only for guessers; turn_end shows a placeholder
 * panel until Phase 5 adds the reveal and scoreboard.
 */
export function Game({ chooseWord, sendStroke, sendUndo, sendClearCanvas }: GameProps) {
  const room = useGameStore((state) => state.room)
  const strokes = useGameStore((state) => state.strokes)
  const wordChoices = useGameStore((state) => state.wordChoices)
  const applyLocalStroke = useGameStore((state) => state.applyLocalStroke)
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [size, setSize] = useState(DEFAULT_SIZE)

  if (!room) return null

  const drawerName = findPlayerName(room.players, room.currentDrawerId)

  const handleStroke = (stroke: Stroke) => {
    // Optimistic local render for the drawer; the server does not echo
    // strokeBroadcast back to its sender, so this is the only paint here.
    applyLocalStroke(stroke)
    sendStroke(stroke)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-6">
      <div className="flex w-full max-w-sm flex-1 flex-col gap-3">
        {room.phase === 'word_select' && room.youAreDrawer && (
          <WordSelectPanel choices={wordChoices} onChoose={chooseWord} />
        )}

        {room.phase === 'word_select' && !room.youAreDrawer && (
          <Panel className="text-center">
            <p className="text-sm text-ink-muted">
              Waiting for {drawerName ?? 'the drawer'} to pick a word.
            </p>
          </Panel>
        )}

        {room.phase === 'drawing' && (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink-muted">
                {room.youAreDrawer ? 'Your turn to draw' : `${drawerName ?? 'Someone'} is drawing`}
              </p>
              {!room.youAreDrawer && <MaskedWord length={room.wordLength} />}
            </div>
            <div className="aspect-[3/4] w-full">
              <DrawingCanvas
                strokes={strokes}
                editable={room.youAreDrawer}
                color={color}
                size={size}
                onStroke={room.youAreDrawer ? handleStroke : undefined}
              />
            </div>
            {room.youAreDrawer && (
              <DrawingToolbar
                color={color}
                size={size}
                onColorChange={setColor}
                onSizeChange={setSize}
                onUndo={sendUndo}
                onClear={sendClearCanvas}
              />
            )}
          </>
        )}

        {room.phase === 'turn_end' && (
          <Panel className="text-center">
            <p className="font-display text-xl text-ink">Turn over</p>
          </Panel>
        )}
      </div>
    </main>
  )
}
