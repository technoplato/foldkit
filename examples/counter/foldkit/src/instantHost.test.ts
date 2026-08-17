import { Model, SyncedCounter } from 'counter-core-example'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  paintCounterHostStatus,
  reportAttachedFoldkitFailure,
} from './instantHost.js'

describe('Counter Foldkit Instant host chrome', () => {
  it('paints Starting and Failed, then leaves Ready to Foldkit', () => {
    const container = document.createElement('div')
    expect(paintCounterHostStatus(container, SyncedCounter.Starting())).toBe(
      true,
    )
    expect(container.textContent).toContain('Starting Instant Counter')
    expect(
      paintCounterHostStatus(
        container,
        SyncedCounter.Failed({
          error: SyncedCounter.TransportFailed({
            what: 'Instant did not return a snapshot.',
            meaning: 'This Processor could not start from Instant.',
            fix: 'Check the Instant app and try again.',
            cause:
              'Instant() needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
          }),
        }),
      ),
    ).toBe(true)
    expect(container.textContent).toContain('INSTANT_APP_ADMIN_TOKEN')
    expect(container.textContent).not.toContain('TransportFailed')
    expect(container.querySelector('button')).toBeNull()
    expect(
      paintCounterHostStatus(
        container,
        SyncedCounter.Ready(Model.make({ count: 3 })),
      ),
    ).toBe(false)
  })

  it('opens Instant through Instant() and Processor.Host.Foldkit()', () => {
    const source = readFileSync('src/instantHost.ts', 'utf8')
    expect(source).toContain('FoldkitCounterV01')
    expect(source).toContain('Processor.Host.Foldkit()')
    expect(source).toContain('Instant(')
    expect(source).toContain('startSyncedCounterHandle')
    expect(source).not.toContain('openLiveCounterWindowTape')
    expect(source).not.toContain('signIn')
    expect(source).not.toContain('StartingWindow')
    expect(source).not.toContain('void Effect.runPromise')
  })

  it('keeps Instant out of the Foldkit window view', () => {
    const viewSource = readFileSync('src/view.ts', 'utf8')
    expect(viewSource).toContain('paintHtml')
    expect(viewSource).toContain('counterScreen')
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('store.send')
    expect(viewSource).not.toContain('store.observe')
    expect(viewSource).not.toContain('void Effect.runPromise')
    expect(viewSource).not.toContain('Button.view')
  })

  it('keeps Ready when Foldkit attach fails', () => {
    expect(() => {
      reportAttachedFoldkitFailure(
        new Error('Foldkit could not attach the Counter screen.'),
      )
    }).not.toThrow()
  })
})
