import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  computed,
  described,
  observablesOf,
  undeclaredSources,
} from '../declaration/declare.js'
import * as ModelPath from '../declaration/modelPath.js'
import * as Catalog from './catalog.js'

const Counter = S.Struct({ count: S.Number, step: S.Number })
type Counter = typeof Counter.Type

const inCounter = ModelPath.of(Counter)

const Increment = Catalog.action('Increment', {
  what: 'Raises the count by one step',
  why: 'To count on',
  mutates: [inCounter.count],
  meta: { label: '+', keys: ['+'] },
})

const counterCatalog = Catalog.make([Increment])

const Shelf = S.Struct({
  title: S.String.annotate(
    described({ what: 'The name of the shelf', why: 'To tell shelves apart' }),
  ),
  maybeCounter: S.Option(Counter),
})
type Shelf = typeof Shelf.Type

const inShelf = ModelPath.of(Shelf)

describe('a child’s Actions offered by its parent', () => {
  it('mutate the child’s state under the place the parent keeps the child', () => {
    const offered = Catalog.within(counterCatalog, {
      childOf: (model: Shelf) => model.maybeCounter,
      under: inShelf.maybeCounter,
      nothing: 'there is no counter on this shelf',
    })
    expect(
      offered.actions.map(action => Catalog.declarationOf(action).touches),
    ).toEqual([{ mutates: ['maybeCounter.count'], triggers: [] }])
  })

  it('keep the child’s own paths when the parent does not say where it lives', () => {
    const offered = Catalog.within(counterCatalog, {
      childOf: (model: Shelf) => model.maybeCounter,
      nothing: 'there is no counter on this shelf',
    })
    expect(
      offered.actions.map(action => Catalog.declarationOf(action).touches),
    ).toEqual([{ mutates: ['count'], triggers: [] }])
  })
})

describe('a computed field', () => {
  const ahead = computed({
    what: 'The count one step on',
    why: 'To see where the count is heading',
    from: [inCounter.count, inCounter.step],
    read: (model: Counter) => model.count + model.step,
  })

  const models: ReadonlyArray<Counter> = [
    { count: 1, step: 1 },
    { count: 5, step: 2 },
  ]

  it('is listed with the stored state, by its name, with its what and why', () => {
    const Described = S.Struct({
      count: S.Number.annotate(
        described({ what: 'The count', why: 'It is what the user counts' }),
      ),
      step: S.Number,
    })
    expect(observablesOf(Described, { ahead })).toEqual([
      { path: ['count'], what: 'The count', why: 'It is what the user counts' },
      {
        path: ['ahead'],
        what: 'The count one step on',
        why: 'To see where the count is heading',
      },
    ])
  })

  it('reads the same while only other state changes', () => {
    expect(undeclaredSources({ ahead }, models)).toEqual([])
  })

  it('is caught reading state it does not say it is computed from', () => {
    const careless = computed({
      what: 'The count one step on',
      why: 'To see where the count is heading',
      from: [inCounter.count],
      read: (model: Counter) => model.count + model.step,
    })
    expect(undeclaredSources({ ahead: careless }, models)).toEqual([
      'ahead changed when only step changed, which it does not say it is computed from.',
    ])
  })

  it('may read through an Option the Model holds', () => {
    const shelfCount = computed({
      what: 'The count on this shelf, when it has a counter',
      why: 'To see the count without opening the counter',
      from: [inShelf.maybeCounter],
      read: (model: Shelf) =>
        Option.map(model.maybeCounter, counter => counter.count),
    })
    const shelves: ReadonlyArray<Shelf> = [
      { title: 'One', maybeCounter: Option.none() },
      { title: 'Two', maybeCounter: Option.some({ count: 3, step: 1 }) },
    ]
    expect(undeclaredSources({ shelfCount }, shelves)).toEqual([])
  })
})
