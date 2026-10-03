import { Array, Effect, Option, Order, Result, Schema as S, pipe } from 'effect'

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
  load: Effect.Effect<Option.Option<string>>
  save: (text: string) => Effect.Effect<void>
}>

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
    peek: () => maybeSaved,
  }
}

/**
 * A store in Web Storage under one key, such as `window.localStorage`.
 * A full or blocked storage never fails the Program; the snapshot is
 * only a cache.
 *
 * @example
 * ```typescript
 * LocalSnapshot.webStorage(window.localStorage, 'foldkit-counter')
 * ```
 */
export const webStorage = (
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
): LocalSnapshotStore => ({
  load: Effect.sync(() => Option.fromNullishOr(storage.getItem(key))).pipe(
    Effect.catchCause(() => Effect.succeed(Option.none<string>())),
  ),
  save: text =>
    Effect.sync(() => {
      storage.setItem(key, text)
    }).pipe(Effect.catchCause(() => Effect.void)),
})

/**
 * A store over any promise-based key-value API, such as React Native's
 * AsyncStorage or a file on Node. A failed read or write never fails the
 * Program; the snapshot is only a cache.
 *
 * @example
 * ```typescript
 * LocalSnapshot.fromPromises({
 *   load: () => AsyncStorage.getItem('foldkit-counter'),
 *   save: text => AsyncStorage.setItem('foldkit-counter', text),
 * })
 * ```
 */
export const fromPromises = (
  config: Readonly<{
    load: () => Promise<string | null | undefined>
    save: (text: string) => Promise<void>
  }>,
): LocalSnapshotStore => ({
  load: Effect.tryPromise(config.load).pipe(
    Effect.map(Option.fromNullishOr),
    Effect.catchCause(() => Effect.succeed(Option.none<string>())),
  ),
  save: text =>
    Effect.tryPromise(() => config.save(text)).pipe(
      Effect.catchCause(() => Effect.void),
    ),
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
  snapshots: Array.NonEmptyReadonlyArray<LocalSnapshot<Model>>
  rows: ReadonlyArray<unknown>
  maybeCursor: Option.Option<string>
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
  Model: ProgramSchema<Model>
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

const storedFormat = 2

const StoredSnapshot = S.Struct({
  watermark: Watermark,
  model: S.Unknown,
})

const StoredState = S.Struct({
  format: S.Literal(storedFormat),
  programId: S.String,
  programVersion: S.Number,
  cursor: S.optionalKey(S.String),
  snapshots: S.NonEmptyArray(StoredSnapshot),
  rows: S.Array(S.Unknown),
})

/**
 * Encodes a device's local state as text, stamped with the Program's id
 * and version. None when a Model does not encode.
 *
 * @example
 * ```typescript
 * LocalSnapshot.encode(CounterProgram, { snapshots, rows, maybeCursor })
 * // Some('{"format":2,"programId":"counter","programVersion":5,...}')
 * ```
 */
export const encode = <Model>(
  program: SnapshotProgram<Model>,
  state: LocalState<Model>,
): Option.Option<string> => {
  const ModelJson = S.toCodecJson(program.Model)
  return pipe(
    Result.try(() =>
      Array.map(state.snapshots, snapshot => ({
        watermark: snapshot.watermark,
        model: S.encodeSync(ModelJson)(snapshot.model),
      })),
    ),
    Result.map(snapshots =>
      JSON.stringify({
        format: storedFormat,
        programId: program.id,
        programVersion: program.version,
        ...Option.match(state.maybeCursor, {
          onNone: () => ({}),
          onSome: cursor => ({ cursor }),
        }),
        snapshots,
        rows: state.rows,
      }),
    ),
    Result.getSuccess,
  )
}

/**
 * Decodes a device's local state. None for text from another Program or
 * version, an old format, or a Model that no longer decodes; the runtime
 * then reads and folds the whole log instead.
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
): Option.Option<LocalState<Model>> => {
  const ModelJson = S.toCodecJson(program.Model)
  return pipe(
    Result.try(() => JSON.parse(text)),
    Result.getSuccess,
    Option.flatMap(S.decodeUnknownOption(StoredState)),
    Option.filter(
      stored =>
        stored.programId === program.id &&
        stored.programVersion === program.version,
    ),
    Option.flatMap(stored =>
      pipe(
        Option.all(
          Array.map(stored.snapshots, snapshot =>
            Option.map(
              S.decodeUnknownOption(ModelJson)(snapshot.model),
              (model): LocalSnapshot<Model> => ({
                model,
                watermark: snapshot.watermark,
              }),
            ),
          ),
        ),
        Option.flatMap(snapshots =>
          Array.match(snapshots, {
            onEmpty: () => Option.none<LocalState<Model>>(),
            onNonEmpty: nonEmpty =>
              Option.some({
                snapshots: nonEmpty,
                rows: stored.rows,
                maybeCursor: Option.fromNullishOr(stored.cursor),
              }),
          }),
        ),
      ),
    ),
  )
}
