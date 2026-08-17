import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Counter Instant browser helpers', () => {
  it('opens Instant without the Node admin store', () => {
    const source = readFileSync('src/browser.ts', 'utf8')
    expect(source).toContain('InstantSnapshotLogSchema')
    expect(source).toContain('makeInstantCoreSnapshotLogTransport')
    expect(source).toContain('openSnapshotCounterWindowTape')
    expect(source).not.toContain('makeLiveCounterTape')
    expect(source).not.toContain('observeRemoteAcceptedMessages')
    expect(source).not.toContain('@instantdb/admin')
    expect(source).not.toContain('makeAdminInstantProgramStore')
    expect(source).not.toContain('void Effect.runPromise')
  })

  it('maps Instant browser, sharing, and snapshot-log subpaths for Vite hosts', () => {
    const source = readFileSync('../../vite.aliases.ts', 'utf8')
    expect(source).toContain("'@foldkit/instant/browser'")
    expect(source).toContain("'@foldkit/instant/sharing'")
    expect(source).toContain("'@foldkit/instant/snapshot-log'")
  })
})
