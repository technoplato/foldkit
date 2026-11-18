import { Effect, Match as M, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Command from '../command/public.js'
import { described, observablesOf } from '../declaration/declare.js'
import * as ModelPath from '../declaration/modelPath.js'
import { toolOf } from '../declaration/tool.js'
import { m } from '../schema/index.js'
import * as Catalog from './catalog.js'

// The smallest Program that mutates state and triggers a side effect: a
// count, whether the user marked it a favourite, and whether it is prime.

const Model = S.Struct({
  count: S.Number.annotate(
    described({
      what: 'The count',
      why: 'It is what the user is counting',
    }),
  ),
  isFavorite: S.Boolean.annotate(
    described({
      what: 'Whether the user marked this count a favourite',
      why: 'To find it again',
    }),
  ),
  primeAnswer: S.Literals(['Unasked', 'Asking', 'Prime', 'NotPrime']),
})
type Model = typeof Model.Type

const at = ModelPath.of(Model)

const GotPrimeAnswer = m('GotPrimeAnswer', { isPrime: S.Boolean })

const AskWhetherPrime = Command.define(
  'AskWhetherPrime',
  { count: S.Number },
  GotPrimeAnswer,
)(({ count }) => Effect.succeed(GotPrimeAnswer({ isPrime: count === 7 })))

const Increment = Catalog.action('Increment', {
  what: 'Raises the count by one',
  why: 'To count one more',
  mutates: [at.count],
  meta: { label: '+', keys: ['+'] },
})

const ToggleFavorite = Catalog.action('ToggleFavorite', {
  what: 'Marks the count a favourite, or takes the mark away',
  why: 'To find this count again',
  mutates: [at.isFavorite],
  meta: { label: 'Favourite', keys: ['f'] },
})

const CheckPrime = Catalog.action('CheckPrime', {
  what: 'Asks whether the count is a prime number',
  why: 'To learn something about the number the user reached',
  mutates: [at.primeAnswer],
  triggers: [AskWhetherPrime],
  meta: { label: 'Is it prime?', keys: ['p'] },
})

const catalog = Catalog.make([Increment, ToggleFavorite, CheckPrime])

type Message = typeof catalog.Message.Type

const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Readonly<{ name: string }>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Readonly<{ name: string }>>]
    >(),
    M.tagsExhaustive({
      Increment: () => [{ ...model, count: model.count + 1 }, []],
      ToggleFavorite: () => [{ ...model, isFavorite: !model.isFavorite }, []],
      CheckPrime: () => [
        { ...model, primeAnswer: 'Asking' },
        [AskWhetherPrime({ count: model.count })],
      ],
    }),
  )

const models: ReadonlyArray<Model> = [
  { count: 0, isFavorite: false, primeAnswer: 'Unasked' },
  { count: 7, isFavorite: true, primeAnswer: 'Prime' },
]

describe('ModelPath.of', () => {
  it('names a field of the Model by a typed reference, not a string', () => {
    expect(ModelPath.segmentsOf(at.count)).toEqual(['count'])
    expect(ModelPath.segmentsOf(at.isFavorite)).toEqual(['isFavorite'])
    // @ts-expect-error the Model has no `total`
    expect(ModelPath.segmentsOf(at.total)).toEqual(['total'])
  })

  it('reaches into nested fields', () => {
    const Nested = S.Struct({ listening: S.Struct({ placeMs: S.Number }) })
    expect(
      ModelPath.segmentsOf(ModelPath.of(Nested).listening.placeMs),
    ).toEqual(['listening', 'placeMs'])
  })
})

describe('what an Action touches', () => {
  it('is what it says it mutates and triggers, as its declaration', () => {
    expect(Catalog.declarationOf(Increment).touches).toEqual({
      mutates: ['count'],
      triggers: [],
    })
    expect(Catalog.declarationOf(CheckPrime).touches).toEqual({
      mutates: ['primeAnswer'],
      triggers: ['AskWhetherPrime'],
    })
  })

  it('tells an agent looking from changing, and a side effect from none', () => {
    expect(
      toolOf(['Increment'], Catalog.declarationOf(Increment)).annotations,
    ).toEqual({ readOnlyHint: false, openWorldHint: false })
    expect(
      toolOf(['CheckPrime'], Catalog.declarationOf(CheckPrime)).annotations,
    ).toEqual({ readOnlyHint: false, openWorldHint: true })
  })

  it('is absent for an Action that has not said, so nothing is guessed', () => {
    const Reset = Catalog.action('Reset', {
      what: 'Sets the count to 0',
      why: 'To start over',
      meta: { label: 'Reset', keys: ['r'] },
    })
    expect(Catalog.declarationOf(Reset).touches).toBeUndefined()
  })
})

describe('Catalog.undeclaredTouches', () => {
  it('finds nothing when update does only what each Action says', () => {
    expect(Catalog.undeclaredTouches(catalog, update, models)).toEqual([])
  })

  it('says when update changes state an Action did not say it mutates', () => {
    const careless = (
      model: Model,
      message: Message,
    ): readonly [Model, ReadonlyArray<Readonly<{ name: string }>>] =>
      message._tag === 'Increment'
        ? [{ ...model, count: model.count + 1, isFavorite: false }, []]
        : update(model, message)
    expect(Catalog.undeclaredTouches(catalog, careless, models)).toEqual([
      'Increment changed isFavorite, which it does not say it mutates.',
    ])
  })

  it('says when update triggers what an Action did not say it triggers', () => {
    const eager = (
      model: Model,
      message: Message,
    ): readonly [Model, ReadonlyArray<Readonly<{ name: string }>>] =>
      message._tag === 'ToggleFavorite'
        ? [
            { ...model, isFavorite: !model.isFavorite },
            [AskWhetherPrime({ count: model.count })],
          ]
        : update(model, message)
    expect(Catalog.undeclaredTouches(catalog, eager, models)).toEqual([
      'ToggleFavorite triggered AskWhetherPrime, which it does not say it triggers.',
    ])
  })

  it('asks nothing of an Action that has not said what it touches', () => {
    const Reset = Catalog.action('Reset', {
      what: 'Sets the count to 0',
      why: 'To start over',
      meta: { label: 'Reset', keys: ['r'] },
    })
    const resetCatalog = Catalog.make([Reset])
    expect(
      Catalog.undeclaredTouches(
        resetCatalog,
        (model: Model) => [{ ...model, count: 0 }, []],
        models,
      ),
    ).toEqual([])
  })
})

describe('observablesOf', () => {
  it('lists the state a Model says what and why for, each by its path', () => {
    expect(observablesOf(Model)).toEqual([
      {
        path: ['count'],
        what: 'The count',
        why: 'It is what the user is counting',
      },
      {
        path: ['isFavorite'],
        what: 'Whether the user marked this count a favourite',
        why: 'To find it again',
      },
    ])
  })

  it('is the same state an Action says it mutates', () => {
    const observable = observablesOf(Model).map(({ path }) => path.join('.'))
    expect(observable).toContain(
      Catalog.declarationOf(Increment).touches?.mutates[0],
    )
  })
})
