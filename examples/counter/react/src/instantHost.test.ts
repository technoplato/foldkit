import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Counter React Instant host', () => {
  it('keeps Instant out of the React window', () => {
    const viewSource = readFileSync('src/App.tsx', 'utf8')
    expect(viewSource).toContain('useModel')
    expect(viewSource).toContain('useActions')
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('instantHost')
    expect(viewSource).not.toContain('store.send')
    expect(viewSource).not.toContain('store.observe')
    expect(viewSource).not.toContain('void Effect')
  })

  it('installs the Instant window runtime from the host', () => {
    const hostSource = readFileSync('src/instantHost.ts', 'utf8')
    const entrySource = readFileSync('src/main.tsx', 'utf8')
    expect(hostSource).toContain('installCounterWindowRuntime')
    expect(hostSource).toContain('counterProcessorIds.react')
    expect(hostSource).toContain('openLiveCounterWindowTape')
    expect(hostSource).not.toContain('void Effect')
    expect(entrySource).toContain('startInstantCounterWindow')
    expect(entrySource).toContain('VITE_INSTANT_APP_ID')
  })
})
