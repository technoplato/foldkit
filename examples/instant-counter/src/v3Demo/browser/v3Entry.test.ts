import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Multiple Counters v3 production entry', () => {
  it('registers the offline shell service worker on the first load', () => {
    const entrySource = readFileSync(
      resolve(process.cwd(), 'src/v3Entry.ts'),
      'utf8',
    )

    expect(entrySource).toContain('import.meta.env.PROD')
    expect(entrySource).toContain("window.addEventListener(\n    'load'")
    expect(entrySource).toContain("register('/instant-counter-sw.js')")
    expect(entrySource).toContain('{ once: true }')
  })
})
