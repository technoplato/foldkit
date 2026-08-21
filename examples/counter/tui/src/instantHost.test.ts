import {
  describeCounterSyncError,
  startLiveCounter,
  waitForSyncedHandle,
} from 'counter-core-example'
import { Processor } from 'foldkit'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Counter TUI Instant host', () => {
  it('keeps Instant in core and out of paint', () => {
    const entrySource = readFileSync('src/entry.ts', 'utf8')
    expect(entrySource).toContain('startLiveCounter')
    expect(entrySource).toContain('Processor.Host.Tui()')
    expect(entrySource).toContain('runCounterTui')
    expect(entrySource).not.toContain('Instant(')
    expect(entrySource).not.toContain('@foldkit/instant')
    expect(entrySource).not.toContain('counter-instant-example')
    expect(entrySource).not.toContain('loadCounterDemoEnv')
    expect(entrySource).not.toContain('startCounterWindowRuntime')
    expect(entrySource).not.toContain('signIn')
    expect(entrySource).not.toContain('void Effect')
  })

  it('shows Failed when the admin token is missing', async () => {
    const previous = process.env['INSTANT_APP_ADMIN_TOKEN']
    const previousTape = process.env['COUNTER_TAPE']
    process.env['INSTANT_APP_ADMIN_TOKEN'] = ''
    delete process.env['COUNTER_TAPE']
    delete process.env['COUNTER_TAPE_PATH']
    const handle = startLiveCounter(Processor.Host.Tui())
    const snapshot = await waitForSyncedHandle(handle)
    if (previous === undefined) {
      delete process.env['INSTANT_APP_ADMIN_TOKEN']
    } else {
      process.env['INSTANT_APP_ADMIN_TOKEN'] = previous
    }
    if (previousTape === undefined) {
      delete process.env['COUNTER_TAPE']
    } else {
      process.env['COUNTER_TAPE'] = previousTape
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
