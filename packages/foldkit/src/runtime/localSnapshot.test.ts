import {
  Array,
  Duration,
  Effect,
  Option,
  Schema as S,
  SchemaTransformation,
} from 'effect'
import { describe, expect, it } from 'vitest'

import { m } from '../message/public.js'
import { compose } from '../program/compose.js'
import { make } from '../program/program.js'
import { defaultSessionPolicy } from '../synchronization/synchronization.js'
import * as LocalSnapshot from './localSnapshot.js'
import { start } from './start.js'
import { Memory, type MemoryStore, makeMemoryStore } from './syncEngine.js'

const Increment = m('Increment')
const Decrement = m('Decrement')
const ToggledPanel = m('ToggledPanel')
const CounterMessage = S.Union([Increment, Decrement, ToggledPanel])
type CounterMessage = typeof CounterMessage.Type

const CounterModel = S.Struct({ count: S.Number, isPanelOpen: S.Boolean })
type CounterModel = typeof CounterModel.Type

const folds = { count: 0 }

const Counter = make({
  id: 'snapshot-counter',
  version: 1,
  Model: CounterModel,
  Message: CounterMessage,
  init: () => [{ count: 0, isPanelOpen: false }, []],
  update: (model: CounterModel, message: CounterMessage) => {
    folds.count += 1
    if (message._tag === 'Increment') {
      return [{ ...model, count: model.count + 1 }, []]
    } else if (message._tag === 'Decrement') {
      return [{ ...model, count: model.count - 1 }, []]
    } else {
      return [{ ...model, isPanelOpen: !model.isPanelOpen }, []]
    }
  },
  synchronization: {
    messageCategory: (message: CounterMessage) =>
      message._tag === 'ToggledPanel' ? 'Navigation' : 'Domain',
    projectDomain: (model: CounterModel) => model,
  },
})

const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const CountProjection = CountRow.pipe(
  S.decodeTo(
    CounterModel,
    SchemaTransformation.transform({
      decode: (row): CounterModel => ({ count: row.value, isPanelOpen: false }),
      encode: model => ({ id: 'count', value: model.count, asOf: '', at: 0 }),
    }),
  ),
)

const MessageRow = S.Struct({
  id: S.String,
  tag: S.Literals(['Increment', 'Decrement', 'ToggledPanel']),
  from: S.String,
  createdAtMs: S.Number,
})

const MessageWire = MessageRow.pipe(
  S.decodeTo(
    CounterMessage,
    SchemaTransformation.transform({
      decode: row => ({ _tag: row.tag }),
      encode: message => ({
        id: '',
        tag: message._tag,
        from: '',
        createdAtMs: 0,
      }),
    }),
  ),
)

const Synced = compose.sync({
  of: Counter,
  snapshot: CountProjection,
  message: MessageWire,
})

const row = (
  id: string,
  tag: CounterMessage['_tag'],
  createdAtMs: number,
): Readonly<Record<string, unknown>> => ({
  id,
  tag,
  from: 'peer',
  createdAtMs,
})

const pressAndClose = (
  store: MemoryStore,
  snapshots: LocalSnapshot.LocalSnapshotStore,
  messages: ReadonlyArray<CounterMessage>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* start({
        program: Synced,
        sync: Memory({ processor: 'writer', store }),
        localSnapshot: snapshots,
      })
      for (const message of messages) {
        yield* runtime.run(message)
      }
    }),
  )

const settleAttempts = 200

const bootAndRead = (
  store: MemoryStore,
  snapshots: LocalSnapshot.LocalSnapshotStore,
  expectedCount: number,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      folds.count = 0
      const runtime = yield* start({
        program: Synced,
        sync: Memory({ processor: 'reader', store }),
        localSnapshot: snapshots,
      })
      const countOf = (): number => {
        const model = runtime.readModel()
        return model._tag === 'Ready' ? model.count : Number.NaN
      }
      for (
        let attempt = 0;
        attempt < settleAttempts && countOf() !== expectedCount;
        attempt += 1
      ) {
        yield* Effect.sleep(Duration.millis(1))
      }
      return { model: runtime.readModel(), folds: folds.count }
    }),
  )

const tickingClock = () => {
  const clock = { now: 1_000_000 }
  return () => {
    clock.now += 10
    return clock.now
  }
}

