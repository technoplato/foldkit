import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { applyAdminSubscribePayload } from './admin.js'
import {
  InstantCountSnapshotRecord,
  InstantLogMessageRecord,
  countSnapshotId,
  emptyCountSnapshot,
} from './snapshotLog.js'

const snapshot = InstantCountSnapshotRecord.make({
  asOf: '1',
  at: 1,
  id: countSnapshotId,
  value: 4,
})

const message = InstantLogMessageRecord.make({
  createdAtMs: 1,
  from: 'cli',
  id: '11111111-1111-4111-8111-111111111111',
  tag: 'Increment',
})

describe('applyAdminSubscribePayload', () => {
  it('offers decoded data from the current admin payload', () => {
    let offered: number | undefined
    let failed: unknown

    applyAdminSubscribePayload(
      {
        type: 'ok',
        data: {
          count: [snapshot],
          message: [message],
        },
      },
      data => {
        expect(data).toEqual({
          count: [snapshot],
          message: [message],
        })
        return {
          messages: [message],
          snapshot,
        }
      },
      state => {
        offered = state.snapshot.value
      },
      cause => {
        failed = cause
      },
    )

    expect(offered).toBe(4)
    expect(failed).toBeUndefined()
  })

  it('fails when payload.type is error', () => {
    let failed: unknown

    applyAdminSubscribePayload(
      { type: 'error', error: 'subscribe closed' },
      () => ({
        messages: [],
        snapshot: emptyCountSnapshot,
      }),
      () => {
        throw new Error('data should not arrive')
      },
      cause => {
        failed = cause
      },
    )

    expect(failed).toBe('subscribe closed')
  })

  it('fails when an older payload.error is set', () => {
    let failed: unknown

    applyAdminSubscribePayload(
      { error: 'stale callback' },
      () => ({
        messages: [],
        snapshot: emptyCountSnapshot,
      }),
      () => {
        throw new Error('data should not arrive')
      },
      cause => {
        failed = cause
      },
    )

    expect(failed).toBe('stale callback')
  })
})
