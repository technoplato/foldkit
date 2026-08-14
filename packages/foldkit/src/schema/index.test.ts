import { Match as M, Option, Schema as S } from 'effect'
import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'

import { m, md, ts } from './index.js'

describe('m', () => {
  it('constructs a tag-only message without a payload', () => {
    const ClickedReset = m('ClickedReset')
    expect(ClickedReset()).toStrictEqual({ _tag: 'ClickedReset' })
  })

  it('constructs a legacy fields message unchanged', () => {
    const LegacyTick = m('LegacyTick', { at: S.Number })
    expect(LegacyTick({ at: 42 })).toStrictEqual({
      _tag: 'LegacyTick',
      at: 42,
    })
    expect('doc' in LegacyTick).toBe(false)
  })

  it('attaches what/why docs on the constructor without polluting wire values', () => {
    const RequestedIncrement = m('RequestedIncrement', {
      what: 'User asked to increment the counter',
      why: 'Primary write path from the + button',
    })

    const wire = RequestedIncrement()
    expect(wire).toStrictEqual({ _tag: 'RequestedIncrement' })
    expect(wire).not.toHaveProperty('what')
    expect(wire).not.toHaveProperty('why')
    expect(wire).not.toHaveProperty('doc')

    expect(RequestedIncrement.doc).toStrictEqual({
      what: 'User asked to increment the counter',
      why: 'Primary write path from the + button',
    })
    expect('doc' in RequestedIncrement).toBe(true)
  })

  it('supports fields + docs via the options bag', () => {
    const LoadedCounter = m('LoadedCounter', {
      fields: { maybeCounter: S.Option(S.Number) },
      what: 'Persisted counter loaded from storage',
      why: 'Hydrate model after boot',
    })

    const wire = LoadedCounter({ maybeCounter: Option.some(7) })
    expect(wire).toStrictEqual({
      _tag: 'LoadedCounter',
      maybeCounter: Option.some(7),
    })
    expect(wire).not.toHaveProperty('what')
    expect(wire).not.toHaveProperty('why')
    expect(wire).not.toHaveProperty('doc')
    expect(wire).not.toHaveProperty('fields')

    expect(LoadedCounter.doc).toStrictEqual({
      what: 'Persisted counter loaded from storage',
      why: 'Hydrate model after boot',
    })
  })

  it('does not treat Schema-valued what/why keys as doc options', () => {
    // Hypothetical message whose payload fields are literally named what/why.
    const Annotated = m('Annotated', { what: S.String, why: S.String })
    const wire = Annotated({ what: 'payload-what', why: 'payload-why' })
    expect(wire).toStrictEqual({
      _tag: 'Annotated',
      what: 'payload-what',
      why: 'payload-why',
    })
    expect('doc' in Annotated).toBe(false)
  })

  it('keeps Schema identity usable for decode/encode', () => {
    const ChangedCount = m('ChangedCount', {
      fields: { count: S.Number },
      what: 'Count changed',
      why: 'Sync UI after external write',
    })
    const encoded = S.encodeSync(ChangedCount)(ChangedCount({ count: 3 }))
    expect(encoded).toStrictEqual({ _tag: 'ChangedCount', count: 3 })
    expect(S.decodeSync(ChangedCount)(encoded)).toStrictEqual({
      _tag: 'ChangedCount',
      count: 3,
    })
  })

  it('works with Union + Match.update-style exhaustiveness', () => {
    const RequestedIncrement = m('RequestedIncrement', {
      what: 'User asked to increment',
      why: 'Plus button',
    })
    const RequestedDecrement = m('RequestedDecrement', {
      what: 'User asked to decrement',
      why: 'Minus button',
    })
    const LoadedCounter = m('LoadedCounter', {
      fields: { maybeCounter: S.Option(S.Number) },
      what: 'Counter loaded',
      why: 'Boot hydration',
    })

    const Message = S.Union([
      RequestedIncrement,
      RequestedDecrement,
      LoadedCounter,
    ])
    type Message = typeof Message.Type

    const update = (count: number, message: Message): number =>
      M.value(message).pipe(
        M.tagsExhaustive({
          RequestedIncrement: () => count + 1,
          RequestedDecrement: () => count - 1,
          LoadedCounter: ({ maybeCounter }) =>
            Option.getOrElse(maybeCounter, () => count),
        }),
      )

    expect(update(0, RequestedIncrement())).toBe(1)
    expect(update(5, RequestedDecrement())).toBe(4)
    expect(update(1, LoadedCounter({ maybeCounter: Option.some(9) }))).toBe(9)
    expect(update(1, LoadedCounter({ maybeCounter: Option.none() }))).toBe(1)

    // Docs remain on constructors, not on matched wire values.
    expect(RequestedIncrement.doc.what).toContain('increment')
    expect(RequestedDecrement.doc.why).toContain('Minus')
    expect(LoadedCounter.doc.what).toContain('loaded')
  })

  it('types .doc only when options include what/why', () => {
    const WithDoc = m('WithDoc', { what: 'w', why: 'y' })
    const WithoutDoc = m('WithoutDoc')
    expectTypeOf(WithDoc.doc).toEqualTypeOf<{
      readonly what: string
      readonly why: string
    }>()
    // @ts-expect-error - no doc without options
    void WithoutDoc.doc
  })
})

