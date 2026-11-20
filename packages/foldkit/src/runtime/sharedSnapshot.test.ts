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
import {
  Memory,
  type SharedSnapshotRow,
  SyncTransportError,
  makeMemoryStore,
} from './syncEngine.js'
import type { SyncTrace } from './syncTrace.js'

const Increment = m('Increment')
const Decrement = m('Decrement')
const ToggledPanel = m('ToggledPanel')
const CounterMessage = S.Union([Increment, Decrement, ToggledPanel])
type CounterMessage = typeof CounterMessage.Type

const CounterModel = S.Struct({ count: S.Number, isPanelOpen: S.Boolean })
type CounterModel = typeof CounterModel.Type

const makeTrackedProgram = (foldRevision?: string) => {
  const folds = { count: 0 }
  const Counter = make({
    id: 'shared-snapshot-counter',
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
    ...(foldRevision === undefined ? {} : { foldRevision }),
  })
  return { Counter, Synced, folds }
}

const makeRow = (
  id: string,
  tag: CounterMessage['_tag'],
  createdAtMs: number,
  from = 'peer-1',
): Readonly<Record<string, unknown>> => ({
  id,
  tag,
  from,
  createdAtMs,
})

const seedSharedSlot = (
  store: ReturnType<typeof makeMemoryStore>,
  program: LocalSnapshot.SnapshotProgram<CounterModel>,
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
  model: CounterModel,
  slot: number,
  cursor = String(rows.length),
): void => {
  const watermark = Option.getOrThrow(LocalSnapshot.watermarkOf(rows))
  const payload = Option.getOrThrow(
    LocalSnapshot.encodeShared(program, { model, watermark, cursor }),
  )
  const foldRevision = program.foldRevision ?? ''
  const sharedRow: SharedSnapshotRow = {
    slot,
    programVersion: program.version,
    foldRevision,
    count: watermark.count,
    writtenBy: 'peer-1',
    writtenAtMs: watermark.position.createdAtMs,
    payload,
  }
  store.sharedSnapshots.set(
    `${program.version}:${foldRevision}:${slot}`,
    sharedRow,
  )
}

