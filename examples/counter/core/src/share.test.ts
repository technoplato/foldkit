import { describe, expect, it } from 'vitest'

import { COUNT_UUID, ownedCountId } from './wire.js'
import {
  canOccupyNamedCount,
  namedCountId,
  namedShareOccupancy,
  occupiesNamedShare,
  resolveCountIdFromRows,
} from './share.js'

const kitchen = namedCountId('kitchen')

describe('named share', () => {
  it('prints a UUID count row distinct from public and owned', () => {
    expect(namedCountId('kitchen')).toMatch(
      /^c0a7c009-0000-4000-8000-[0-9a-f]{12}$/,
    )
    expect(namedCountId('kitchen')).not.toBe(COUNT_UUID)
    expect(namedCountId('kitchen')).not.toBe(ownedCountId('alice'))
    expect(namedCountId('kitchen')).toBe(namedCountId('kitchen'))
    expect(namedCountId('pantry')).not.toBe(namedCountId('kitchen'))
  })

  it('occupies /counter/kitchen as counter.kitchen', () => {
    expect(namedShareOccupancy('kitchen')).toBe('counter.kitchen')
  })

  it('lets the owner and granted subject occupy kitchen', () => {
    const row = {
      id: kitchen,
      name: 'kitchen',
      owner: 'alice',
      granted: 'bob',
    }
    expect(canOccupyNamedCount('alice', row)).toBe(true)
    expect(canOccupyNamedCount('bob', row)).toBe(true)
    expect(canOccupyNamedCount('carol', row)).toBe(false)
    expect(canOccupyNamedCount(undefined, row)).toBe(false)
  })

  it('resolves kitchen for bob and public for carol', () => {
    const previous = {
      COUNT_ID: process.env['COUNTER_COUNT_ID'],
      SHARE_NAME: process.env['COUNTER_SHARE_NAME'],
      SHARE_CREATE: process.env['COUNTER_SHARE_CREATE'],
      SUBJECT: process.env['COUNTER_SUBJECT'],
      AUDIENCE: process.env['COUNTER_AUDIENCE'],
    }
    const rows = [
      {
        id: kitchen,
        name: 'kitchen',
        owner: 'alice',
        granted: 'bob',
      },
    ]
    try {
      delete process.env['COUNTER_COUNT_ID']
      delete process.env['COUNTER_SHARE_CREATE']
      process.env['COUNTER_SHARE_NAME'] = 'kitchen'
      process.env['COUNTER_SUBJECT'] = 'bob'
      expect(resolveCountIdFromRows(rows)).toBe(kitchen)
      process.env['COUNTER_SUBJECT'] = 'carol'
      expect(resolveCountIdFromRows(rows)).toBe(COUNT_UUID)
      process.env['COUNTER_SHARE_CREATE'] = '1'
      process.env['COUNTER_SUBJECT'] = 'alice'
      expect(resolveCountIdFromRows([])).toBe(kitchen)
    } finally {
      restoreEnv('COUNTER_COUNT_ID', previous.COUNT_ID)
      restoreEnv('COUNTER_SHARE_NAME', previous.SHARE_NAME)
      restoreEnv('COUNTER_SHARE_CREATE', previous.SHARE_CREATE)
      restoreEnv('COUNTER_SUBJECT', previous.SUBJECT)
      restoreEnv('COUNTER_AUDIENCE', previous.AUDIENCE)
    }
  })

  it('occupies named share when COUNT_ID is kitchen', () => {
    const previous = process.env['COUNTER_COUNT_ID']
    try {
      process.env['COUNTER_COUNT_ID'] = kitchen
      expect(occupiesNamedShare('kitchen')).toBe(true)
      expect(occupiesNamedShare('pantry')).toBe(false)
    } finally {
      restoreEnv('COUNTER_COUNT_ID', previous)
    }
  })
})

const restoreEnv = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}