describe('md', () => {
  it('hangs keys and valid on the constructor without polluting wire values', () => {
    const Model = S.Struct({ count: S.Number })
    type Model = typeof Model.Type

    const Reset = md('Reset', {
      what: 'Sets the count to 0',
      why: 'Triggered when the user indicates a desire to reset the count',
      keys: ['r'],
      tokens: ['reset'],
      spoken: ['reset'],
      command: 'reset',
      event: 'reset',
      mutate: 'count = 0',
      sideEffects: '(none)',
      valid: (model: Model) => model.count !== 0,
      hiddenBecause: (model: Model) =>
        model.count === 0 ? 'count is already 0' : undefined,
    })

    const wire = Reset()
    expect(wire).toStrictEqual({ _tag: 'Reset' })
    expect(wire).not.toHaveProperty('keys')
    expect(wire).not.toHaveProperty('valid')
    expect(wire).not.toHaveProperty('hiddenBecause')

    expect(Reset.doc).toStrictEqual({
      what: 'Sets the count to 0',
      why: 'Triggered when the user indicates a desire to reset the count',
    })
    expect(Reset.keys).toEqual(['r'])
    expect(Reset.tokens).toEqual(['reset'])
    expect(Reset.spoken).toEqual(['reset'])
    expect(Reset.command).toBe('reset')
    expect(Reset.event).toBe('reset')
    expect(Reset.mutate).toBe('count = 0')
    expect(Reset.sideEffects).toBe('(none)')
    expect(Reset.valid({ count: 0 }, {})).toBe(false)
    expect(Reset.valid({ count: 1 }, {})).toBe(true)
    expect(Reset.hiddenBecause?.({ count: 0 })).toBe('count is already 0')
    expect(Reset.hiddenBecause?.({ count: 1 })).toBeUndefined()
  })

  it('defaults valid to true when the options omit it', () => {
    const Increment = md('Increment', {
      what: 'Increments the count by one',
      why: 'Triggered when the user indicates a desire to increment the count',
    })
    expect(Increment.valid({ count: 0 }, {})).toBe(true)
    expect('keys' in Increment).toBe(false)
  })

  it('requires what/why and exposes .doc', () => {
    const RequestedIncrement = md('RequestedIncrement', {
      what: 'User asked to increment the counter',
      why: 'Primary write path from the + button',
    })
    expect(RequestedIncrement()).toStrictEqual({ _tag: 'RequestedIncrement' })
    expect(RequestedIncrement.doc.what).toBe(
      'User asked to increment the counter',
    )
  })

  it('supports required docs with fields', () => {
    const LoadedCounter = md('LoadedCounter', {
      fields: { maybeCounter: S.Option(S.Number) },
      what: 'Persisted counter loaded',
      why: 'Hydrate model after boot',
    })
    expect(LoadedCounter({ maybeCounter: Option.none() })).toStrictEqual({
      _tag: 'LoadedCounter',
      maybeCounter: Option.none(),
    })
    expect(LoadedCounter.doc.why).toContain('Hydrate')
  })
})

describe('ts / r remain callable without docs API', () => {
  it('ts still constructs tagged structs', () => {
    const Loading = ts('Loading')
    expect(Loading()).toStrictEqual({ _tag: 'Loading' })
    expect('doc' in Loading).toBe(false)
  })
})
