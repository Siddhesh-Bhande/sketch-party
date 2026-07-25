import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots')

const HOST_NAME = 'Hostie'
const GUESSER_NAME = 'Guesser'
const PORTRAIT_VIEWPORT = { width: 390, height: 844 }
const WORD_SELECT_HEADING = 'Choose a word to draw'
const WAITING_FOR_DRAWER_PATTERN = /Waiting for .+ to pick a word\./

/**
 * Drives the app through Home -> Lobby -> Game (drawer + guesser) and saves a
 * full-page portrait screenshot at each stage, for a human design review.
 * Not an assertion suite: it re-checks the same key states already covered by
 * play-turn.spec.ts, but its purpose is the saved PNGs in `e2e/screenshots/`.
 */
test.describe('design review screenshots', () => {
  test.use({ viewport: PORTRAIT_VIEWPORT })

  test('captures Home, Lobby, and both Game drawing views', async ({ browser }) => {
    const hostContext = await browser.newContext({ viewport: PORTRAIT_VIEWPORT })
    const guesserContext = await browser.newContext({ viewport: PORTRAIT_VIEWPORT })
    const hostPage = await hostContext.newPage()
    const guesserPage = await guesserContext.newPage()

    try {
      await hostPage.goto('/')
      await expect(hostPage.getByLabel('Your nickname')).toBeVisible()
      await hostPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'home.png'),
        fullPage: true,
      })

      await hostPage.getByLabel('Your nickname').fill(HOST_NAME)
      await hostPage.getByRole('button', { name: 'Create room' }).click()

      const roomCode = hostPage.getByTestId('room-code')
      await expect(roomCode).toBeVisible()
      const code = (await roomCode.textContent())?.trim() ?? ''

      await guesserPage.goto(`/?room=${code}&name=${GUESSER_NAME}`)
      await expect(hostPage.getByText('2 of 10 players')).toBeVisible()
      await expect(
        hostPage.getByRole('button', { name: /open a second player/i }),
      ).toBeVisible()

      await hostPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'lobby.png'),
        fullPage: true,
      })

      await hostPage.getByRole('button', { name: 'Start game' }).click()

      // See play-turn.spec.ts: wait for the phase transition to land on the
      // host's page before reading which of the two post-transition states
      // it's in, rather than racing it with an unawaited isVisible() check.
      await expect(
        hostPage.getByText(WORD_SELECT_HEADING).or(hostPage.getByText(WAITING_FOR_DRAWER_PATTERN)),
      ).toBeVisible()
      const hostIsDrawer = await hostPage.getByText(WORD_SELECT_HEADING).isVisible()
      const drawerPage = hostIsDrawer ? hostPage : guesserPage
      const guesserSidePage = hostIsDrawer ? guesserPage : hostPage

      await expect(drawerPage.getByText(WORD_SELECT_HEADING)).toBeVisible()
      await drawerPage.getByRole('button').first().click()

      await expect(drawerPage.getByText(/^You are drawing: /)).toBeVisible()
      await drawerPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'game-drawer.png'),
        fullPage: true,
      })

      await expect(guesserSidePage.getByPlaceholder('Type your guess')).toBeVisible()
      await guesserSidePage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'game-guesser.png'),
        fullPage: true,
      })
    } finally {
      await hostContext.close()
      await guesserContext.close()
    }
  })
})
