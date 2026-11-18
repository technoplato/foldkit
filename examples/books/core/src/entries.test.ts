import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceOf = (name: string): string =>
  readFileSync(join(process.cwd(), 'src', name), 'utf8')

describe('the books core entries', () => {
  it('keeps the domain entry free of any sync engine or store adapter', () => {
    const domain = sourceOf('index.ts')
    expect(domain).not.toMatch(/instant/i)
    expect(domain).not.toMatch(/live\.js/)
  })

  it('exports the Instant adapters from the two host entries, under the same names', () => {
    const adapters = [
      "export * from './instantLibrary.js'",
      "export * from './instantScribeTimeline.js'",
      "export * from './instantTranscript.js'",
    ]
    for (const entry of ['index.node.ts', 'index.browser.ts']) {
      const source = sourceOf(entry)
      for (const adapter of adapters) {
        expect(source).toContain(adapter)
      }
    }
  })
})
