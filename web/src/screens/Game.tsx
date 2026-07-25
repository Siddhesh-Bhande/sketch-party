import { useState } from 'react'

import type { Stroke } from '../protocol'
import { useGameStore } from '../store'
import { DrawingCanvas } from '../ui/DrawingCanvas'
import { DrawingToolbar } from '../ui/DrawingToolbar'
import { EventFeed } from '../ui/EventFeed'
import { GuessInput } from '../ui/GuessInput'
import { Panel } from '../ui/Panel'
import { Scoreboard } from '../ui/Scoreboard'
import { TimerBar } from '../ui/TimerBar'
import { TurnEndReveal } from '../ui/TurnEndReveal'
import { WordSelect } from '../ui/WordSelect'

const DEFAULT_COLOR = '#1b1e28'
const DEFAULT_SIZE = 8

export interface GameProps {
  chooseWord: (word: string) => void
  guess: (text: string) => void
  sendStroke: (stroke: Stroke) => void
  sendUndo: () => void
  sendClearCanvas: () => void
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
 * The in-round screen. `word_select` shows the word picker (drawer) or a
 * waiting note (guessers). `drawing` shows, top to bottom: the countdown
 * timer, the shared canvas (editable with a toolbar and the secret word for
 * the drawer; read-only with the masked word and a guess box for guessers),
 * a compact scoreboard, and the activity feed. `turn_end` reveals the word
 * and each player's point gain, followed by the updated scoreboard.
 */
export function Game({ chooseWord, guess, sendStroke, sendUndo, sendClearCanvas }: GameProps) {
  const room = useGameStore((state) => state.room)
  const strokes = useGameStore((state) => state.strokes)
  const wordChoices = useGameStore((state) => state.wordChoices)
  const applyLocalStroke = useGameStore((state) => state.applyLocalStroke)
  const myWord = useGameStore((state) => state.myWord)
  const myPlayerId = useGameStore((state) => state.me.playerId)
  const lastGuessResult = useGameStore((state) => state.lastGuessResult)
  const events = useGameStore((state) => state.events)
  const turnReveal = useGameStore((state) => state.turnReveal)
  const turnSeconds = useGameStore((state) => state.turnSeconds)
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [size, setSize] = useState(DEFAULT_SIZE)

  if (!room) return null

  const drawerName = room.players.find((p) => p.id === room.currentDrawerId)?.name ?? null

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
          <WordSelect choices={wordChoices} onChoose={chooseWord} />
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
            <TimerBar secondsLeft={room.secondsLeft ?? 0} turnSeconds={turnSeconds} />

            <div className="aspect-[3/4] w-full">
              <DrawingCanvas
                strokes={strokes}
                editable={room.youAreDrawer}
                color={color}
                size={size}
                onStroke={room.youAreDrawer ? handleStroke : undefined}
              />
            </div>

            {room.youAreDrawer ? (
              <>
                {myWord && (
                  <p className="text-center text-sm font-medium text-ink-muted">
                    You are drawing: {myWord}
                  </p>
                )}
                <DrawingToolbar
                  color={color}
                  size={size}
                  onColorChange={setColor}
                  onSizeChange={setSize}
                  onUndo={sendUndo}
                  onClear={sendClearCanvas}
                />
              </>
            ) : (
              <>
                <MaskedWord length={room.wordLength} />
                <GuessInput onGuess={guess} lastResult={lastGuessResult} />
              </>
            )}

            <Scoreboard
              players={room.players}
              currentDrawerId={room.currentDrawerId}
              meId={myPlayerId}
            />
            <EventFeed events={events} />
          </>
        )}

        {room.phase === 'turn_end' && (
          <>
            {turnReveal && <TurnEndReveal reveal={turnReveal} players={room.players} />}
            <Scoreboard
              players={room.players}
              currentDrawerId={room.currentDrawerId}
              meId={myPlayerId}
            />
          </>
        )}
      </div>
    </main>
  )
}
