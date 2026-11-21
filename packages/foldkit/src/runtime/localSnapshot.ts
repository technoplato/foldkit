import { Array, Effect, Option, Order, Result, Schema as S, pipe } from 'effect'

import {
  stripForLocalSnapshot,
  stripForSharedSnapshot,
} from '../program/durability.js'
import type { ProgramSchema } from '../program/program.js'
import {
  type LogRowOrder,
  isRowOrderAfter,
  readRowString,
  rowOrderOf,
} from './syncEngine.js'

// STORE

/**
 * Where one device keeps its local snapshot: a single text value. The
 * runtime reads it once at boot and rewrites it as the log grows. Every
 * Processor on a device may share one store, such as two browser tabs
 * sharing `localStorage`, because a local snapshot holds only what every
 * Processor sees.
 *
 * @example
 * ```typescript
 * Runtime.start({
 *   program: SyncedCounter,
 *   sync: engine,
 *   localSnapshot: LocalSnapshot.webStorage(window.localStorage, 'counter'),
 * })
 * ```
 */
export type LocalSnapshotStore = Readonly<{
  load: Effect.Effect<Option.Option<string>, unknown>
  save: (text: string) => Effect.Effect<void, unknown>
  remove?: Effect.Effect<void, unknown>
}>

/** Explicit opt-out for `StartConfig.localSnapshot` (e.g. isolated tests). */
export const disabled = 'Disabled' as const

/**
 * Identity of the log slice a local snapshot belongs to. Stamped inside the
 * serialized envelope and checked on decode so even an explicit file override
 * never leaks state across apps, rooms, or signed-in members.
 */
export const LocalSnapshotScope = S.Struct({
  app: S.String,
  log: S.String,
  room: S.String,
  owner: S.String,
})
/** Identity of the log slice a local snapshot belongs to. */
export type LocalSnapshotScope = typeof LocalSnapshotScope.Type

export const scopesEqual = (
  a: LocalSnapshotScope,
  b: LocalSnapshotScope,
): boolean =>
  a.app === b.app && a.log === b.log && a.room === b.room && a.owner === b.owner

/**
 * A store in memory, for tests and for hosts that restart a Program in
 * one process. `peek` reads what was saved.
 *
 * @example
 * ```typescript
 * const store = LocalSnapshot.memory()
 * Option.isSome(store.peek()) // true once the runtime has saved
 * ```
 */
export const memory = (): LocalSnapshotStore &
  Readonly<{ peek: () => Option.Option<string> }> => {
  let maybeSaved = Option.none<string>()
  return {
    load: Effect.sync(() => maybeSaved),
    save: text =>
      Effect.sync(() => {
        maybeSaved = Option.some(text)
      }),
    remove: Effect.sync(() => {
      maybeSaved = Option.none()
    }),
    peek: () => maybeSaved,
  }
}

/**
 * A store in Web Storage under one key, such as `window.localStorage`.
 * Storage failures surface through the Effect error channel so `Runtime.start`
 * can trace them without crashing the Program.
 *
 * @example
 * ```typescript
 * LocalSnapshot.webStorage(window.localStorage, 'foldkit-counter')
 * ```
 */
export const webStorage = (
  storage: Pick<Storage, 'getItem' | 'setItem'> &
    Partial<Pick<Storage, 'removeItem'>>,
  key: string,
): LocalSnapshotStore => ({
  load: Effect.try(() => Option.fromNullishOr(storage.getItem(key))),
  save: text =>
    Effect.try(() => {
      storage.setItem(key, text)
    }),
  remove: Effect.try(() => {
    storage.removeItem?.(key)
  }),
})

/**
 * A store over any promise-based key-value API, such as React Native's
 * AsyncStorage or a file on Node. Failures surface through the Effect error
 * channel so `Runtime.start` can trace them without crashing the Program.
 *
 * @example
 * ```typescript
 * LocalSnapshot.fromPromises({
 *   load: () => AsyncStorage.getItem('foldkit-counter'),
 *   save: text => AsyncStorage.setItem('foldkit-counter', text),
 *   remove: () => AsyncStorage.removeItem('foldkit-counter'),
 * })
 * ```
 */
