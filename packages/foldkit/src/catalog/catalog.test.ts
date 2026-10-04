import { Array, Option, Schema as S } from 'effect'
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
      title: 'Increment',
      what: 'Increments the count by one',
      why: 'The person wants a higher count',
      label: '+',
      keys: ['+', '='],
      availability: Catalog.Enabled(),
      isPayloadFree: true,
      maybeChoices: Option.none(),
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

const ListModel = S.Struct({
  counters: S.Array(S.Struct({ id: S.Int, count: S.Number })),
  maybeShown: S.Option(S.Int),
})
type ListModel = typeof ListModel.Type

const ResetCounter = Catalog.action('ResetCounter', {
  fields: { id: S.Int },
  choose: {
    field: 'id',
    prompt: 'Which counter?',
    token: S.FiniteFromString.pipe(S.decodeTo(S.Int)),
    choicesOf: (model: ListModel) =>
      model.counters.map(counter => ({
        value: counter.id,
        title: `Counter ${counter.id.toString()}`,
        ...(counter.count === 0
          ? {
              availability: Catalog.Disabled({ because: 'count is already 0' }),
            }
          : {}),
      })),
    preferredOf: (model: ListModel) => model.maybeShown,
    nothingToChoose: 'there are no counters yet',
  },
  what: 'Sets one count to 0',
  why: 'The person wants to start that counter over',
  meta: { label: 'Reset', keys: ['r'] },
})
const listCatalog = Catalog.make([ResetCounter])

const listAt = (
  counts: ReadonlyArray<number>,
  maybeShown: Option.Option<number> = Option.none(),
): ListModel => ({
  counters: counts.map((count, index) => ({ id: index + 1, count })),
  maybeShown,
})

const resetEntryOf = (model: ListModel) =>
  Option.getOrThrow(Array.head(Catalog.entries(listCatalog, model)))

describe('choosing Actions', () => {
  it('is one entry that offers each choice with its own availability', () => {
    const entry = resetEntryOf(listAt([0, 3]))
    expect(entry.title).toBe('Reset counter')
    expect(entry.availability).toEqual(Catalog.Enabled())
    expect(entry.keys).toEqual([])
    expect(Option.map(entry.maybeChoices, choices => choices.choices)).toEqual(
      Option.some([
        {
          token: '1',
          title: 'Counter 1',
          maybeDetail: Option.none(),
          availability: Catalog.Disabled({ because: 'count is already 0' }),
        },
        {
          token: '2',
          title: 'Counter 2',
          maybeDetail: Option.none(),
          availability: Catalog.Enabled(),
        },
      ]),
    )
  })

  it('says why when no choice is offered, or there is nothing to choose', () => {
    expect(resetEntryOf(listAt([0, 0])).availability).toEqual(
      Catalog.Disabled({ because: 'count is already 0' }),
    )
    expect(resetEntryOf(listAt([])).availability).toEqual(
      Catalog.Disabled({ because: 'there are no counters yet' }),
    )
  })

  it('builds the Message from a choice tag, refusing a Disabled choice', () => {
    const model = listAt([0, 3])
    expect(Catalog.messageFor(listCatalog, model, 'ResetCounter:2')).toEqual(
      Option.some(ResetCounter({ id: 2 })),
    )
    expect(Catalog.messageFor(listCatalog, model, 'ResetCounter:1')).toEqual(
      Option.none(),
    )
    expect(Catalog.messageFor(listCatalog, model, 'ResetCounter:9')).toEqual(
      Option.none(),
    )
  })

  it('takes the preferred choice for a bare tag, and only then shows its keys', () => {
    const onCounter2 = listAt([0, 3], Option.some(2))
    expect(Catalog.messageFor(listCatalog, onCounter2, 'ResetCounter')).toEqual(
      Option.some(ResetCounter({ id: 2 })),
    )
    expect(resetEntryOf(onCounter2).keys).toEqual(['r'])
    expect(
      Catalog.messageFor(listCatalog, listAt([0, 3]), 'ResetCounter'),
    ).toEqual(Option.none())
  })

  it('projects the choices as menu rows and one choice as buttons', () => {
    const entry = resetEntryOf(listAt([0, 3], Option.some(2)))
    expect(
      Catalog.choicesAsEntries(entry).map(choice => [choice.tag, choice.title]),
    ).toEqual([
      ['ResetCounter:1', 'Counter 1'],
      ['ResetCounter:2', 'Counter 2'],
    ])
    const [forCounter2] = Catalog.entriesFor([entry], '2')
    expect(forCounter2?.tag).toBe('ResetCounter:2')
    expect(forCounter2?.label).toBe('Reset')
    expect(forCounter2?.keys).toEqual(['r'])
  })

  it('reads a choice tag back and words it for the CLI', () => {
    expect(Catalog.parseChoiceTag('ResetCounter:2')).toEqual(
      Option.some({ tag: 'ResetCounter', token: '2' }),
    )
    expect(Catalog.parseChoiceTag('ResetCounter')).toEqual(Option.none())
    expect(Catalog.commandOf('ResetCounter:2')).toBe('reset-counter 2')
  })
})

