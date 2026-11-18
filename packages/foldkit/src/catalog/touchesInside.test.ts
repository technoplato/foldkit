import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as ModelPath from '../declaration/modelPath.js'
import * as Catalog from './catalog.js'

// A shelf that may hold one counter and keeps a list of tallies, so state
// sits inside an Option and inside a list.

const Counter = S.Struct({ count: S.Number, step: S.Number })

const Tally = S.Struct({ name: S.String, count: S.Number })

const Model = S.Struct({
  maybeCounter: S.Option(Counter),
  tallies: S.Array(Tally),
  note: S.String,
})
type Model = typeof Model.Type

const at = ModelPath.of(Model)

const Word = S.String

const Increment = Catalog.action('Increment', {
  what: 'Raises the count by one step',
  why: 'To count on',
  mutates: [at.maybeCounter.count],
  meta: { label: '+', keys: ['+'] },
})

const CountEveryTally = Catalog.action('CountEveryTally', {
  what: 'Raises every tally by one',
  why: 'To count one more of each',
  mutates: [at.tallies.count],
  meta: { label: 'All +1', keys: [] },
})

const WriteNote = Catalog.action('WriteNote', {
  fields: { note: Word },
  choose: {
    field: 'note',
    prompt: 'What should the note say?',
    token: Word,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'type the note',
  },
  what: 'Writes the note on the shelf',
  why: 'To remember what the shelf is for',
  mutates: [at.note],
  meta: { label: 'Note', keys: [] },
})

const catalog = Catalog.make([Increment, CountEveryTally, WriteNote])

type Message = typeof catalog.Message.Type

type Return = readonly [Model, ReadonlyArray<Readonly<{ name: string }>>]

const counted = (model: Model): Model => ({
  ...model,
  maybeCounter: Option.map(model.maybeCounter, counter => ({
    ...counter,
    count: counter.count + counter.step,
  })),
})

const update = (model: Model, message: Message): Return => {
  if (message._tag === 'Increment') {
    return [counted(model), []]
  } else if (message._tag === 'CountEveryTally') {
    return [
      {
        ...model,
        tallies: Array.map(model.tallies, tally => ({
          ...tally,
          count: tally.count + 1,
        })),
      },
      [],
    ]
  } else {
    return [{ ...model, note: message.note }, []]
  }
}

const withCounter: Model = {
  maybeCounter: Option.some({ count: 1, step: 2 }),
  tallies: [
    { name: 'Crows', count: 3 },
    { name: 'Wrens', count: 0 },
  ],
  note: '',
}

const models: ReadonlyArray<Model> = [withCounter]

const notes: ReadonlyArray<Message> = [WriteNote({ note: 'Birds' })]

describe('ModelPath.of', () => {
  it('names a field inside an Option as the field of what it holds', () => {
    expect(ModelPath.segmentsOf(at.maybeCounter.count)).toEqual([
      'maybeCounter',
      'count',
    ])
  })

  it('names a field inside a list as that field of every row', () => {
    expect(ModelPath.segmentsOf(at.tallies.count)).toEqual(['tallies', 'count'])
    // @ts-expect-error a tally has no `total`
    expect(ModelPath.segmentsOf(at.tallies.total)).toEqual(['tallies', 'total'])
  })
})

describe('ModelPath.of, at a state that is one of several', () => {
  const Search = S.Union([
    S.TaggedStruct('Idle', {}),
    S.TaggedStruct('Found', { total: S.Number, selected: S.Number }),
  ])
  const Finder = S.Struct({ maybeSearch: S.Option(Search) })
  const inFinder = ModelPath.of(Finder)

  it('names a field only one of them has', () => {
    expect(ModelPath.segmentsOf(inFinder.maybeSearch.selected)).toEqual([
      'maybeSearch',
      'selected',
    ])
    // @ts-expect-error none of them has `chosen`
    expect(ModelPath.segmentsOf(inFinder.maybeSearch.chosen)).toEqual([
      'maybeSearch',
      'chosen',
    ])
  })

  it('is held to that field: becoming another of them is a change of the whole', () => {
    type Finder = typeof Finder.Type
    const SelectNext = Catalog.action('SelectNext', {
      what: 'Selects the next place found',
      why: 'To look at one place among those found',
      mutates: [inFinder.maybeSearch.selected],
      meta: { label: 'Next', keys: ['n'] },
    })
    const finderCatalog = Catalog.make([SelectNext])
    const found: Finder = {
      maybeSearch: Option.some({ _tag: 'Found', total: 3, selected: 0 }),
    }
    expect(
      Catalog.undeclaredTouches(
        finderCatalog,
        (): readonly [Finder, ReadonlyArray<never>] => [
          {
            maybeSearch: Option.some({ _tag: 'Found', total: 3, selected: 1 }),
          },
          [],
        ],
        [found],
      ),
    ).toEqual([])
    expect(
      Catalog.undeclaredTouches(
        finderCatalog,
        (): readonly [Finder, ReadonlyArray<never>] => [
          { maybeSearch: Option.some({ _tag: 'Idle' }) },
          [],
        ],
        [found],
      ),
    ).toEqual([
      'SelectNext changed maybeSearch._tag, which it does not say it mutates.',
      'SelectNext changed maybeSearch.total, which it does not say it mutates.',
    ])
  })
})

