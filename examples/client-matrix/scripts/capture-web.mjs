#!/usr/bin/env node
/**
 * Takes the Client Matrix's screenshots of the Multiple Counters web
 * clients. Each is opened with `?engine=memory`, so every shot starts from
 * Counter 1 at 0 whatever the shared log holds. React is opened at each
 * screen's URI. Svelte takes no URI yet, so it is opened on the list and
 * the buttons that lead to the screen are clicked.
 *
 * Serve the built clients first, then run this from `packages/examples-e2e`,
 * which has Playwright:
 *
 *   pnpm --filter multiple-counters-react-example exec vite preview --port 4317
 *   pnpm --filter multiple-counters-svelte-example exec vite preview --port 4319
 *   node ../../examples/client-matrix/scripts/capture-web.mjs
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(join(process.cwd(), 'package.json'))(
  '@playwright/test',
)

const captures = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'foldkit',
  'public',
  'captures',
)

const clients = [
  { slug: 'react', origin: 'http://127.0.0.1:4317', takesUri: true },
  { slug: 'svelte', origin: 'http://127.0.0.1:4319', takesUri: false },
]

const screens = [
  { slug: 'list', uri: '/counters', clicks: [], shows: 'Add counter' },
  { slug: 'detail', uri: '/counters/1', clicks: ['Open'], shows: 'Back' },
  {
    slug: 'delete',
    uri: '/counters/1/delete/1',
    clicks: ['Open', 'Delete'],
    shows: 'Delete Counter 1?',
  },
]

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 960, height: 600 },
  deviceScaleFactor: 2,
})
for (const client of clients) {
  for (const screen of screens) {
    const uri = client.takesUri ? screen.uri : '/counters'
    await page.goto(`${client.origin}${uri}?engine=memory`)
    await page.waitForFunction(() =>
      document.body.innerText.includes('Counter 1'),
    )
    if (!client.takesUri) {
      for (const name of screen.clicks) {
        await page.getByRole('button', { name }).first().click()
      }
    }
    await page.waitForFunction(
      shows => document.body.innerText.includes(shows),
      screen.shows,
      { timeout: 15_000 },
    )
    const folder = join(captures, screen.slug)
    mkdirSync(folder, { recursive: true })
    const path = join(folder, `${client.slug}.png`)
    await page.screenshot({ path })
    console.log(path)
  }
}
await browser.close()
