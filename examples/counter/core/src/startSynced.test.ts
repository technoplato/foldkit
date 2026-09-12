import { Effect } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { Model } from './model.js'
import {
  describeCounterSyncError,
  memorySyncedEngine,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from './startSynced.js'

const hangingInstantEngine = (): Runtime.SyncEngine => ({
  processor: 'cli',
  read: () => Effect.never,
  subscribe: () => Effect.never,
  write: () => Effect.succeed({ link: 'offline' }),
})

describe('startSyncedCounterHandle', () => {
  it('boots Memory to Ready and adds one', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.Cli()),
    )
    const ready = await waitForSyncedHandle(handle)
    expect(ready).toEqual({
      _tag: 'Ready',
      product: Model.make({ count: 0 }),
      actionMenu: { _tag: 'Closed' },
    })
    handle.actions().incrementButtonTapped()
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        const model = handle.readModel()
        if (model._tag === 'Ready' && model.product.count === 1) {
          clearTimeout(timeout)
          stop()
          resolve()
        }
      }
      const timeout = setTimeout(() => {
        stop()
        reject(new Error('Timed out waiting for count 1.'))
      }, 2000)
      const stop = handle.subscribe(finish)
      finish()
    })
    expect(handle.readModel()).toEqual({
      _tag: 'Ready',
      product: Model.make({ count: 1 }),
      actionMenu: { _tag: 'Closed' },
    })
    handle.stop()
  })

  it('fail-closes Instant hang to Ready', async () => {
    const handle = startSyncedCounterHandle(hangingInstantEngine())
    try {
      expect(handle.readModel()._tag).toBe('Starting')
      const ready = await waitForSyncedHandle(handle, 10_000)
      expect(ready).toEqual({
        _tag: 'Ready',
        product: Model.make({ count: 0 }),
        actionMenu: { _tag: 'Closed' },
      })
    } finally {
      await handle.stop()
    }
  }, 15_000)

  it('Failed on boot read keeps describeSyncError free of the tag', async () => {
    const engine = Runtime.Memory({ processor: Processor.Host.Cli() })
    engine.failNextRead('Instant is down.')
    const handle = startSyncedCounterHandle(engine)
    const failed = await waitForSyncedHandle(handle)
    expect(failed._tag).toBe('Failed')
    if (failed._tag === 'Failed') {
      const text = describeCounterSyncError(failed.error)
      expect(text).toContain('Instant is down.')
      expect(text).toContain('Cause:')
      expect(text).not.toContain('TransportFailed')
    }
    handle.stop()
  })
})