describe('Shared 4-slot snapshot ring', () => {
  it('cold-boots a 1,000-message log from slot #995 with only 5 update calls before Ready and zero whole-log reads', async () => {
    const store = makeMemoryStore()
    const total = 1000
    const snapshotAt = 995
    const allRows = Array.makeBy(total, index =>
      makeRow(`m-${index + 1}`, 'Increment', 1000 + index * 10),
    )
    store.messages.push(...allRows)

    const { Counter, Synced, folds } = makeTrackedProgram('fold-v1')
    seedSharedSlot(
      store,
      { ...Counter, foldRevision: 'fold-v1' },
      allRows.slice(0, snapshotAt),
      { count: snapshotAt, isPanelOpen: false },
      Math.floor(snapshotAt / 50) % 4,
      String(snapshotAt),
    )

    const calls = {
      read: 0,
      readSinceWithCursor: 0,
      readSinceFromStart: 0,
      readSharedSnapshots: 0,
    }
    const baseEngine = Memory({ processor: 'fresh-reader', store })
    const spiedEngine = {
      ...baseEngine,
      read: () => {
        calls.read += 1
        return baseEngine.read()
      },
      readSince: (maybeCursor: Option.Option<string>) => {
        if (Option.isSome(maybeCursor)) {
          calls.readSinceWithCursor += 1
        } else {
          calls.readSinceFromStart += 1
        }
        return baseEngine.readSince(maybeCursor)
      },
      readSharedSnapshots: (
        query: Parameters<typeof baseEngine.readSharedSnapshots>[0],
      ) => {
        calls.readSharedSnapshots += 1
        return baseEngine.readSharedSnapshots(query)
      },
    }

    const traces: Array<SyncTrace> = []
    let foldsAtReady = -1

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          folds.count = 0
          const runtime = yield* start({
            program: Synced,
            sync: spiedEngine,
            localSnapshot: LocalSnapshot.disabled,
            sharedSnapshot: {
              stride: 50,
              minDelta: 50,
              jitterMs: 0,
              auditSampleRate: 0,
            },
          })
          const stop = runtime.observeSync(event => {
            traces.push(event)
          })
          foldsAtReady = folds.count
          expect(runtime.readModel()).toEqual({
            _tag: 'Ready',
            count: total,
            isPanelOpen: false,
          })
          yield* runtime.caughtUp
          stop()
        }),
      ),
    )

    expect(calls.readSharedSnapshots).toBe(1)
    expect(calls.readSinceWithCursor).toBe(1)
    expect(calls.readSinceFromStart).toBe(0)
    expect(calls.read).toBe(0)
    expect(foldsAtReady).toBe(total - snapshotAt)
  })

  it('falls back to an older ring slot when a late offline row landed behind the newest slot', async () => {
    const store = makeMemoryStore()
    const total = 1000
    const allRows = Array.makeBy(total, index =>
      makeRow(`m-${index + 1}`, 'Increment', 1000 + index * 10),
    )
    // A late offline row arrives after #1000 in server receive order,
    // with createdAtMs between #945 (10440, slot 2) and #995 (10940, slot 3).
    const lateOfflineRow = makeRow('late-offline', 'Decrement', 10700)
    store.messages.push(...allRows, lateOfflineRow)

    const { Counter, Synced, folds } = makeTrackedProgram('fold-v1')
    const snapshotProgram = { ...Counter, foldRevision: 'fold-v1' }
    seedSharedSlot(
      store,
      snapshotProgram,
      allRows.slice(0, 945),
      { count: 945, isPanelOpen: false },
      Math.floor(945 / 50) % 4,
      '945',
    )
    seedSharedSlot(
      store,
      snapshotProgram,
      allRows.slice(0, 995),
      { count: 995, isPanelOpen: false },
      Math.floor(995 / 50) % 4,
      '995',
    )

    const cursorsAsked: Array<Option.Option<string>> = []
    const baseEngine = Memory({ processor: 'fresh-reader', store })
    const spiedEngine = {
      ...baseEngine,
      readSince: (maybeCursor: Option.Option<string>) => {
        cursorsAsked.push(maybeCursor)
        return baseEngine.readSince(maybeCursor)
      },
    }

    let foldsAtReady = -1
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          folds.count = 0
          const runtime = yield* start({
            program: Synced,
            sync: spiedEngine,
            localSnapshot: LocalSnapshot.disabled,
            sharedSnapshot: {
              stride: 50,
              minDelta: 100,
              jitterMs: 0,
              auditSampleRate: 0,
            },
          })
          foldsAtReady = folds.count
          expect(runtime.readModel()).toEqual({
            _tag: 'Ready',
            count: 999,
            isPanelOpen: false,
          })
        }),
      ),
    )

    // Tried #995 first (saw late row behind it), then fell back to #945 (56 trailing rows), 0 whole-log reads.
    expect(cursorsAsked).toEqual([Option.some('995'), Option.some('945')])
    expect(foldsAtReady).toBe(56)
  })

  it('skips shared snapshots when hasOwnRows is true so an existing Processor keeps its own local navigation', async () => {
    const store = makeMemoryStore()
    const rows = [
      makeRow('m-1', 'Increment', 1000, 'returning-device'),
      makeRow('m-2', 'ToggledPanel', 1010, 'returning-device'),
      makeRow('m-3', 'Increment', 1020, 'peer-2'),
    ]
    store.messages.push(...rows)

    const { Counter, Synced } = makeTrackedProgram('fold-v1')
    // Shared snapshot is folded as a stranger (isPanelOpen: false).
    seedSharedSlot(
      store,
      { ...Counter, foldRevision: 'fold-v1' },
      rows,
      { count: 2, isPanelOpen: false },
      0,
      '3',
    )

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* start({
            program: Synced,
            sync: Memory({ processor: 'returning-device', store }),
            policy: defaultSessionPolicy(),
            localSnapshot: LocalSnapshot.disabled,
            sharedSnapshot: { auditSampleRate: 0, jitterMs: 0 },
          })
          expect(runtime.readModel()).toEqual({
            _tag: 'Ready',
            count: 2,
            isPanelOpen: true,
          })
        }),
      ),
    )
  })

  it('never paints a shared snapshot from a different foldRevision and falls back to the whole log', async () => {
    const store = makeMemoryStore()
    const rows = Array.makeBy(10, index =>
      makeRow(`m-${index + 1}`, 'Increment', 1000 + index * 10),
    )
    store.messages.push(...rows)

    const v1 = makeTrackedProgram('fold-v1')
    // Deliberately write a wrong model under fold-v1; fold-v2 must ignore it completely.
    seedSharedSlot(
      store,
      { ...v1.Counter, foldRevision: 'fold-v1' },
      rows,
      { count: 9999, isPanelOpen: false },
      0,
      '10',
    )

    const v2 = makeTrackedProgram('fold-v2')
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* start({
            program: v2.Synced,
            sync: Memory({ processor: 'v2-reader', store }),
            localSnapshot: LocalSnapshot.disabled,
            sharedSnapshot: { auditSampleRate: 0, jitterMs: 0 },
          })
          expect(runtime.readModel()).toEqual({
            _tag: 'Ready',
            count: 10,
            isPanelOpen: false,
          })
        }),
      ),
    )
  })

  it('publishes a shared snapshot to the ring after boot when rows advance past minDelta, and absorbs write failures quietly', async () => {
    const store = makeMemoryStore()
    const rows = Array.makeBy(60, index =>
      makeRow(`m-${index + 1}`, 'Increment', 1000 + index * 10),
    )
    store.messages.push(...rows)

    const { Synced } = makeTrackedProgram('fold-v1')
    const baseEngine = Memory({ processor: 'publisher', store })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* start({
            program: Synced,
            sync: baseEngine,
            localSnapshot: LocalSnapshot.disabled,
            sharedSnapshot: {
              stride: 50,
              minDelta: 50,
              minIntervalMs: 0,
              jitterMs: 0,
              auditSampleRate: 0,
            },
          })
          yield* runtime.caughtUp
          yield* Effect.sleep(Duration.millis(20))
        }),
      ),
    )

    const expectedSlot = Math.floor(60 / 50) % 4
    const stored = store.sharedSnapshots.get(`1:fold-v1:${expectedSlot}`)
    expect(stored).toBeDefined()
    expect(stored?.count).toBe(60)
    expect(stored?.writtenBy).toBe('publisher')

    // Monotonic rejection / write failure is absorbed quietly without crashing.
    const failingWriteEngine = {
      ...Memory({ processor: 'publisher-2', store: makeMemoryStore() }),
      writeSharedSnapshot: () =>
        Effect.fail(
          new SyncTransportError({
            cause: 'permission rejected older count',
            operation: 'Write',
          }),
        ),
    }
    failingWriteEngine.store.messages.push(...rows)

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* start({
            program: Synced,
            sync: failingWriteEngine,
            localSnapshot: LocalSnapshot.disabled,
            sharedSnapshot: {
              stride: 50,
              minDelta: 50,
              minIntervalMs: 0,
              jitterMs: 0,
              auditSampleRate: 0,
            },
          })
          yield* runtime.caughtUp
          yield* Effect.sleep(Duration.millis(20))
          expect(runtime.readModel()).toEqual({
            _tag: 'Ready',
            count: 60,
            isPanelOpen: false,
          })
        }),
      ),
    )
  })

  it('detects a poisoned shared snapshot via sampled background audit, refolds authoritatively, and repairs the ring', async () => {
    const store = makeMemoryStore()
    const rows = Array.makeBy(55, index =>
      makeRow(`m-${index + 1}`, 'Increment', 1000 + index * 10),
    )
    store.messages.push(...rows)

    const { Counter, Synced } = makeTrackedProgram('fold-v1')
    const slot = Math.floor(55 / 50) % 4
    // Seed a poisoned snapshot whose watermark matches 55 rows, but whose Model lies (count: 777).
    seedSharedSlot(
      store,
      { ...Counter, foldRevision: 'fold-v1' },
      rows,
      { count: 777, isPanelOpen: false },
      slot,
      '55',
    )

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* start({
            program: Synced,
            sync: Memory({ processor: 'auditor', store }),
            localSnapshot: LocalSnapshot.disabled,
            sharedSnapshot: {
              stride: 50,
              minDelta: 50,
              minIntervalMs: 0,
              jitterMs: 0,
              auditSampleRate: 1,
              random: () => 0,
            },
          })
          yield* runtime.caughtUp
          // Allow background audit + repair publish to settle.
          yield* Effect.sleep(Duration.millis(40))
          expect(runtime.readModel()).toEqual({
            _tag: 'Ready',
            count: 55,
            isPanelOpen: false,
          })
        }),
      ),
    )

    // The repaired slot in the ring now holds the true Model (count: 55).
    const repaired = store.sharedSnapshots.get(`1:fold-v1:${slot}`)
    expect(repaired).toBeDefined()
    const decoded = LocalSnapshot.decodeShared(
      { ...Counter, foldRevision: 'fold-v1' },
      repaired?.payload ?? '',
    )
    expect(Option.map(decoded, entry => entry.model)).toEqual(
      Option.some({ count: 55, isPanelOpen: false }),
    )
  })

  it('never audits warm boots from a local snapshot', async () => {
    const store = makeMemoryStore()
    const rows = Array.makeBy(10, index =>
      makeRow(`m-${index + 1}`, 'Increment', 1000 + index * 10),
    )
    store.messages.push(...rows)
    const { Synced } = makeTrackedProgram('fold-v1')
    const local = LocalSnapshot.memory()

    // First run saves local snapshot.
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* start({
            program: Synced,
            sync: Memory({ processor: 'warm-device', store }),
            localSnapshot: local,
            sharedSnapshot: { auditSampleRate: 0, jitterMs: 0 },
          })
          yield* runtime.caughtUp
        }),
      ),
    )

    // Second run is a warm boot: readSince(None) and read() must NOT be called even with auditSampleRate: 1.
    let wholeLogReads = 0
    const baseEngine = Memory({ processor: 'warm-device', store })
    const spiedEngine = {
      ...baseEngine,
      read: () => {
        wholeLogReads += 1
        return baseEngine.read()
      },
      readSince: (maybeCursor: Option.Option<string>) => {
        if (Option.isNone(maybeCursor)) {
          wholeLogReads += 1
        }
        return baseEngine.readSince(maybeCursor)
      },
    }

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* start({
            program: Synced,
            sync: spiedEngine,
            localSnapshot: local,
            sharedSnapshot: {
              auditSampleRate: 1,
              random: () => 0,
              jitterMs: 0,
            },
          })
          yield* runtime.caughtUp
          yield* Effect.sleep(Duration.millis(30))
        }),
      ),
    )

    expect(wholeLogReads).toBe(0)
  })
})
