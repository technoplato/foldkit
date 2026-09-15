import { describe, expect, it } from 'vitest'

import {
  applyCounterIdentity,
  applyCounterShare,
  counterCliIsolationKey,
  counterInstantRoom,
  counterShareIsolation,
} from './isolation.js'

describe('named-share isolation', () => {
  it('does not use an L6 mine room for kitchen', () => {
    const previous = snapshotEnv()
    try {
      applyCounterIdentity('alice', 'mine')
      expect(counterInstantRoom()).toBe('mine-alice')
      delete process.env['COUNTER_TAPE']
      delete process.env['COUNTER_TAPE_PATH']
      applyCounterShare('kitchen', 'bob', true)
      expect(counterInstantRoom()).toBeUndefined()
      expect(counterShareIsolation()).toBe('named-kitchen:alice')
      expect(counterCliIsolationKey()).toBe('instant:named-kitchen:alice')
    } finally {
      restoreEnv(previous)
    }
  })

  it('isolates bob and carol on the same named counter', () => {
    const previous = snapshotEnv()
    try {
      delete process.env['COUNTER_TAPE']
      delete process.env['COUNTER_TAPE_PATH']
      applyCounterIdentity('bob', undefined)
      applyCounterShare('kitchen', undefined, false)
      expect(counterCliIsolationKey()).toBe('instant:named-kitchen:bob')
      applyCounterIdentity('carol', undefined)
      applyCounterShare('kitchen', undefined, false)
      expect(counterCliIsolationKey()).toBe('instant:named-kitchen:carol')
    } finally {
      restoreEnv(previous)
    }
  })
})

const snapshotEnv = (): Readonly<{
  subject: string | undefined
  audience: string | undefined
  room: string | undefined
  shareName: string | undefined
  grant: string | undefined
  create: string | undefined
  tape: string | undefined
  tapePath: string | undefined
}> => ({
  subject: process.env['COUNTER_SUBJECT'],
  audience: process.env['COUNTER_AUDIENCE'],
  room: process.env['COUNTER_INSTANT_ROOM'],
  shareName: process.env['COUNTER_SHARE_NAME'],
  grant: process.env['COUNTER_SHARE_GRANT'],
  create: process.env['COUNTER_SHARE_CREATE'],
  tape: process.env['COUNTER_TAPE'],
  tapePath: process.env['COUNTER_TAPE_PATH'],
})

const restoreEnv = (
  previous: ReturnType<typeof snapshotEnv>,
): void => {
  setEnv('COUNTER_SUBJECT', previous.subject)
  setEnv('COUNTER_AUDIENCE', previous.audience)
  setEnv('COUNTER_INSTANT_ROOM', previous.room)
  setEnv('COUNTER_SHARE_NAME', previous.shareName)
  setEnv('COUNTER_SHARE_GRANT', previous.grant)
  setEnv('COUNTER_SHARE_CREATE', previous.create)
  setEnv('COUNTER_TAPE', previous.tape)
  setEnv('COUNTER_TAPE_PATH', previous.tapePath)
}

const setEnv = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}
