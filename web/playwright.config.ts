import { defineConfig, devices } from '@playwright/test'

const BACKEND_URL = 'http://localhost:8000'
const FRONTEND_URL = 'http://localhost:4173'

/**
 * Boots the real backend (uv/FastAPI) and the real frontend (Vite preview,
 * built first) so the e2e suite exercises the actual websocket loop end to
 * end, not a mocked one. `reuseExistingServer` is disabled in CI so a stale
 * process can never mask a broken build; locally it lets a server left
 * running from a previous run be reused.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  timeout: 60_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command:
        'cd ../api && ALLOWED_ORIGINS=http://localhost:4173 uv run uvicorn sketch_party.app:create_app --factory --port 8000',
      url: `${BACKEND_URL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build && npm run preview -- --port 4173',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
