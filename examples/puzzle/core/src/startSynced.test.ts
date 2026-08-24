import { Processor } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { instantReadTimeoutMs } from './instantSchema.js'
import {
  hangingSyncedEngine,
  startSyncedPuzzleHandle,
  syncedHandleSettleMs,
  waitForSyncedHandle,
} from './startSynced.js'

describe('startSyncedPuzzleHandle', () => {
  it('fails closed when Runtime.start never settles', async () => {
    expect(syncedHandleSettleMs).toBeGreaterThan(instantReadTimeoutMs)
    const handle = startSyncedPuzzleHandle(
      hangingSyncedEngine(Processor.Host.Headless()),
      { settleMs: 50 },
    )
    try {
      const snapshot = await waitForSyncedHandle(handle, 1000)
      expect(snapshot._tag).toBe('Failed')
      if (snapshot._tag !== 'Failed') {
        return
      }
      expect(snapshot.error._tag).toBe('TransportFailed')
      if (snapshot.error._tag !== 'TransportFailed') {
        return
      }
      expect(snapshot.error.cause).toBe('start did not settle')
      expect(snapshot.error.what).toBe('This Processor never became Ready.')
    } finally {
      await handle.stop()
    }
  })
})