export const fromPromises = (
  config: Readonly<{
    load: () => Promise<string | null | undefined>
    save: (text: string) => Promise<void>
    remove?: () => Promise<void>
  }>,
): LocalSnapshotStore => ({
  load: Effect.tryPromise(config.load).pipe(Effect.map(Option.fromNullishOr)),
  save: text => Effect.tryPromise(() => config.save(text)),
  ...(config.remove === undefined
    ? {}
    : { remove: Effect.tryPromise(config.remove) }),
})

const indexedDbName = 'foldkit-local-snapshots'
const indexedDbStoreName = 'snapshots'

const openIndexedDb = (factory: IDBFactory): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(indexedDbName, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(indexedDbStoreName)) {
        database.createObjectStore(indexedDbStoreName)
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Could not open IndexedDB.'))
    }
  })

const runIndexedDb = <Value>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<Value>,
): Promise<Value> =>
  openIndexedDb(factory).then(
    database =>
      new Promise<Value>((resolve, reject) => {
        const transaction = database.transaction(indexedDbStoreName, mode)
        const store = transaction.objectStore(indexedDbStoreName)
        const request = operation(store)
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error ?? new Error('IndexedDB request failed.'))
        }
        transaction.oncomplete = () => {
          database.close()
        }
        transaction.onabort = () => {
          database.close()
          reject(
            transaction.error ?? new Error('IndexedDB transaction aborted.'),
          )
        }
      }),
  )

/**
 * An asynchronous IndexedDB-backed local snapshot store for browsers, avoiding
 * `localStorage`'s 5 MB synchronous quota and main-thread blocking.
 *
 * @example
 * ```typescript
 * LocalSnapshot.indexedDb('app:books:public:user-1')
 * ```
 */
export const indexedDb = (
  key: string,
  factory: IDBFactory | undefined = globalThis.indexedDB,
): LocalSnapshotStore =>
  fromPromises({
    load: async () => {
      if (factory === undefined) {
        return undefined
      }
      const value = await runIndexedDb<unknown>(factory, 'readonly', store =>
        store.get(key),
      )
      return typeof value === 'string' ? value : undefined
    },
    save: async text => {
      if (factory === undefined) {
        return
      }
      await runIndexedDb(factory, 'readwrite', store => store.put(text, key))
    },
    remove: async () => {
      if (factory === undefined) {
        return
      }
      await runIndexedDb(factory, 'readwrite', store => store.delete(key))
    },
  })

// WATERMARK

const fingerprintPrime = 16777619

const firstSeed = 2166136261

const secondSeed = 3735928559

const hashOf = (text: string, seed: number): number =>
  Array.reduce(
    text.split(''),
    seed,
    (hash, character) =>
      Math.imul(hash ^ character.charCodeAt(0), fingerprintPrime) >>> 0,
  )

/**
 * Which log rows a local snapshot already folded: the newest row's
 * position, how many rows, and a fingerprint of their ids that does not
 * depend on order. Boot trusts the snapshot only when the log rows at or
 * before `position` match `count` and `fingerprint` exactly.
 */
export const Watermark = S.Struct({
  position: S.Struct({
    createdAtMs: S.Number,
    id: S.String,
    from: S.optionalKey(S.String),
    seq: S.optionalKey(S.Number),
  }),
  count: S.Number,
  fingerprint: S.String,
})
/** Which log rows a local snapshot already folded. */
export type Watermark = typeof Watermark.Type

const positionOf = (order: LogRowOrder): Watermark['position'] => ({
  createdAtMs: order.createdAtMs,
  id: order.id,
  ...(order.from === undefined ? {} : { from: order.from }),
  ...(order.seq === undefined ? {} : { seq: order.seq }),
})

