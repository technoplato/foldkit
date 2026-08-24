import { Effect } from 'effect'
import { Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { instantReadTimeoutMs } from './instantSchema.js'
import {
  startSyncedPuzzleHandle,
  syncedHandleSettleMs,
  waitForSyncedHandle,
} from './startSynced.js'

const hangingEngine = (): Runtime.SyncEngine => ({
  processor: 'headless',
  read: () => Effect.never,
  subscribe: () => Effect.never,
  write: () => Effect.succeed({ link: 'offline' }),
})

describe('startSyncedPuzzleHandle', () => {
  it('fails closed when Runtime.start never settles', async () => {
    expect(syncedHandleSettleMs).toBeGreaterThan(instantReadTimeoutMs)
    const handle = startSyncedPuzzleHandle(hangingEngine(), { settleMs: 50 })
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
