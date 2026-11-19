import { Array, Equal, Option, Stream } from 'effect'

// ROWS

/**
 * What changed in a list of rows: the rows that are new or read
 * differently, whole, and the keys of the rows that are gone. A Client
 * that holds the list applies it with {@link appliedRowChanges}.
 *
 * @example
 * ```typescript
 * // one saved place, in a library of sixty-five titles
 * { changed: [{ slug: 'the-lantern-keeper', placeMs: 723_000 }], removed: [] }
 * ```
 */
export type RowChanges<Row> = Readonly<{
  changed: ReadonlyArray<Row>
  removed: ReadonlyArray<string>
}>

/** Whether anything changed: a row is new or different, or one is gone. */
export const hasRowChanges = <Row>(changes: RowChanges<Row>): boolean =>
  Array.isReadonlyArrayNonEmpty(changes.changed) ||
  Array.isReadonlyArrayNonEmpty(changes.removed)

/**
 * What changed from one list of rows to the next, by each row's key. Two
 * rows are the same when they read the same, field for field, unless
 * `isSame` says otherwise; a store hands over new objects each time, so
 * being another object is never a change.
 *
 * @example
 * ```typescript
 * rowChangesBetween(before, after, place => place.slug)
 * // { changed: [the one place that moved], removed: [] }
 * ```
 */
export const rowChangesBetween = <Row>(
  previous: ReadonlyArray<Row>,
  next: ReadonlyArray<Row>,
  keyOf: (row: Row) => string,
  isSame: (self: Row, that: Row) => boolean = Equal.equals,
): RowChanges<Row> => {
  const before = new Map(Array.map(previous, row => [keyOf(row), row] as const))
  const after = new Set(Array.map(next, keyOf))
  return {
    changed: Array.filter(next, row =>
      Option.match(Option.fromNullishOr(before.get(keyOf(row))), {
        onNone: () => true,
        onSome: held => !isSame(held, row),
      }),
    ),
    removed: Array.filter(Array.map(previous, keyOf), key => !after.has(key)),
  }
}

/**
 * A list with its changes applied: each changed row takes the place of
 * the row with its key, a new row goes last, and a removed row is gone.
 * Rows that did not change stay the same objects, and a list nothing
 * changed in is returned as it is, so a painter that compares by identity
 * redraws only what changed.
 *
 * @example
 * ```typescript
 * appliedRowChanges(places, { changed: [moved], removed: [] }, place => place.slug)
 * ```
 */
export const appliedRowChanges = <Row>(
  rows: ReadonlyArray<Row>,
  changes: RowChanges<Row>,
  keyOf: (row: Row) => string,
): ReadonlyArray<Row> => {
  if (!hasRowChanges(changes)) {
    return rows
  }
  const changed = new Map(
    Array.map(changes.changed, row => [keyOf(row), row] as const),
  )
  const removed = new Set(changes.removed)
  const held = new Set(Array.map(rows, keyOf))
  return [
    ...Array.map(
      Array.filter(rows, row => !removed.has(keyOf(row))),
      row => changed.get(keyOf(row)) ?? row,
    ),
    ...Array.filter(changes.changed, row => !held.has(keyOf(row))),
  ]
}

/**
 * A stream of whole lists as what changed in each: every row of the first
 * list, then for each later list only its changes, and nothing at all for
 * a list that reads the same as the one before. It is how a store that
 * can only hand over a whole result, as a live query does, sends a Client
 * the rows that changed.
 *
 * @example
 * ```typescript
 * changedRows(store.places, place => place.slug)
 * ```
 */
export const changedRows = <Row, E, R>(
  lists: Stream.Stream<ReadonlyArray<Row>, E, R>,
  keyOf: (row: Row) => string,
  isSame: (self: Row, that: Row) => boolean = Equal.equals,
): Stream.Stream<RowChanges<Row>, E, R> =>
  lists.pipe(
    Stream.mapAccum(
      (): Option.Option<ReadonlyArray<Row>> => Option.none(),
      (maybePrevious, next) => {
        const changes = Option.match(maybePrevious, {
          onNone: (): RowChanges<Row> => ({ changed: next, removed: [] }),
          onSome: previous => rowChangesBetween(previous, next, keyOf, isSame),
        })
        return [
          Option.some(next),
          Option.isNone(maybePrevious) || hasRowChanges(changes)
            ? [changes]
            : [],
        ] as const
      },
    ),
  )