const idOf = (row: unknown): Option.Option<string> =>
  Option.filter(readRowString(row, 'id'), id => id !== '')

type FingerprintSums = Readonly<{ first: number; second: number }>

const fingerprintRadix = 36

const addIds = (
  start: FingerprintSums,
  ids: ReadonlyArray<string>,
): FingerprintSums =>
  Array.reduce(ids, start, (sum, id) => ({
    first: (sum.first + hashOf(id, firstSeed)) >>> 0,
    second: (sum.second + hashOf(id, secondSeed)) >>> 0,
  }))

const printSums = (sums: FingerprintSums): string =>
  `${sums.first.toString(fingerprintRadix)}.${sums.second.toString(fingerprintRadix)}`

const parseSums = (fingerprint: string): FingerprintSums => {
  const parts = fingerprint.split('.')
  const sumAt = (index: number): number =>
    Number.parseInt(
      Option.getOrElse(Array.get(parts, index), () => '0'),
      fingerprintRadix,
    )
  return { first: sumAt(0), second: sumAt(1) }
}

/**
 * The fingerprint of a set of row ids: two order-free sums of 32-bit
 * hashes. `['m1', 'm2']` and `['m2', 'm1']` print the same fingerprint,
 * and the fingerprint of `['m1', 'm2', 'm3']` is the fingerprint of
 * `['m1', 'm2']` with `m3` added, so a watermark can grow without the
 * rows it already covers.
 */
export const fingerprintOf = (ids: ReadonlyArray<string>): string =>
  printSums(addIds({ first: 0, second: 0 }, ids))

/** True when a row sits at or before a log position. */
export const isAtOrBefore = (row: unknown, position: LogRowOrder): boolean =>
  Option.match(rowOrderOf(row), {
    onNone: () => false,
    onSome: order => !isRowOrderAfter(order, position),
  })

/**
 * The watermark of rows a snapshot folded, none for an empty log.
 *
 * @example
 * ```typescript
 * watermarkOf([m1, m2]) // Some({ position: m2's order, count: 2, fingerprint })
 * ```
 */
export const watermarkOf = (
  rows: ReadonlyArray<unknown>,
): Option.Option<Watermark> => {
  const ordered = Array.filterMap(rows, row =>
    Result.fromOption(
      Option.zipWith(rowOrderOf(row), idOf(row), (order, id) => ({
        order,
        id,
      })),
      () => undefined,
    ),
  )
  return Option.map(Array.last(Array.sort(ordered, positionOrder)), newest => ({
    position: positionOf(newest.order),
    count: ordered.length,
    fingerprint: fingerprintOf(Array.map(ordered, entry => entry.id)),
  }))
}

const positionOrder = Order.make(
  (
    a: Readonly<{ order: LogRowOrder }>,
    b: Readonly<{ order: LogRowOrder }>,
  ) => {
    if (isRowOrderAfter(a.order, b.order)) {
      return 1
    } else if (isRowOrderAfter(b.order, a.order)) {
      return -1
    } else {
      return 0
    }
  },
)

/**
 * A watermark grown by rows after its position: the newest position, the
 * count plus those rows, and their ids added to the fingerprint. The rows
 * it already covers are not needed, so a device that kept only the rows
 * after a snapshot can still print the watermark of the whole log.
 *
 * @example
 * ```typescript
 * extendWatermark(watermarkOf([m1, m2]), [m3]) // watermarkOf([m1, m2, m3])
 * ```
 */
export const extendWatermark = (
  watermark: Watermark,
  rowsAfter: ReadonlyArray<unknown>,
): Watermark =>
  Option.match(watermarkOf(rowsAfter), {
    onNone: () => watermark,
    onSome: added => ({
      position: added.position,
      count: watermark.count + added.count,
      fingerprint: printSums({
        first:
          (parseSums(watermark.fingerprint).first +
            parseSums(added.fingerprint).first) >>>
          0,
        second:
          (parseSums(watermark.fingerprint).second +
            parseSums(added.fingerprint).second) >>>
          0,
      }),
    }),
  })

