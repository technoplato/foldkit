import { Processor, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  describeCounterSyncError,
  memorySyncedEngine,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from './startSynced.js'

describe('startSyncedCounterHandle', () => {
  it('boots Memory to Ready and adds one', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.Cli()),
    )
    const ready = await waitForSyncedHandle(handle)
    expect(ready).toEqual({ _tag: 'Ready', count: 0 })
    handle.actions().clickedIncrement()
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        const model = handle.readModel()
        if (model._tag === 'Ready' && model.count === 1) {
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
    expect(handle.readModel()).toEqual({ _tag: 'Ready', count: 1 })
    handle.stop()
  })

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