const pressWithClock = (
  store: MemoryStore,
  snapshots: LocalSnapshot.LocalSnapshotStore,
  clock: () => number,
  count: number,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* start({
        program: Synced,
        sync: Memory({ processor: 'writer', store }),
        localSnapshot: snapshots,
        clock,
      })
      for (let press = 0; press < count; press += 1) {
        yield* runtime.run(Increment())
      }
    }),
  )

describe('LocalSnapshot watermark', () => {
  it('prints one fingerprint for a set of ids in any order', () => {
    expect(LocalSnapshot.fingerprintOf(['m1', 'm2', 'm3'])).toBe(
      LocalSnapshot.fingerprintOf(['m3', 'm1', 'm2']),
    )
    expect(LocalSnapshot.fingerprintOf(['m1', 'm2'])).not.toBe(
      LocalSnapshot.fingerprintOf(['m1', 'm3']),
    )
  })

  it('is proven only by the exact rows at or before its position', () => {
    const rows = [row('a', 'Increment', 10), row('b', 'Increment', 20)]
    const watermark = Option.getOrThrow(LocalSnapshot.watermarkOf(rows))
    expect(watermark.count).toBe(2)
    expect(watermark.position.id).toBe('b')
    expect(
      LocalSnapshot.isProvenBy(watermark, [...rows, row('c', 'Increment', 30)]),
    ).toBe(true)
    expect(
      LocalSnapshot.isProvenBy(watermark, [
        ...rows,
        row('late', 'Decrement', 15),
      ]),
    ).toBe(false)
    expect(LocalSnapshot.isProvenBy(watermark, rows.slice(1))).toBe(false)
  })
})

describe('LocalSnapshot series', () => {
  const snapshotAt = (
    count: number,
  ): LocalSnapshot.LocalSnapshot<CounterModel> => ({
    model: { count, isPanelOpen: false },
    watermark: {
      position: { createdAtMs: count, id: `m${count}` },
      count,
      fingerprint: LocalSnapshot.fingerprintOf([`m${count}`]),
    },
  })
  const countsOf = (
    series: ReadonlyArray<LocalSnapshot.LocalSnapshot<CounterModel>>,
  ) => series.map(snapshot => snapshot.watermark.count)

  it('floats the newest snapshot until it is a spacing past the last anchor', () => {
    const anchored = LocalSnapshot.retainedSnapshots([], snapshotAt(10))
    const floating = LocalSnapshot.retainedSnapshots(anchored, snapshotAt(150))
    expect(countsOf(floating)).toEqual([10, 150])
    expect(
      countsOf(LocalSnapshot.retainedSnapshots(floating, snapshotAt(160))),
    ).toEqual([10, 160])
    const spaced = LocalSnapshot.retainedSnapshots(floating, snapshotAt(210))
    expect(
      countsOf(LocalSnapshot.retainedSnapshots(spaced, snapshotAt(220))),
    ).toEqual([10, 210, 220])
  })

  it('keeps at most four snapshots, dropping the oldest', () => {
    const none: ReadonlyArray<LocalSnapshot.LocalSnapshot<CounterModel>> = []
    const series = Array.reduce([0, 200, 400, 600, 800], none, (kept, count) =>
      LocalSnapshot.retainedSnapshots(kept, snapshotAt(count)),
    )
    expect(countsOf(series)).toEqual([200, 400, 600, 800])
  })

  it('grows a watermark by rows after it without the rows it covers', () => {
    const early = [row('a', 'Increment', 10), row('b', 'Increment', 20)]
    const late = [row('c', 'Increment', 30)]
    expect(
      LocalSnapshot.extendWatermark(
        Option.getOrThrow(LocalSnapshot.watermarkOf(early)),
        late,
      ),
    ).toEqual(
      LocalSnapshot.watermarkOf([...early, ...late]).pipe(Option.getOrThrow),
    )
  })
})

