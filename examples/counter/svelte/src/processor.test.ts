import {
  Path,
  type SyncedCounterHandle,
  memorySyncedEngine,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from 'counter-core-example'
import { Processor } from 'foldkit'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { startInstantCounter } from './instantHost.js'
import {
  installSyncedCounterHandle,
  resetSyncedCounterHandle,
  useActions,
  useModel,
} from './processor.js'

const waitForReadyCount = async (
  handle: SyncedCounterHandle,
  count: number,
) => {
  const current = handle.readModel()
  if (current._tag === 'Ready' && current.product.count === count) {
    return current
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop()
      reject(new Error('Timed out waiting for the Counter handle.'))
    }, 1000)
    const stop = handle.subscribe(() => {
      const next = handle.readModel()
      if (next._tag === 'Ready' && next.product.count === count) {
        clearTimeout(timeout)
        stop()
        resolve(next)
      }
    })
  })
}

let handle: SyncedCounterHandle | undefined

afterEach(() => {
  resetSyncedCounterHandle()
  handle = undefined
})

describe('Counter Svelte processor', () => {
  it('keeps Instant out of the Svelte window', () => {
    const viewSource = readFileSync('src/App.svelte', 'utf8')
    expect(viewSource).toContain('useModel(Path())')
    expect(viewSource).toContain('useActions(Path())')
    expect(viewSource).toContain('describeCounterSyncError')
    expect(viewSource).not.toContain('StartingWindow')
    expect(viewSource).not.toContain('signIn')
    expect(viewSource).not.toContain("useModel('/counter')")
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('instantHost')
    expect(viewSource).not.toContain('store.send')
  })

  it('installs Instant from the host with Processor.Host.Svelte()', () => {
    const hostSource = readFileSync('src/instantHost.ts', 'utf8')
    const entrySource = readFileSync('src/main.ts', 'utf8')
    expect(hostSource).toContain('installSyncedCounterHandle')
    expect(hostSource).toContain('startLiveCounter')
    expect(hostSource).toContain('Processor.Host.Svelte()')
    expect(hostSource).not.toContain('Instant(')
    expect(hostSource).not.toContain('@foldkit/instant')
    expect(hostSource).not.toContain('counter-instant-example')
    expect(hostSource).not.toContain('openLiveCounterWindowTape')
    expect(hostSource).not.toContain('signIn')
    expect(entrySource).toContain('startInstantCounter')
    expect(entrySource).not.toContain('VITE_INSTANT_APP_ID')
    expect(startInstantCounter).toEqual(expect.any(Function))
  })

  it('draws Ready from useModel and adds one without send', async () => {
    handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.Svelte()),
    )
    installSyncedCounterHandle(handle)
    const ready = await waitForSyncedHandle(handle)
    expect(ready).toEqual({
      _tag: 'Ready',
      product: { count: 0 },
      actionMenu: { _tag: 'Closed' },
    })
    expect(useModel(Path())).toEqual({
      _tag: 'Ready',
      product: { count: 0 },
      actionMenu: { _tag: 'Closed' },
    })

    useActions(Path()).incrementButtonTapped()
    const next = await waitForReadyCount(handle, 1)
    expect(next).toEqual({
      _tag: 'Ready',
      product: { count: 1 },
      actionMenu: { _tag: 'Closed' },
    })
  })
})
