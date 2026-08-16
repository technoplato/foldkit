import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Counter Instant browser helpers', () => {
  it('opens Instant without the Node admin store', () => {
    const source = readFileSync('src/browser.ts', 'utf8')
    expect(source).toContain('makeLiveCounterTape')
    expect(source).toContain('observeRemoteAcceptedMessages')
    expect(source).toContain('commitSharedMessage')
    expect(source).not.toContain('@instantdb/admin')
    expect(source).not.toContain('makeAdminInstantProgramStore')
    expect(source).not.toContain('void Effect.runPromise')
  })

  it('maps Instant browser and sharing subpaths for Vite hosts', () => {
    const source = readFileSync('../../vite.aliases.ts', 'utf8')
    expect(source).toContain("'@foldkit/instant/browser'")
    expect(source).toContain("'@foldkit/instant/sharing'")
  })
})
