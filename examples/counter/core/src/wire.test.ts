import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { Increment, OpenedNavigation } from './message.js'
import { Model } from './model.js'
import {
  COUNT_UUID,
  CountProjection,
  MessageWire,
  ownedCountId,
} from './wire.js'

describe('Counter wire Schemas', () => {
  it('decodes a count row into the Model and encodes it back', () => {
    const model = S.decodeUnknownSync(CountProjection)({
      id: COUNT_UUID,
      value: 4,
      asOf: 'cli',
      at: 1,
    })
    expect(model).toEqual({
      product: Model.make({ count: 4 }),
      actionMenu: { _tag: 'Closed' },
    })
    expect(S.encodeUnknownSync(CountProjection)(model)).toEqual({
      id: COUNT_UUID,
      value: 4,
      asOf: '',
      at: 0,
    })
  })

  it('round-trips occupancy on a count row', () => {
    const model = S.decodeUnknownSync(CountProjection)({
      id: COUNT_UUID,
      value: 4,
      asOf: 'cli',
      at: 1,
      device: 'phone',
      path: 'counter.increment',
    })
    expect(model.product).toEqual(
      Model.make({
        count: 4,
        maybeDevice: Option.some('phone'),
        maybePath: Option.some('counter.increment'),
      }),
    )
    expect(S.encodeUnknownSync(CountProjection)(model)).toEqual({
      id: COUNT_UUID,
      value: 4,
      asOf: '',
      at: 0,
      device: 'phone',
      path: 'counter.increment',
    })
  })

  it('prints a UUID count row for an owned subject', () => {
    expect(ownedCountId('alice')).toMatch(
      /^c0a7c001-0000-4000-8000-[0-9a-f]{12}$/,
    )
    expect(ownedCountId('alice')).not.toBe(COUNT_UUID)
    expect(ownedCountId('alice')).toBe(ownedCountId('alice'))
    expect(ownedCountId('bob')).not.toBe(ownedCountId('alice'))
  })

  it('decodes a Message row into Increment', () => {
    const message = S.decodeUnknownSync(MessageWire)({
      id: 'm1',
      tag: 'Increment',
      from: 'react',
      createdAtMs: 1,
    })
    expect(message).toEqual(Increment())
    expect(S.encodeUnknownSync(MessageWire)(message)).toEqual({
      id: '',
      tag: 'Increment',
      from: '',
      createdAtMs: 0,
    })
  })

  it('round-trips OpenedNavigation on a Message row', () => {
    const message = OpenedNavigation({
      device: 'phone',
      path: 'counter.increment',
    })
    const encoded = S.encodeUnknownSync(MessageWire)(message)
    expect(encoded.tag).toBe(
      'OpenedNavigation:{"device":"phone","path":"counter.increment"}',
    )
    expect(S.decodeUnknownSync(MessageWire)(encoded)).toEqual(message)
  })
})