/**
 * True when the log still holds exactly the rows a watermark names: the
 * same count and fingerprint at or before its position. A row that landed
 * late, behind the position, or a row that vanished, breaks the proof.
 */
export const isProvenBy = (
  watermark: Watermark,
  rows: ReadonlyArray<unknown>,
): boolean => {
  const covered = pipe(
    rows,
    Array.filter(row => isAtOrBefore(row, watermark.position)),
    Array.filterMap(row => Result.fromOption(idOf(row), () => undefined)),
  )
  return (
    covered.length === watermark.count &&
    fingerprintOf(covered) === watermark.fingerprint
  )
}

// SNAPSHOT

/**
 * A Program's Model as of a watermark. The Model is the Program's own
 * type, encoded with its own Schema.
 */
export type LocalSnapshot<Model> = Readonly<{
  model: Model
  watermark: Watermark
}>

/**
 * What one device keeps between runs: a few snapshots, oldest first, the
 * log rows after the oldest of them, and the engine cursor after the last
 * row it has received. A reload paints the newest snapshot, asks the
 * engine only for rows after the cursor, and refolds a row that landed
 * late from the newest snapshot before it, using the rows kept here.
 */
export type LocalState<Model> = Readonly<{
  snapshots: ReadonlyArray<LocalSnapshot<Model>>
  rows: ReadonlyArray<unknown>
  maybeCursor: Option.Option<string>
  deviceModel?: Model
}>

/**
 * The parts of a Program a local state is keyed and encoded by. The
 * version is the Program's: state written by another version is dropped
 * and rebuilt from the log, which every version folds with its own update,
 * so a snapshot never needs migrating.
 */
export type SnapshotProgram<Model> = Readonly<{
  id: string
  version: number
  foldRevision?: string
  Model: ProgramSchema<Model>
  initialModel?: Model
}>

/** How many rows apart kept snapshots are, beside the newest one. */
export const snapshotSpacing = 200

/** How many snapshots one device keeps. */
export const maximumSnapshots = 4

/**
 * Adds the newest snapshot to a series, oldest first. The newest snapshot
 * floats: it replaces the previous newest until that one is
 * `snapshotSpacing` rows past the one before it, then it stays as an
 * anchor. The series keeps at most `maximumSnapshots`, dropping the
 * oldest.
 *
 * @example
 * ```typescript
 * // counts in the series: [10, 150], newest count 160
 * retainedSnapshots(series, next) // counts [10, 160]
 * // counts in the series: [10, 210], newest count 220
 * retainedSnapshots(series, next) // counts [10, 210, 220]
 * ```
 */
export const retainedSnapshots = <Model>(
  series: ReadonlyArray<LocalSnapshot<Model>>,
  next: LocalSnapshot<Model>,
): Array.NonEmptyReadonlyArray<LocalSnapshot<Model>> => {
  const countAt = (index: number): Option.Option<number> =>
    Option.map(Array.get(series, index), snapshot => snapshot.watermark.count)
  const isNewestAnchored = Option.match(countAt(series.length - 2), {
    onNone: () => true,
    onSome: previousCount =>
      Option.exists(
        countAt(series.length - 1),
        newestCount => newestCount - previousCount >= snapshotSpacing,
      ),
  })
  const kept = isNewestAnchored ? series : Array.dropRight(series, 1)
  return Array.append(Array.takeRight(kept, maximumSnapshots - 1), next)
}

