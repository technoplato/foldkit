import { Array, Effect, Layer, Option, Schema as S, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import type { ListItem, UiNode } from '../renderers/types.js'
import {
  Asking,
  BuiltIn,
  CodeStatus,
  CodeUpdates,
  CompletedRestartOnNewerCode,
  CouldNotAsk,
  CouldNotFetch,
  FailedRestartOnNewerCode,
  FellBack,
  Fetching,
  Found,
  type NewerCode,
  NoneNewer,
  NotAsked,
  ObservedCodeStatus,
  Ready,
  RestartOnNewerCode,
  RestartRefused,
  RestartToUpdate,
  type RunningCode,
  Update,
  catalog,
  isMessage,
  madeAtTextOf,
  noCodeUpdates,
  sectionOf,
  statusStream,
  update,
} from './codeUpdates.js'

const madeAtMs = Date.UTC(2026, 10, 20, 19, 37)

const anUpdate: RunningCode = Update({
  maybeUpdateId: Option.some('1a2b3c4d-0000-4000-8000-000000000000'),
  maybeRuntime: Option.some('runtime-1'),
  maybeMadeAtMs: Option.some(madeAtMs),
})

const builtIn: RunningCode = BuiltIn({
  maybeUpdateId: Option.some('built-in-id'),
  maybeRuntime: Option.some('runtime-1'),
  maybeMadeAtMs: Option.some(madeAtMs),
})

const newerId = '9f8e7d6c-0000-4000-8000-000000000000'

const ready: NewerCode = Ready({ maybeUpdateId: Option.some(newerId) })

const statusOf = (
  running: RunningCode,
  newer: NewerCode,
): Option.Option<CodeStatus> => Option.some({ running, newer })

const entriesOf = (
  maybeStatus: Option.Option<CodeStatus>,
): ReadonlyArray<Catalog.Entry> =>
  Option.match(maybeStatus, {
    onNone: () => [],
    onSome: status => Catalog.entries(catalog, status),
  })

const sectionFor = (
  maybeStatus: Option.Option<CodeStatus>,
): ReadonlyArray<UiNode> =>
  sectionOf(maybeStatus, entriesOf(maybeStatus), { timeZone: 'UTC' })

const rowsOf = (nodes: ReadonlyArray<UiNode>): ReadonlyArray<ListItem> =>
  Array.flatMap(nodes, node => (node._tag === 'List' ? node.items : []))

const rowTextOf = (row: ListItem): ReadonlyArray<string> => [
  row.title,
  ...(row.lines ?? []),
]

const newerRowOf = (newer: NewerCode): ReadonlyArray<string> =>
  Option.match(Array.get(rowsOf(sectionFor(statusOf(anUpdate, newer))), 1), {
    onNone: () => [],
    onSome: rowTextOf,
  })

describe('which code a Client runs, as state', () => {
  it('is nothing until the host says, and then what the host said last', () => {
    const [first] = update(
      Option.none(),
      ObservedCodeStatus({ status: { running: anUpdate, newer: Asking() } }),
    )
    expect(first).toEqual(statusOf(anUpdate, Asking()))
    const [second, commands] = update(
      first,
      ObservedCodeStatus({ status: { running: anUpdate, newer: ready } }),
    )
    expect(second).toEqual(statusOf(anUpdate, ready))
    expect(commands).toEqual([])
  })

  it('survives being saved and read back, as a Model field must', () => {
    const status: CodeStatus = { running: anUpdate, newer: ready }
    const codec = S.toCodecJson(CodeStatus)
    const saved: unknown = JSON.parse(
      JSON.stringify(S.encodeSync(codec)(status)),
    )
    expect(S.decodeUnknownSync(codec)(saved)).toEqual(status)
  })

  it('restarts on newer code only once that code is fetched', () => {
    const [kept, commands] = update(
      statusOf(anUpdate, ready),
      RestartToUpdate(),
    )
    expect(kept).toEqual(statusOf(anUpdate, ready))
    expect(Array.map(commands, command => command.name)).toEqual([
      RestartOnNewerCode.name,
    ])
    expect(
      update(statusOf(anUpdate, NoneNewer()), RestartToUpdate())[1],
    ).toEqual([])
    expect(update(Option.none(), RestartToUpdate())[1]).toEqual([])
  })

  it('changes nothing when a restart ends or is refused', () => {
    const before = statusOf(anUpdate, ready)
    expect(update(before, CompletedRestartOnNewerCode())).toEqual([before, []])
    expect(
      update(before, FailedRestartOnNewerCode({ reason: 'not now' })),
    ).toEqual([before, []])
  })

  it('knows its own Messages from any other', () => {
    expect(isMessage(RestartToUpdate())).toBe(true)
    expect(
      isMessage(
        ObservedCodeStatus({ status: { running: builtIn, newer: NotAsked() } }),
      ),
    ).toBe(true)
    expect(isMessage({ _tag: 'Increment' })).toBe(false)
  })
})

describe('the Action that restarts on newer code', () => {
  it('is offered once newer code is fetched, and says why not before', () => {
    const [offered] = Catalog.entries(catalog, {
      running: anUpdate,
      newer: ready,
    })
    expect(offered?.availability).toEqual(Catalog.Enabled())
    expect(offered?.label).toBe('Restart')
    const [waiting] = Catalog.entries(catalog, {
      running: anUpdate,
      newer: Fetching(),
    })
    expect(waiting?.availability).toEqual(
      Catalog.Disabled({ because: 'no newer update is fetched yet' }),
    )
  })

  it('says what it touches: the restart, and no state', () => {
    expect(Catalog.declarationOf(RestartToUpdate).touches).toEqual({
      mutates: [],
      triggers: ['RestartOnNewerCode'],
    })
    const touching = (
      status: CodeStatus,
      message: typeof RestartToUpdate.Type,
    ): readonly [CodeStatus, ReadonlyArray<Readonly<{ name: string }>>] => {
      const [maybeNext, commands] = update(Option.some(status), message)
      return [Option.getOrElse(maybeNext, () => status), commands]
    }
    const statuses: ReadonlyArray<CodeStatus> = [
      { running: anUpdate, newer: ready },
      { running: anUpdate, newer: NoneNewer() },
    ]
    expect(Catalog.undeclaredTouches(catalog, touching, statuses)).toEqual([])
    expect(Catalog.unseenTouches(catalog, touching, statuses)).toEqual([])
  })
})

describe('what a host says of its code', () => {
  it('reaches a Program as Messages, in the order the host said it', async () => {
    const asking: CodeStatus = { running: anUpdate, newer: Asking() }
    const fetched: CodeStatus = { running: anUpdate, newer: ready }
    const host = Layer.succeed(CodeUpdates, {
      statuses: Stream.make(asking, fetched),
      restart: Effect.void,
    })
    const heard = await Effect.runPromise(
      Stream.runCollect(statusStream).pipe(Effect.provide(host)),
    )
    expect(Array.fromIterable(heard)).toEqual([
      ObservedCodeStatus({ status: asking }),
      ObservedCodeStatus({ status: fetched }),
    ])
  })

  it('is nothing from a host that takes no updates, named or left out', async () => {
    const unnamed = await Effect.runPromise(Stream.runCollect(statusStream))
    const named = await Effect.runPromise(
      Stream.runCollect(statusStream).pipe(Effect.provide(noCodeUpdates)),
    )
    expect(Array.fromIterable(unnamed)).toEqual([])
    expect(Array.fromIterable(named)).toEqual([])
  })

  it('restarts through the host, and a refusal becomes a Message with its reason', async () => {
    const restarts = { count: 0 }
    const willing = Layer.succeed(CodeUpdates, {
      statuses: Stream.empty,
      restart: Effect.sync(() => {
        restarts.count += 1
      }),
    })
    const done = await Effect.runPromise(
      RestartOnNewerCode().effect.pipe(Effect.provide(willing)),
    )
    expect(done).toEqual(CompletedRestartOnNewerCode())
    expect(restarts.count).toBe(1)
    const unwilling = Layer.succeed(CodeUpdates, {
      statuses: Stream.empty,
      restart: Effect.fail(new RestartRefused({ reason: 'not now' })),
    })
    expect(
      await Effect.runPromise(
        RestartOnNewerCode().effect.pipe(Effect.provide(unwilling)),
      ),
    ).toEqual(FailedRestartOnNewerCode({ reason: 'not now' }))
    expect(await Effect.runPromise(RestartOnNewerCode().effect)).toEqual(
      FailedRestartOnNewerCode({ reason: 'this device takes no updates' }),
    )
  })
})

describe('when the running code was made, as text', () => {
  it('is the day and the minute, in the zone asked for', () => {
    expect(madeAtTextOf(madeAtMs, 'UTC')).toBe('Nov 20, 2026, 7:37 PM')
    expect(madeAtTextOf(madeAtMs, 'America/New_York')).toBe(
      'Nov 20, 2026, 2:37 PM',
    )
  })
})

describe('the section a screen shows about its code', () => {
  it('is absent where the host says nothing', () => {
    expect(sectionFor(Option.none())).toEqual([])
  })

  it('names the update it runs, by the start of its name, and when it was made', () => {
    const section = sectionFor(statusOf(anUpdate, NoneNewer()))
    expect(section[0]).toMatchObject({ _tag: 'Text', content: 'Updates' })
    expect(Array.map(rowsOf(section), rowTextOf)).toEqual([
      ['Running update 1a2b3c4d', 'Made Nov 20, 2026, 7:37 PM'],
      ['No newer update'],
    ])
  })

  it('says so when it runs the code it was built with', () => {
    expect(
      Array.map(
        rowsOf(sectionFor(statusOf(builtIn, NoneNewer()))),
        rowTextOf,
      )[0],
    ).toEqual([
      'Running the code this app was built with',
      'Made Nov 20, 2026, 7:37 PM',
    ])
  })

  it('says so when an update would not start and it went back to its built-in code', () => {
    const fellBack = FellBack({
      maybeUpdateId: Option.none(),
      maybeRuntime: Option.none(),
      maybeMadeAtMs: Option.none(),
    })
    expect(
      Array.map(
        rowsOf(sectionFor(statusOf(fellBack, NotAsked()))),
        rowTextOf,
      )[0],
    ).toEqual([
      'Running the code this app was built with',
      'An update would not start, so the app went back to it',
    ])
  })

  it('leaves out what the host did not say: an update with no name or time', () => {
    const unnamed = Update({
      maybeUpdateId: Option.none(),
      maybeRuntime: Option.none(),
      maybeMadeAtMs: Option.none(),
    })
    expect(
      Array.map(
        rowsOf(sectionFor(statusOf(unnamed, NoneNewer()))),
        rowTextOf,
      )[0],
    ).toEqual(['Running an update'])
  })

  it('says where asking for newer code stands, in each state', () => {
    expect(newerRowOf(NotAsked())).toEqual(['Has not asked for a newer update'])
    expect(newerRowOf(Asking())).toEqual(['Asking for a newer update…'])
    expect(newerRowOf(NoneNewer())).toEqual(['No newer update'])
    expect(newerRowOf(Found({ maybeUpdateId: Option.some(newerId) }))).toEqual([
      'A newer update is out',
      'Update 9f8e7d6c is not fetched yet',
    ])
    expect(newerRowOf(Fetching())).toEqual(['Fetching a newer update…'])
    expect(newerRowOf(ready)).toEqual([
      'A newer update is ready',
      'Update 9f8e7d6c runs after a restart',
    ])
    expect(newerRowOf(Ready({ maybeUpdateId: Option.none() }))).toEqual([
      'A newer update is ready',
      'It runs after a restart',
    ])
    expect(newerRowOf(CouldNotAsk({ why: 'The request timed out.' }))).toEqual([
      'Could not ask for a newer update',
      'The request timed out.',
    ])
    expect(newerRowOf(CouldNotFetch({ why: 'No space left.' }))).toEqual([
      'Could not fetch the newer update',
      'No space left.',
    ])
  })

  it('offers the restart as a button on the row, only once newer code is ready', () => {
    const readyRow = Array.get(rowsOf(sectionFor(statusOf(anUpdate, ready))), 1)
    expect(
      Option.map(readyRow, row =>
        Array.map(row.trailing ?? [], button => [button.label, button.action]),
      ),
    ).toEqual(Option.some([['Restart', 'RestartToUpdate']]))
    const waitingRow = Array.get(
      rowsOf(sectionFor(statusOf(anUpdate, Fetching()))),
      1,
    )
    expect(Option.map(waitingRow, row => row.trailing)).toEqual(
      Option.some(undefined),
    )
  })
})