describe('Catalog.undeclaredTouches, inside an Option and a list', () => {
  it('finds nothing when update changes only the field named inside', () => {
    expect(Catalog.undeclaredTouches(catalog, update, models, notes)).toEqual(
      [],
    )
  })

  it('says when update changes another field of what an Option holds', () => {
    const careless = (model: Model, message: Message): Return =>
      message._tag === 'Increment'
        ? [
            {
              ...model,
              maybeCounter: Option.map(model.maybeCounter, counter => ({
                count: counter.count + counter.step,
                step: counter.step + 1,
              })),
            },
            [],
          ]
        : update(model, message)
    expect(Catalog.undeclaredTouches(catalog, careless, models)).toEqual([
      'Increment changed maybeCounter.step, which it does not say it mutates.',
    ])
  })

  it('says when update empties an Option an Action only said it mutates inside', () => {
    const emptying = (model: Model, message: Message): Return =>
      message._tag === 'Increment'
        ? [{ ...model, maybeCounter: Option.none() }, []]
        : update(model, message)
    expect(Catalog.undeclaredTouches(catalog, emptying, models)).toEqual([
      'Increment changed maybeCounter, which it does not say it mutates.',
    ])
  })

  it('says when update changes another field of a row', () => {
    const renaming = (model: Model, message: Message): Return =>
      message._tag === 'CountEveryTally'
        ? [
            {
              ...model,
              tallies: Array.map(model.tallies, tally => ({
                name: `${tally.name}!`,
                count: tally.count + 1,
              })),
            },
            [],
          ]
        : update(model, message)
    expect(Catalog.undeclaredTouches(catalog, renaming, models)).toEqual([
      'CountEveryTally changed tallies.name, which it does not say it mutates.',
    ])
  })

  it('says when update adds a row to a list an Action only said it mutates inside', () => {
    const adding = (model: Model, message: Message): Return =>
      message._tag === 'CountEveryTally'
        ? [
            {
              ...model,
              tallies: [...model.tallies, { name: 'Owls', count: 1 }],
            },
            [],
          ]
        : update(model, message)
    expect(Catalog.undeclaredTouches(catalog, adding, models)).toEqual([
      'CountEveryTally changed tallies, which it does not say it mutates.',
    ])
  })
})

describe('Catalog.undeclaredTouches, with Messages no menu offers', () => {
  it('sends them too, so an Action that takes typed words is held to what it says', () => {
    const careless = (model: Model, message: Message): Return =>
      message._tag === 'WriteNote'
        ? [{ ...counted(model), note: message.note }, []]
        : update(model, message)
    expect(Catalog.undeclaredTouches(catalog, careless, models)).toEqual([])
    expect(Catalog.undeclaredTouches(catalog, careless, models, notes)).toEqual(
      [
        'WriteNote changed maybeCounter.count, which it does not say it mutates.',
      ],
    )
  })

  it('reads an update that also answers its parent, as a Submodel’s does', () => {
    const withOutMessage = (
      model: Model,
      message: Message,
    ): readonly [
      Model,
      ReadonlyArray<Readonly<{ name: string }>>,
      Option.Option<string>,
    ] => [...update(model, message), Option.some('Counted')]
    expect(
      Catalog.undeclaredTouches(catalog, withOutMessage, models, notes),
    ).toEqual([])
  })
})

describe('Catalog.unseenTouches', () => {
  it('finds nothing when the samples show every touch an Action says', () => {
    expect(Catalog.unseenTouches(catalog, update, models, notes)).toEqual([])
  })

  it('says when no sample shows state an Action says it mutates', () => {
    const idle = (model: Model, message: Message): Return =>
      message._tag === 'Increment' ? [model, []] : update(model, message)
    expect(Catalog.unseenTouches(catalog, idle, models, notes)).toEqual([
      'Increment says it mutates maybeCounter.count, and no sample showed it.',
    ])
  })

  it('says when no sample sends an Action that says what it touches', () => {
    expect(Catalog.unseenTouches(catalog, update, models)).toEqual([
      'WriteNote says it mutates note, and no sample showed it.',
    ])
  })

  it('says when no sample shows a Command an Action says it triggers', () => {
    const Ring = Catalog.action('Ring', {
      what: 'Rings the bell on the shelf',
      why: 'To call someone over',
      triggers: [{ name: 'RingBell' }],
      meta: { label: 'Ring', keys: [] },
    })
    const ringCatalog = Catalog.make([Ring])
    expect(
      Catalog.unseenTouches(
        ringCatalog,
        (model: Model): Return => [model, []],
        models,
      ),
    ).toEqual(['Ring says it triggers RingBell, and no sample showed it.'])
  })

  it('counts a change inside the state an Action named as a whole', () => {
    const Clear = Catalog.action('Clear', {
      what: 'Takes the counter off the shelf',
      why: 'To stop counting',
      mutates: [at.maybeCounter],
      meta: { label: 'Clear', keys: [] },
    })
    expect(
      Catalog.unseenTouches(
        Catalog.make([Clear]),
        (model: Model): Return => [counted(model), []],
        models,
      ),
    ).toEqual([])
  })
})
