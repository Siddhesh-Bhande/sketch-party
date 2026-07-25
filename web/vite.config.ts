/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
    // Playwright specs live under e2e/ and run via `playwright test`, not
    // vitest; without this, vitest's default include glob would also pick
    // them up and fail (no jsdom, no @playwright/test globals).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