const PlaceMs = S.Int.check(S.isGreaterThanOrEqualTo(0))
const PlaceMsToken = S.NumberFromString.pipe(S.decodeTo(PlaceMs))

const Player = S.Struct({ placeMs: S.Number, durationMs: S.Number })
type Player = typeof Player.Type

const SeekTo = Catalog.action('SeekTo', {
  fields: { placeMs: PlaceMs },
  choose: {
    field: 'placeMs',
    prompt: 'Where to?',
    token: PlaceMsToken,
    choicesOf: (player: Player) => [
      { value: 0, title: 'The start' },
      { value: player.durationMs / 2, title: 'Halfway' },
    ],
    accepts: (player: Player, placeMs: number) =>
      placeMs <= player.durationMs
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'that is past the end' }),
    nothingToChoose: 'there is nothing to seek',
  },
  what: 'Moves the player to a place',
  why: 'The person wants to hear another part',
  meta: { label: 'Seek', keys: [] },
})

const Rewind = Catalog.action('Rewind', {
  what: 'Moves the player to the start',
  why: 'The person wants to hear it again',
  enabled: (player: Player) =>
    player.placeMs === 0
      ? Catalog.Disabled({ because: 'it is at the start' })
      : Catalog.Enabled(),
  meta: { label: 'Rewind', keys: ['w'] },
})

const playerCatalog = Catalog.make([Rewind, SeekTo])

describe('open choices', () => {
  const player: Player = { placeMs: 5_000, durationMs: 60_000 }

  it('takes a value no choice lists, while the rule allows it', () => {
    expect(Catalog.messageFor(playerCatalog, player, 'SeekTo:42000')).toEqual(
      Option.some(SeekTo({ placeMs: 42_000 })),
    )
    expect(Catalog.messageFor(playerCatalog, player, 'SeekTo:30000')).toEqual(
      Option.some(SeekTo({ placeMs: 30_000 })),
    )
    expect(Catalog.messageFor(playerCatalog, player, 'SeekTo:90000')).toEqual(
      Option.none(),
    )
    expect(Catalog.messageFor(playerCatalog, player, 'SeekTo:soon')).toEqual(
      Option.none(),
    )
  })

  it('is Enabled with no choices listed, and says it is open', () => {
    const [, seekEntry] = Catalog.entries(playerCatalog, player)
    expect(seekEntry?.availability).toEqual(Catalog.Enabled())
    expect(
      Option.map(seekEntry?.maybeChoices ?? Option.none(), choices => [
        choices.isOpen,
        choices.choices.length,
      ]),
    ).toEqual(Option.some([true, 2]))
  })
})

type Library = Readonly<{ maybePlayer: Option.Option<Player> }>

const playerActions = Catalog.within(playerCatalog, {
  childOf: (library: Library) => library.maybePlayer,
  nothing: 'nothing is in the player',
})

const libraryCatalog = Catalog.make(playerActions.actions)

describe('Catalog.within', () => {
  const loaded: Library = {
    maybePlayer: Option.some({ placeMs: 5_000, durationMs: 60_000 }),
  }
  const idle: Library = { maybePlayer: Option.none() }

  it('offers the child Actions with their tags, keys, rules, and choices', () => {
    expect(
      Catalog.entries(libraryCatalog, loaded).map(entry => [
        entry.tag,
        entry.keys,
        entry.availability._tag,
      ]),
    ).toEqual([
      ['Rewind', ['w'], 'Enabled'],
      ['SeekTo', [], 'Enabled'],
    ])
    expect(Catalog.messageFor(libraryCatalog, loaded, 'SeekTo:42000')).toEqual(
      Option.some(SeekTo({ placeMs: 42_000 })),
    )
    expect(
      Catalog.messageFor(
        libraryCatalog,
        { maybePlayer: Option.some({ placeMs: 0, durationMs: 60_000 }) },
        'Rewind',
      ),
    ).toEqual(Option.none())
  })

  it('says nothing is there while there is no child, and sends nothing', () => {
    expect(
      Catalog.entries(libraryCatalog, idle).map(entry => entry.availability),
    ).toEqual([
      Catalog.Disabled({ because: 'nothing is in the player' }),
      Catalog.Disabled({ because: 'nothing is in the player' }),
    ])
    expect(Catalog.messageFor(libraryCatalog, idle, 'SeekTo:42000')).toEqual(
      Option.none(),
    )
  })

  it('reads a parent Message back as the child’s own', () => {
    expect(playerActions.childOf(SeekTo({ placeMs: 1_000 }))).toEqual(
      Option.some(SeekTo({ placeMs: 1_000 })),
    )
    expect(playerActions.childOf({ _tag: 'Open' })).toEqual(Option.none())
  })
})
