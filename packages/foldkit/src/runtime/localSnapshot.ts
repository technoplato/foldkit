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

/**
 * The fingerprint of a set of row ids: two order-free sums of 32-bit
 * hashes. `['m1', 'm2']` and `['m2', 'm1']` print the same fingerprint.
 */
export const fingerprintOf = (ids: ReadonlyArray<string>): string => {
  const sums = Array.reduce(ids, { first: 0, second: 0 }, (sum, id) => ({
    first: (sum.first + hashOf(id, firstSeed)) >>> 0,
    second: (sum.second + hashOf(id, secondSeed)) >>> 0,
  }))
  return `${sums.first.toString(36)}.${sums.second.toString(36)}`
}

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

const storedFormat = 1

const StoredSnapshot = S.Struct({
  format: S.Literal(storedFormat),
  programId: S.String,
  programVersion: S.Number,
  watermark: Watermark,
  model: S.Unknown,
})

/**
 * A Program's Model as of a watermark. The Model is the Program's own
 * type, encoded with its own Schema.
 */
export type LocalSnapshot<Model> = Readonly<{
  model: Model
  watermark: Watermark
}>

/**
 * The parts of a Program a local snapshot is keyed and encoded by. The
 * version is the Program's: a snapshot written by another version is
 * dropped and rebuilt from the log, which every version folds with its
 * own update, so a snapshot never needs migrating.
 */
export type SnapshotProgram<Model> = Readonly<{
  id: string
  version: number
  Model: ProgramSchema<Model>
}>

/**
 * Encodes a local snapshot as text, stamped with the Program's id and
 * version. None when the Model does not encode.
 *
 * @example
 * ```typescript
 * LocalSnapshot.encode(CounterProgram, { model: { count: 3 }, watermark })
 * // Some('{"format":1,"programId":"counter","programVersion":5,...}')
 * ```
 */
export const encode = <Model>(
  program: SnapshotProgram<Model>,
  snapshot: LocalSnapshot<Model>,
): Option.Option<string> =>
  pipe(
    Result.try(() =>
      S.encodeSync(S.toCodecJson(program.Model))(snapshot.model),
    ),
    Result.map(model =>
      JSON.stringify({
        format: storedFormat,
        programId: program.id,
        programVersion: program.version,
        watermark: snapshot.watermark,
        model,
      }),
    ),
    Result.getSuccess,
  )

/**
 * Decodes a local snapshot. None for text from another Program or
 * version, an old format, or a Model that no longer decodes; the runtime
 * then folds the log instead.
 *
 * @example
 * ```typescript
 * LocalSnapshot.decode(CounterProgram, text)
 * // Some({ model: { count: 3 }, watermark }) for version 5 text
 * // None after the Program moves to version 6
 * ```
 */
export const decode = <Model>(
  program: SnapshotProgram<Model>,
  text: string,
): Option.Option<LocalSnapshot<Model>> =>
  pipe(
    Result.try(() => JSON.parse(text)),
    Result.getSuccess,
    Option.flatMap(S.decodeUnknownOption(StoredSnapshot)),
    Option.filter(
      stored =>
        stored.programId === program.id &&
        stored.programVersion === program.version,
    ),
    Option.flatMap(stored =>
      Option.map(
        S.decodeUnknownOption(S.toCodecJson(program.Model))(stored.model),
        (model): LocalSnapshot<Model> => ({
          model,
          watermark: stored.watermark,
        }),
      ),
    ),
  )
