import { afterEach, describe, expect, it } from 'vitest'

import {
  applyCounterIdentity,
  counterCliIsolationKey,
  counterInstantRoom,
} from './isolation.js'
import { resetMemoryShareLedger } from './shareLedger.js'

const keys = [
  'COUNTER_SUBJECT',
  'COUNTER_AUDIENCE',
  'COUNTER_INSTANT_ROOM',
  'COUNTER_SHARE_NAME',
  'COUNTER_COUNT_ID',
  'COUNTER_TAPE_PATH',
  'COUNTER_SHARE_LEDGER',
  'COUNTER_TAPE',
] as const

const snapshotEnv = (): Record<string, string | undefined> => {
  const captured: Record<string, string | undefined> = {}
  for (const key of keys) {
    captured[key] = process.env[key]
  }
  return captured
}

const restoreEnv = (captured: Record<string, string | undefined>): void => {
  for (const key of keys) {
    const value = captured[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

describe('counter identity isolation', () => {
  let previous: Record<string, string | undefined>

  afterEach(() => {
    resetMemoryShareLedger()
    restoreEnv(previous)
  })

  it('keeps L6 mine rooms off named-share rooms', () => {
    previous = snapshotEnv()
    process.env['COUNTER_TAPE'] = 'memory'
    delete process.env['COUNTER_TAPE_PATH']
    applyCounterIdentity('alice', 'mine')
    expect(counterInstantRoom()).toBe('mine-alice')
    expect(process.env['COUNTER_SHARE_NAME']).toBeUndefined()
    const mineKey = counterCliIsolationKey()
    applyCounterIdentity('alice', undefined, 'kitchen')
    expect(counterInstantRoom()).toBe('share-kitchen')
    expect(process.env['COUNTER_SHARE_NAME']).toBe('kitchen')
    expect(counterCliIsolationKey()).not.toBe(mineKey)
    expect(counterCliIsolationKey()).toContain('share-kitchen')
  })

  it('forks a file tape for kitchen so public is not clobbered', () => {
    previous = snapshotEnv()
    delete process.env['COUNTER_TAPE']
    process.env['COUNTER_TAPE_PATH'] = '/tmp/counter-public.json'
    applyCounterIdentity('alice', undefined, 'kitchen')
    expect(process.env['COUNTER_TAPE_PATH']).toBe(
      '/tmp/counter-public.json.share-kitchen',
    )
    expect(process.env['COUNTER_SHARE_LEDGER']).toBe(
      '/tmp/counter-public.json.shares.json',
    )
    expect(counterCliIsolationKey()).toBe(
      '/tmp/counter-public.json.share-kitchen',
    )
  })
})
