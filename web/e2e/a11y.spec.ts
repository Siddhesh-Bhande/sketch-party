import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/** Violation impact levels serious enough to fail the build on. */
const BLOCKING_IMPACTS = new Set(['serious', 'critical'])

test.describe('accessibility', () => {
  test('Home screen has no serious or critical violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel('Your nickname')).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''))
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
  })

  test('Lobby screen has no serious or critical violations', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Your nickname').fill('Auditor')
    await page.getByRole('button', { name: 'Create room' }).click()
    await expect(page.getByTestId('room-code')).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''))
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
  })
})