/** The rows a series still needs: those after its oldest snapshot. */
export const rowsAfterOldest = <Model>(
  snapshots: Array.NonEmptyReadonlyArray<LocalSnapshot<Model>>,
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<unknown> =>
  Array.filter(
    rows,
    row => !isAtOrBefore(row, Array.headNonEmpty(snapshots).watermark.position),
  )

const storedFormat = 3

const StoredSnapshot = S.Struct({
  watermark: Watermark,
  model: S.Unknown,
})

const StoredState = S.Struct({
  format: S.Literal(storedFormat),
  programId: S.String,
  programVersion: S.Number,
  foldRevision: S.optionalKey(S.String),
  scope: S.optionalKey(LocalSnapshotScope),
  cursor: S.optionalKey(S.String),
  snapshots: S.Array(StoredSnapshot),
  rows: S.Array(S.Unknown),
  deviceModel: S.optionalKey(S.Unknown),
})

/**
 * Encodes a device's local state as text, stamped with the Program's id,
 * version, optional `foldRevision`, and optional `scope`. None when a Model
 * does not encode.
 *
 * @example
 * ```typescript
 * LocalSnapshot.encode(CounterProgram, { snapshots, rows, maybeCursor })
 * // Some('{"format":3,"programId":"counter","programVersion":5,...}')
 * ```
 */
export const encode = <Model>(
  program: SnapshotProgram<Model>,
  state: LocalState<Model>,
  scope?: LocalSnapshotScope,
): Option.Option<string> => {
  const ModelJson = S.toCodecJson(program.Model)
  const encodeModel = (model: Model) =>
    S.encodeSync(ModelJson)(stripForLocalSnapshot(program.Model.ast, model))
  return pipe(
    Result.try(() => ({
      snapshots: Array.map(state.snapshots, snapshot => ({
        watermark: snapshot.watermark,
        model: encodeModel(snapshot.model),
      })),
      ...(state.deviceModel === undefined
        ? {}
        : { deviceModel: encodeModel(state.deviceModel) }),
    })),
    Result.map(encoded =>
      JSON.stringify({
        format: storedFormat,
        programId: program.id,
        programVersion: program.version,
        ...(program.foldRevision === undefined
          ? {}
          : { foldRevision: program.foldRevision }),
        ...(scope === undefined ? {} : { scope }),
        ...Option.match(state.maybeCursor, {
          onNone: () => ({}),
          onSome: cursor => ({ cursor }),
        }),
        snapshots: encoded.snapshots,
        rows: state.rows,
        ...('deviceModel' in encoded
          ? { deviceModel: encoded.deviceModel }
          : {}),
      }),
    ),
    Result.getSuccess,
  )
}

/**
 * Decodes a device's local state. None for text from another Program,
 * version, `foldRevision`, `scope`, an old format, or a Model that no longer
 * decodes; the runtime then reads and folds the whole log instead.
 *
 * @example
 * ```typescript
 * LocalSnapshot.decode(CounterProgram, text)
 * // Some({ snapshots, rows, maybeCursor }) for version 5 text
 * // None after the Program moves to version 6
 * ```
 */
export const decode = <Model>(
  program: SnapshotProgram<Model>,
  text: string,
  expectedScope?: LocalSnapshotScope,
): Option.Option<LocalState<Model>> => {
  const ModelJson = S.toCodecJson(program.Model)
  return pipe(
    Result.try(() => JSON.parse(text)),
    Result.getSuccess,
    Option.flatMap(S.decodeUnknownOption(StoredState)),
    Option.filter(
      stored =>
        stored.programId === program.id &&
        stored.programVersion === program.version &&
        stored.foldRevision === program.foldRevision &&
        (expectedScope === undefined
          ? stored.scope === undefined
          : stored.scope !== undefined &&
            scopesEqual(stored.scope, expectedScope)),
    ),
    Option.flatMap(stored => {
      const maybeSnapshots = Option.all(
        Array.map(stored.snapshots, snapshot =>
          Option.map(
            S.decodeUnknownOption(ModelJson)(snapshot.model),
            (model): LocalSnapshot<Model> => ({
              model,
              watermark: snapshot.watermark,
            }),
          ),
        ),
      )
      const maybeDeviceModel =
        stored.deviceModel === undefined
          ? Option.some<Model | undefined>(undefined)
          : Option.map(
              S.decodeUnknownOption(ModelJson)(stored.deviceModel),
              (model): Model | undefined => model,
            )
      return Option.flatMap(
        Option.zipWith(
          maybeSnapshots,
          maybeDeviceModel,
          (snapshots, deviceModel) => ({ snapshots, deviceModel }),
        ),
        ({ snapshots, deviceModel }) =>
          Array.isReadonlyArrayEmpty(snapshots) && deviceModel === undefined
            ? Option.none<LocalState<Model>>()
            : Option.some<LocalState<Model>>({
                snapshots,
                rows: stored.rows,
                maybeCursor: Option.fromNullishOr(stored.cursor),
                ...(deviceModel === undefined ? {} : { deviceModel }),
              }),
      )
    }),
  )
}

/**
 * One shared snapshot entry stored in a 4-slot ring on the sync engine.
 * Carries a single folded Model (as stranger viewpoint), its exact Watermark,
 * and the server offset cursor as of that Watermark.
 */
export type SharedSnapshotEntry<Model> = Readonly<{
  model: Model
  watermark: Watermark
  cursor: string
}>

const sharedStoredFormat = 1

const StoredSharedSnapshot = S.Struct({
  format: S.Literal(sharedStoredFormat),
  programId: S.String,
  programVersion: S.Number,
  foldRevision: S.String,
  scope: S.optionalKey(LocalSnapshotScope),
  cursor: S.String,
  watermark: Watermark,
  model: S.Unknown,
})

/**
 * Encodes one shared snapshot entry for a 4-slot ring row. Returns `None` when
 * the Program has no `foldRevision` or its Model fails to encode.
 */
export const encodeShared = <Model>(
  program: SnapshotProgram<Model>,
  entry: SharedSnapshotEntry<Model>,
  scope?: LocalSnapshotScope,
): Option.Option<string> => {
  if (program.foldRevision === undefined || program.foldRevision === '') {
    return Option.none()
  }
  const ModelJson = S.toCodecJson(program.Model)
  return pipe(
    Result.try(() =>
      S.encodeSync(ModelJson)(
        stripForSharedSnapshot(
          program.Model.ast,
          entry.model,
          program.initialModel,
        ),
      ),
    ),
    Result.map(model =>
      JSON.stringify({
        format: sharedStoredFormat,
        programId: program.id,
        programVersion: program.version,
        foldRevision: program.foldRevision,
        ...(scope === undefined ? {} : { scope }),
        cursor: entry.cursor,
        watermark: entry.watermark,
        model,
      }),
    ),
    Result.getSuccess,
  )
}

/**
 * Decodes one shared snapshot entry. Rejects any mismatch in `programId`,
 * `programVersion`, `foldRevision`, or `scope`, and never decodes when the
 * Program declares no `foldRevision`.
 */
export const decodeShared = <Model>(
  program: SnapshotProgram<Model>,
  text: string,
  expectedScope?: LocalSnapshotScope,
): Option.Option<SharedSnapshotEntry<Model>> => {
  if (program.foldRevision === undefined || program.foldRevision === '') {
    return Option.none()
  }
  const ModelJson = S.toCodecJson(program.Model)
  return pipe(
    Result.try(() => JSON.parse(text)),
    Result.getSuccess,
    Option.flatMap(S.decodeUnknownOption(StoredSharedSnapshot)),
    Option.filter(
      stored =>
        stored.programId === program.id &&
        stored.programVersion === program.version &&
        stored.foldRevision === program.foldRevision &&
        (expectedScope === undefined
          ? stored.scope === undefined
          : stored.scope !== undefined &&
            scopesEqual(stored.scope, expectedScope)),
    ),
    Option.flatMap(stored =>
      Option.map(
        S.decodeUnknownOption(ModelJson)(stored.model),
        (model): SharedSnapshotEntry<Model> => ({
          model,
          watermark: stored.watermark,
          cursor: stored.cursor,
        }),
      ),
    ),
  )
}

// RATCHET

const byteLengthOf = (text: string): number =>
  new globalThis.TextEncoder().encode(text).byteLength

const syntheticWatermark: Watermark = {
  position: { createdAtMs: 1, id: 'invariance-check' },
  count: 1,
  fingerprint: fingerprintOf(['invariance-check']),
}

/**
 * Verifies that populating `loaded` and `ephemeral` fields changes neither
 * `LocalSnapshot.encode` nor `LocalSnapshot.encodeShared` (when `foldRevision`
 * is set) by even a single byte. Returns the encoded byte sizes so tests can
 * also enforce an upper-bound budget.
 *
 * @example
 * ```typescript
 * const { localBytes } = LocalSnapshot.assertSnapshotByteInvariance({
 *   program: { id: App.id, version: App.version, foldRevision: 'books-fold-v3', Model: App.Model, initialModel },
 *   baseline: initialModel,
 *   populated: populatedModel,
 * })
 * expect(localBytes).toBeLessThan(16 * 1024)
 * ```
 */
export const assertSnapshotByteInvariance = <Model>(
  config: Readonly<{
    program: SnapshotProgram<Model>
    baseline: Model
    populated: Model
    scope?: LocalSnapshotScope
  }>,
): Readonly<{
  localBytes: number
  sharedBytes: Option.Option<number>
}> => {
  const { program, baseline, populated, scope } = config
  const stateOf = (model: Model): LocalState<Model> => ({
    snapshots: [{ model, watermark: syntheticWatermark }],
    rows: [],
    maybeCursor: Option.none(),
    deviceModel: model,
  })
  const maybeBaseLocal = encode(program, stateOf(baseline), scope)
  const maybePopLocal = encode(program, stateOf(populated), scope)
  if (Option.isNone(maybeBaseLocal) || Option.isNone(maybePopLocal)) {
    throw new Error(
      '[foldkit] assertSnapshotByteInvariance: LocalSnapshot.encode returned None',
    )
  }
  const baseLocalBytes = byteLengthOf(maybeBaseLocal.value)
  const popLocalBytes = byteLengthOf(maybePopLocal.value)
  if (maybeBaseLocal.value !== maybePopLocal.value) {
    throw new Error(
      `[foldkit] Snapshot byte invariance violated for "${program.id}" (local): baseline ${String(baseLocalBytes)} bytes vs populated ${String(popLocalBytes)} bytes (delta ${String(popLocalBytes - baseLocalBytes)} bytes)`,
    )
  }

  let sharedBytes: Option.Option<number> = Option.none()
  if (program.foldRevision !== undefined && program.foldRevision !== '') {
    const entryOf = (model: Model): SharedSnapshotEntry<Model> => ({
      model,
      watermark: syntheticWatermark,
      cursor: 'cursor-0',
    })
    const maybeBaseShared = encodeShared(program, entryOf(baseline), scope)
    const maybePopShared = encodeShared(program, entryOf(populated), scope)
    if (Option.isNone(maybeBaseShared) || Option.isNone(maybePopShared)) {
      throw new Error(
        '[foldkit] assertSnapshotByteInvariance: LocalSnapshot.encodeShared returned None',
      )
    }
    const baseSharedBytes = byteLengthOf(maybeBaseShared.value)
    const popSharedBytes = byteLengthOf(maybePopShared.value)
    if (maybeBaseShared.value !== maybePopShared.value) {
      throw new Error(
        `[foldkit] Snapshot byte invariance violated for "${program.id}" (shared): baseline ${String(baseSharedBytes)} bytes vs populated ${String(popSharedBytes)} bytes (delta ${String(popSharedBytes - baseSharedBytes)} bytes)`,
      )
    }
    sharedBytes = Option.some(baseSharedBytes)
  }

  return { localBytes: baseLocalBytes, sharedBytes }
}