describe('LocalSnapshot text', () => {
  const watermark = Option.getOrThrow(
    LocalSnapshot.watermarkOf([row('a', 'Increment', 10)]),
  )
  const state: LocalSnapshot.LocalState<CounterModel> = {
    snapshots: [{ model: { count: 4, isPanelOpen: false }, watermark }],
    rows: [row('b', 'Increment', 20)],
    maybeCursor: Option.some('7'),
  }

  it('decodes what it encodes for the same Program version', () => {
    const text = Option.getOrThrow(LocalSnapshot.encode(Counter, state))
    expect(LocalSnapshot.decode(Counter, text)).toEqual(Option.some(state))
  })

  it('drops state another version wrote, so the log rebuilds it', () => {
    const text = Option.getOrThrow(LocalSnapshot.encode(Counter, state))
    expect(LocalSnapshot.decode({ ...Counter, version: 2 }, text)).toEqual(
      Option.none(),
    )
    expect(LocalSnapshot.decode(Counter, 'not json')).toEqual(Option.none())
  })
})

describe('Runtime.start with a local snapshot', () => {
  it('folds only the rows written after the snapshot', async () => {
    const store = makeMemoryStore()
    const snapshots = LocalSnapshot.memory()
    await Effect.runPromise(
      pressAndClose(
        store,
        snapshots,
        Array.makeBy(20, () => Increment()),
      ),
    )
    expect(Option.isSome(snapshots.peek())).toBe(true)
    store.messages.push(
      row('after-1', 'Increment', Date.now() + 1000),
      row('after-2', 'Increment', Date.now() + 2000),
    )
    const cold = await Effect.runPromise(
      bootAndRead(store, LocalSnapshot.memory(), 22),
    )
    const warm = await Effect.runPromise(bootAndRead(store, snapshots, 22))
    expect(warm.model).toEqual({ _tag: 'Ready', count: 22, isPanelOpen: false })
    expect(cold.model).toEqual(warm.model)
    expect(warm.folds).toBeLessThanOrEqual(4)
    expect(cold.folds).toBeGreaterThanOrEqual(22)
  })

  it('counts nothing twice when the live feed replays recent rows after a reload', async () => {
    const store = makeMemoryStore()
    const snapshots = LocalSnapshot.memory()
    await Effect.runPromise(
      pressAndClose(
        store,
        snapshots,
        Array.makeBy(9, () => Increment()),
      ),
    )
    const engine = Memory({ processor: 'reader', store })
    const replayingFeed = {
      ...engine,
      subscribe: (enqueue: Parameters<typeof engine.subscribe>[0]) =>
        Effect.andThen(engine.subscribe(enqueue), () =>
          Effect.sync(() => {
            Array.forEach(store.messages, message => {
              enqueue({ _tag: 'Message', row: message })
            })
          }),
        ),
    }
    const count = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* start({
            program: Synced,
            sync: replayingFeed,
            localSnapshot: snapshots,
          })
          yield* Effect.sleep(Duration.millis(50))
          const model = runtime.readModel()
          return model._tag === 'Ready' ? model.count : Number.NaN
        }),
      ),
    )
    expect(count).toBe(9)
  })

  it('paints the snapshot before the log has been read', async () => {
    const store = makeMemoryStore()
    const snapshots = LocalSnapshot.memory()
    await Effect.runPromise(
      pressAndClose(store, snapshots, [Increment(), Increment()]),
    )
    const offline = Memory({ processor: 'reader', store })
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* start({
            program: Synced,
            sync: {
              ...offline,
              read: () => Effect.never,
              readSince: () => Effect.never,
            },
            localSnapshot: snapshots,
          })
          return runtime.readModel()
        }),
      ),
    )
    expect(model).toEqual({ _tag: 'Ready', count: 2, isPanelOpen: false })
  })

  it('refolds the whole log when a row lands behind the snapshot', async () => {
    const store = makeMemoryStore()
    const snapshots = LocalSnapshot.memory()
    await Effect.runPromise(
      pressAndClose(store, snapshots, [Increment(), Increment(), Increment()]),
    )
    store.messages.push(row('offline-decrement', 'Decrement', 1))
    const warm = await Effect.runPromise(bootAndRead(store, snapshots, 2))
    expect(warm.model).toEqual({ _tag: 'Ready', count: 2, isPanelOpen: false })
  })

  it('asks the engine only for rows after the cursor it kept', async () => {
    const store = makeMemoryStore()
    const snapshots = LocalSnapshot.memory()
    await Effect.runPromise(
      pressAndClose(
        store,
        snapshots,
        Array.makeBy(30, () => Increment()),
      ),
    )
    store.messages.push(row('after', 'Increment', Date.now() + 1000))
    const engine = Memory({ processor: 'reader', store })
    const fetched: Array<number> = []
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* start({
            program: Synced,
            sync: {
              ...engine,
              readSince: maybeCursor =>
                Effect.tap(engine.readSince(maybeCursor), page =>
                  Effect.sync(() => {
                    fetched.push(page.messages.length)
                  }),
                ),
            },
            localSnapshot: snapshots,
          })
          yield* Effect.sleep(Duration.millis(20))
        }),
      ),
    )
    expect(fetched).toEqual([1])
  })

  it('refolds a late row from the newest snapshot before it', async () => {
    const store = makeMemoryStore()
    const snapshots = LocalSnapshot.memory()
    const clock = tickingClock()
    await Effect.runPromise(pressWithClock(store, snapshots, clock, 200))
    await Effect.runPromise(pressWithClock(store, snapshots, clock, 200))
    const saved = Option.getOrThrow(
      Option.flatMap(snapshots.peek(), text =>
        LocalSnapshot.decode(Counter, text),
      ),
    )
    expect(saved.snapshots.length).toBeGreaterThanOrEqual(2)
    const middle =
      Array.headNonEmpty(saved.snapshots).watermark.position.createdAtMs + 5
    store.messages.push(row('late-decrement', 'Decrement', middle))
    const cold = await Effect.runPromise(
      bootAndRead(store, LocalSnapshot.memory(), 399),
    )
    const warm = await Effect.runPromise(bootAndRead(store, snapshots, 399))
    expect(warm.model).toEqual({
      _tag: 'Ready',
      count: 399,
      isPanelOpen: false,
    })
    expect(cold.model).toEqual(warm.model)
    expect(warm.folds).toBeLessThan(cold.folds)
  })

  it('reads the whole log when a late row is behind every snapshot', async () => {
    const store = makeMemoryStore()
    const snapshots = LocalSnapshot.memory()
    const clock = tickingClock()
    await Effect.runPromise(pressWithClock(store, snapshots, clock, 5))
    store.messages.push(row('ancient-decrement', 'Decrement', 1))
    const warm = await Effect.runPromise(bootAndRead(store, snapshots, 4))
    expect(warm.model).toEqual({ _tag: 'Ready', count: 4, isPanelOpen: false })
  })

  it('keeps a write that has not reached the engine out of the saved state', async () => {
    const store = makeMemoryStore()
    const snapshots = LocalSnapshot.memory()
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const engine = Memory({ processor: 'writer', store })
          const writer = yield* start({
            program: Synced,
            sync: engine,
            localSnapshot: snapshots,
          })
          yield* writer.run(Increment())
          engine.goOffline()
          yield* writer.run(Increment())
          expect(writer.readModel()).toEqual({
            _tag: 'Ready',
            count: 2,
            isPanelOpen: false,
          })
        }),
      ),
    )
    const saved = Option.flatMap(snapshots.peek(), text =>
      LocalSnapshot.decode(Counter, text),
    )
    expect(
      Option.map(saved, state => Array.lastNonEmpty(state.snapshots).model),
    ).toEqual(Option.some({ count: 1, isPanelOpen: false }))
  })

  it('keeps one Processor’s local navigation out of the shared snapshot', async () => {
    const store = makeMemoryStore()
    const snapshots = LocalSnapshot.memory()
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const writer = yield* start({
            program: Synced,
            sync: Memory({ processor: 'writer', store }),
            policy: defaultSessionPolicy(),
            localSnapshot: snapshots,
          })
          yield* writer.run(Increment())
          yield* writer.run(ToggledPanel())
          expect(writer.readModel()).toEqual({
            _tag: 'Ready',
            count: 1,
            isPanelOpen: true,
          })
        }),
      ),
    )
    const saved = Option.flatMap(snapshots.peek(), text =>
      LocalSnapshot.decode(Counter, text),
    )
    expect(
      Option.map(saved, state => Array.lastNonEmpty(state.snapshots).model),
    ).toEqual(Option.some({ count: 1, isPanelOpen: false }))
  })
})
