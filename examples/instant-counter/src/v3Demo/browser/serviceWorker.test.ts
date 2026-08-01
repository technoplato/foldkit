import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Multiple Counters v3 offline shell', () => {
  it('handles navigations before bypassing query-bearing asset requests', () => {
    const workerSource = readFileSync(
      resolve(process.cwd(), 'public/instant-counter-sw.js'),
      'utf8',
    )
    const navigationGuard = workerSource.indexOf(
      "if (request.mode === 'navigate')",
    )
    const queryGuard = workerSource.indexOf('if (url.search.length > 0)')

    expect(navigationGuard).toBeGreaterThan(-1)
    expect(queryGuard).toBeGreaterThan(navigationGuard)
    expect(workerSource).toContain("cache.match('/index.html')")
  })
})
