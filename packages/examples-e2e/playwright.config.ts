import { defineConfig, devices } from '@playwright/test'

const exampleSlug = process.env['EXAMPLE_SLUG']
if (!exampleSlug) {
  throw new Error(
    'EXAMPLE_SLUG environment variable is required. ' +
      'Example: EXAMPLE_SLUG=counter pnpm --filter @foldkit/examples-e2e test:e2e',
  )
}

const PORT = 5180
const BASE_URL = `http://localhost:${PORT}`

type ExamplePage = Readonly<{
  directory: string
  env: Readonly<Record<string, string>>
}>

// NOTE: Where an example's page lives when it is not `examples/<slug>`
// itself, and what it is started with so a test never writes to a shared
// sync app: the Counter's page keeps its tape in memory, and Counters
// starts with no app to sync with, so each run begins from its own state.
const pagesElsewhere: Readonly<Record<string, ExamplePage>> = {
  counter: {
    directory: 'counter/foldkit',
    env: { VITE_COUNTER_TAPE: 'memory' },
  },
  counters: { directory: 'counters', env: { VITE_INSTANT_APP_ID: '' } },
}

const examplePage: ExamplePage = pagesElsewhere[exampleSlug] ?? {
  directory: exampleSlug,
  env: {},
}

export default defineConfig({
  testDir: './e2e',
  testMatch: `**/${exampleSlug}.spec.ts`,
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: `pnpm -C ../../examples/${examplePage.directory} exec vite --port ${PORT} --strictPort`,
    env: examplePage.env,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
