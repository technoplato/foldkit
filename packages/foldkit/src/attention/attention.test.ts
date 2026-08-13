import { Schema as S } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { ts } from '../schema/index.js'
import * as Attention from './attention.js'

const Sign = ts('Welcome', { body: S.String })
const Tool = ts('Keypad', { digits: S.String })

const AttentionSchema = Attention.Schema(Sign, Tool)
type State = Attention.Attention<typeof Sign.Type, typeof Tool.Type>

const roaming: State = Attention.Roaming()
const reading: State = Attention.Reading({
  subject: Sign({ body: 'hello' }),
})
const operating: State = Attention.Operating({
  tool: Tool({ digits: '1428' }),
})

describe('constructors', () => {
  it('build exclusive tagged values', () => {
    expect(roaming).toEqual({ _tag: 'Roaming' })
    expect(reading).toEqual({
      _tag: 'Reading',
      subject: { _tag: 'Welcome', body: 'hello' },
    })
    expect(operating).toEqual({
      _tag: 'Operating',
      tool: { _tag: 'Keypad', digits: '1428' },
    })
  })

  it('cannot represent roaming and reading together', () => {
    expectTypeOf(roaming).toHaveProperty('_tag')
    expect(Attention.isRoaming(reading)).toBe(false)
    expect(Attention.isReading(roaming)).toBe(false)
    expect(Attention.isOperating(reading)).toBe(false)
  })
})

describe('Schema', () => {
  it('round-trips each variant', () => {
    const encodedReading = S.encodeSync(AttentionSchema.schema)(reading)
    expect(encodedReading).toEqual({
      _tag: 'Reading',
      subject: { _tag: 'Welcome', body: 'hello' },
    })
    expect(S.decodeSync(AttentionSchema.schema)(encodedReading)).toEqual(
      reading,
    )
  })

  it('rejects an overlay boolean bag', () => {
    const decoded = S.decodeUnknownExit(AttentionSchema.schema)({
      isRoaming: true,
      isReading: true,
    })
    expect(decoded._tag).toBe('Failure')
  })
})

describe('match and dismiss', () => {
  it('matches every tag', () => {
    expect(
      Attention.match(roaming, {
        onRoaming: () => 'walk',
        onReading: subject => subject.body,
        onOperating: tool => tool.digits,
      }),
    ).toBe('walk')
    expect(
      Attention.match(reading, {
        onRoaming: () => 'walk',
        onReading: subject => subject.body,
        onOperating: tool => tool.digits,
      }),
    ).toBe('hello')
    expect(
      Attention.match(operating, {
        onRoaming: () => 'walk',
        onReading: subject => subject.body,
        onOperating: tool => tool.digits,
      }),
    ).toBe('1428')
  })

  it('dismisses every attention to roaming', () => {
    expect(Attention.dismiss(reading)).toEqual(Attention.Roaming())
    expect(Attention.dismiss(operating)).toEqual(Attention.Roaming())
    expect(Attention.dismiss(roaming)).toEqual(Attention.Roaming())
  })

  it('recognizes attention values', () => {
    expect(Attention.isAttention(roaming)).toBe(true)
    expect(Attention.isAttention({ _tag: 'Idle' })).toBe(false)
  })
})
