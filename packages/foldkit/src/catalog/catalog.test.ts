import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from './catalog.js'

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+', '='] },
})

const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'The person wants to start over',
  enabled: (model: Model) =>
    model.count === 0
      ? Catalog.Disabled({ because: 'count is already 0' })
      : Catalog.Enabled(),
  meta: { label: 'Reset', keys: ['r'] },
})

const SetCount = Catalog.action('SetCount', {
  what: 'Sets the count to a chosen number',
  why: 'The person typed a number',
  fields: { count: S.Number },
  meta: { label: 'Set', keys: [] },
})

const catalog = Catalog.make([Increment, Reset, SetCount])

describe('Catalog.action', () => {
  it('builds the Message and keeps wire values to the tag and fields', () => {
    expect(Increment()).toEqual({ _tag: 'Increment' })
    expect(Object.keys(Increment())).toEqual(['_tag'])
    expect(SetCount({ count: 4 })).toEqual({ _tag: 'SetCount', count: 4 })
  })

  it('exposes its declaration on the constructor', () => {
    expect(Increment.tag).toBe('Increment')
    expect(Increment.what).toBe('Increments the count by one')
    expect(Increment.meta).toEqual({ label: '+', keys: ['+', '='] })
    expect(Increment.isPayloadFree).toBe(true)
    expect(SetCount.isPayloadFree).toBe(false)
  })

  it('defaults enabled to Enabled', () => {
    expect(Increment.enabled({ count: 0 })).toEqual(Catalog.Enabled())
  })

  it('decodes known tags and rejects unknown ones through the union', () => {
    expect(S.decodeUnknownSync(catalog.Message)({ _tag: 'Reset' })).toEqual({
      _tag: 'Reset',
    })
    expect(() =>
      S.decodeUnknownSync(catalog.Message)({ _tag: 'Explode' }),
    ).toThrow()
  })
})

describe('Catalog.entries', () => {
  it('projects availability with the disabled sentence', () => {
    const [increment, reset] = Catalog.entries(catalog, { count: 0 })
    expect(increment).toEqual({
      tag: 'Increment',
      what: 'Increments the count by one',
      why: 'The person wants a higher count',
      label: '+',
      keys: ['+', '='],
      availability: Catalog.Enabled(),
      isPayloadFree: true,
    })
    expect(reset?.availability).toEqual(
      Catalog.Disabled({ because: 'count is already 0' }),
    )
  })

  it('enables Reset once the count moves', () => {
    const entries = Catalog.entries(catalog, { count: 3 })
    expect(entries.map(entry => entry.availability._tag)).toEqual([
      'Enabled',
      'Enabled',
      'Enabled',
    ])
  })
})

describe('Catalog lookups', () => {
  it('finds by tag, key, and derived command', () => {
    expect(
      Option.map(Catalog.find(catalog, 'Reset'), found => found.tag),
    ).toEqual(Option.some('Reset'))
    expect(
      Option.map(Catalog.findByKey(catalog, '='), found => found.tag),
    ).toEqual(Option.some('Increment'))
    expect(
      Option.map(
        Catalog.findByCommand(catalog, 'set-count'),
        found => found.tag,
      ),
    ).toEqual(Option.some('SetCount'))
    expect(Catalog.find(catalog, 'Missing')).toEqual(Option.none())
  })

  it('derives kebab-case commands from tags', () => {
    expect(Catalog.commandOf('Increment')).toBe('increment')
    expect(Catalog.commandOf('SetCount')).toBe('set-count')
  })
})

describe('Catalog.messageFor', () => {
  it('builds Enabled payload-free Messages only', () => {
    expect(Catalog.messageFor(catalog, { count: 3 }, 'Reset')).toEqual(
      Option.some({ _tag: 'Reset' }),
    )
    expect(Catalog.messageFor(catalog, { count: 0 }, 'Reset')).toEqual(
      Option.none(),
    )
    expect(Catalog.messageFor(catalog, { count: 0 }, 'SetCount')).toEqual(
      Option.none(),
    )
    expect(Catalog.messageFor(catalog, { count: 0 }, 'Missing')).toEqual(
      Option.none(),
    )
  })
})
