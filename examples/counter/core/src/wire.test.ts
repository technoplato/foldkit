import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { Increment } from './message.js'
import { Model } from './model.js'
import { COUNT_UUID, CountProjection, MessageWire } from './wire.js'

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
})
