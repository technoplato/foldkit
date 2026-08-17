import {
  describeCounterSyncError,
  waitForSyncedHandle,
} from 'counter-core-example'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { startInstantCounter } from './instantHost.js'

describe('Counter TUI Instant host', () => {
  it('keeps Instant in the Host and out of paint', () => {
    const hostSource = readFileSync('src/instantHost.ts', 'utf8')
    const entrySource = readFileSync('src/entry.ts', 'utf8')
    expect(hostSource).toContain('startSyncedCounterHandle')
    expect(hostSource).toContain('FoldkitCounterV01')
    expect(hostSource).toContain('Processor.Host.Tui()')
    expect(hostSource).toContain('Instant(')
    expect(hostSource).not.toContain('startCounterWindowRuntime')
    expect(hostSource).not.toContain('signIn')
    expect(hostSource).not.toContain('void Effect')
    expect(hostSource).not.toContain('Effect.orDie')
    expect(hostSource).not.toContain('renderCounterScreen')
    expect(hostSource).not.toContain('Terminal')
    expect(entrySource).toContain('startInstantCounter')
    expect(entrySource).toContain('runCounterTui')
  })

  it('shows Failed when the admin token is missing', async () => {
    const previous = process.env['INSTANT_APP_ADMIN_TOKEN']
    delete process.env['INSTANT_APP_ADMIN_TOKEN']
    const handle = startInstantCounter()
    const snapshot = await waitForSyncedHandle(handle)
    if (previous === undefined) {
      delete process.env['INSTANT_APP_ADMIN_TOKEN']
    } else {
      process.env['INSTANT_APP_ADMIN_TOKEN'] = previous
    }
    expect(snapshot._tag).toBe('Failed')
    if (snapshot._tag === 'Failed') {
      const text = describeCounterSyncError(snapshot.error)
      expect(text).toContain('INSTANT_APP_ADMIN_TOKEN')
      expect(text).not.toContain('INSTANT_APP_ID')
      expect(text).not.toContain('secret')
      expect(text).not.toContain('TransportFailed')
    }
    handle.stop()
  })
})
