import { expect, test, type WebSocket } from '@playwright/test'

const HOST_NAME = 'Hostie'
const GUESSER_NAME = 'Guesser'
const ROOM_CODE_PATTERN = /^[A-Z]{4}$/
const WORD_SELECT_HEADING = 'Choose a word to draw'
const WAITING_FOR_DRAWER_PATTERN = /Waiting for .+ to pick a word\./

interface GuessResultFramePayload {
  type?: string
  result?: string
}

/** Parses a websocket frame's text payload as a guessResult message, or returns null. */
function parseGuessResultFrame(payload: string | Buffer): GuessResultFramePayload | null {
  const text = typeof payload === 'string' ? payload : payload.toString('utf-8')
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data === 'object' && data !== null) return data as GuessResultFramePayload
    return null
  } catch {
    return null
  }
}

test.describe('two-client play-through', () => {
  test('join, start, pick a word, guess it, and see the score update', async ({ browser }) => {
    // Two isolated browser contexts (independent cookies/sessionStorage), the
    // way two separate players on two separate devices would connect.
    const hostContext = await browser.newContext()
    const guesserContext = await browser.newContext()
    const hostPage = await hostContext.newPage()
    const guesserPage = await guesserContext.newPage()

    try {
      // Attach the websocket listeners before navigating, so the "join" and
      // "createRoom" connections aren't missed.
      const hostWsPromise = hostPage.waitForEvent('websocket')
      await hostPage.goto('/')
      await hostPage.getByLabel('Your nickname').fill(HOST_NAME)
      await hostPage.getByRole('button', { name: 'Create room' }).click()
      const hostWs = await hostWsPromise

      const roomCode = hostPage.getByTestId('room-code')
      await expect(roomCode).toBeVisible()
      const code = (await roomCode.textContent())?.trim() ?? ''
      expect(code).toMatch(ROOM_CODE_PATTERN)

      // Deep link auto-joins: `?room=CODE&name=NAME`.
      const guesserWsPromise = guesserPage.waitForEvent('websocket')
      await guesserPage.goto(`/?room=${code}&name=${GUESSER_NAME}`)
      const guesserWs = await guesserWsPromise

      // Both clients should settle on the Lobby, in sync, with 2 players.
      await expect(hostPage.getByText('2 of 10 players')).toBeVisible()
      await expect(guesserPage.getByText('2 of 10 players')).toBeVisible()
      await expect(hostPage.getByText(GUESSER_NAME)).toBeVisible()
      await expect(guesserPage.getByText(HOST_NAME)).toBeVisible()

      await hostPage.getByRole('button', { name: 'Start game' }).click()

      // The round begins once the host's page renders either the word-choice
      // panel (host is drawing) or the "waiting for X to pick a word" note
      // (host is guessing); wait for that transition before reading which one
      // it is, so the check isn't a snapshot racing the websocket message.
      await expect(
        hostPage.getByText(WORD_SELECT_HEADING).or(hostPage.getByText(WAITING_FOR_DRAWER_PATTERN)),
      ).toBeVisible()
      const hostIsDrawer = await hostPage.getByText(WORD_SELECT_HEADING).isVisible()
      const drawerPage = hostIsDrawer ? hostPage : guesserPage
      const guesserSidePage = hostIsDrawer ? guesserPage : hostPage
      const guesserSideWs: WebSocket = hostIsDrawer ? guesserWs : hostWs

      await expect(drawerPage.getByText(WORD_SELECT_HEADING)).toBeVisible()
      // The word-choice panel is the only content on screen at this phase, so
      // the first button on the page is the first word choice.
      await drawerPage.getByRole('button').first().click()

      const drawingWordText = drawerPage.getByText(/^You are drawing: /)
      await expect(drawingWordText).toBeVisible()
      const drawingWordLine = (await drawingWordText.textContent()) ?? ''
      const word = drawingWordLine.replace('You are drawing:', '').trim()
      expect(word.length).toBeGreaterThan(0)

      const guessBox = guesserSidePage.getByPlaceholder('Type your guess')
      await expect(guessBox).toBeVisible()
      await guessBox.fill(word)

      // With exactly one guesser, guessing correctly ends the turn the
      // instant the server processes it (all non-drawers have now guessed),
      // so the roomState broadcast that follows can null out the guesser's
      // inline feedback before the same paint ever shows it - a plain DOM
      // poll for "Correct" text is genuinely racy here (observed flaky in
      // practice). Instead, assert the server's own `guessResult` frame on
      // the wire: that is the actual proof the guess was judged correct,
      // over the real websocket, with no UI-timing dependency.
      const guessResultFramePromise = guesserSideWs.waitForEvent('framereceived', {
        predicate: (data) => parseGuessResultFrame(data.payload)?.type === 'guessResult',
        timeout: 20_000,
      })
      await guesserSidePage.getByRole('button', { name: 'Guess' }).click()
      const guessResultFrame = await guessResultFramePromise
      const guessResult = parseGuessResultFrame(guessResultFrame.payload)
      expect(guessResult?.result).toBe('correct')

      // The turn-end reveal (word + each player's point gain) stays on
      // screen for the interstitial window, making it the sturdy, non-racy
      // proof of the resulting score update.
      await expect(guesserSidePage.getByText('The word was', { exact: false })).toBeVisible()
      await expect(guesserSidePage.getByText(/\+\d+/).first()).toBeVisible()
    } finally {
      await hostContext.close()
      await guesserContext.close()
    }
  })
})
