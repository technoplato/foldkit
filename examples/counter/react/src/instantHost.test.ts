import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Counter React Instant host', () => {
  it('keeps Instant out of the React window', () => {
    const viewSource = readFileSync('src/App.tsx', 'utf8')
    expect(viewSource).toContain('useModel(Path())')
    expect(viewSource).toContain('useScreen(Path())')
    expect(viewSource).toContain('paintReact')
    expect(viewSource).toContain('Starting')
    expect(viewSource).toContain('Failed')
    expect(viewSource).toContain('describeCounterSyncError')
    expect(viewSource).not.toContain('StartingWindow')
    expect(viewSource).not.toContain('signIn')
    expect(viewSource).not.toContain("useModel('/counter')")
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('instantHost')
    expect(viewSource).not.toContain('store.send')
    expect(viewSource).not.toContain('store.observe')
    expect(viewSource).not.toContain('void Effect')
  })

  it('installs Instant from core with Processor.Host.React()', () => {
    const hostSource = readFileSync('src/instantHost.ts', 'utf8')
    const entrySource = readFileSync('src/main.tsx', 'utf8')
    expect(hostSource).toContain('installSyncedCounterHandle')
    expect(hostSource).toContain('startLiveCounter')
    expect(hostSource).toContain('Processor.Host.React()')
    expect(hostSource).not.toContain('Instant(')
    expect(hostSource).not.toContain('@foldkit/instant')
    expect(hostSource).not.toContain('counter-instant-example')
    expect(hostSource).not.toContain('openLiveCounterWindowTape')
    expect(hostSource).not.toContain('signIn')
    expect(hostSource).not.toContain('void Effect')
    expect(entrySource).toContain('startInstantCounter')
    expect(entrySource).not.toContain('VITE_INSTANT_APP_ID')
  })
})
