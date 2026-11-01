import { Array, Option, Predicate, Schema as S, pipe } from 'effect'

import { normalizeIssueId } from '@foldkit/instant-tools/issues'

/** A text field Instant may leave out or answer as null. */
export const OptionalText = S.optionalKey(S.NullOr(S.String))
/** A number field Instant may leave out or answer as null. */
export const OptionalNumber = S.optionalKey(S.NullOr(S.Number))

/** A link Instant answers as its one row, a list of rows, or nothing. */
export const manyOf = <Row extends S.Top>(row: Row) =>
  S.optionalKey(S.NullOr(S.Union([row, S.Array(row)])))

const isList = <A>(value: A | ReadonlyArray<A>): value is ReadonlyArray<A> =>
  globalThis.Array.isArray(value)

/** A link's rows, however Instant answered with them. */
export const listOf = <A>(
  value: A | ReadonlyArray<A> | null | undefined,
): ReadonlyArray<A> => {
  if (value === null || value === undefined) {
    return []
  } else if (isList(value)) {
    return value
  } else {
    return [value]
  }
}

/** An Issue's number as the tracker's id: `41` is `041`, `1538` is `1538`. */
export const issueIdOfNumber = (issueNumber: number): string =>
  Option.getOrElse(normalizeIssueId(issueNumber.toString()), () =>
    issueNumber.toString(),
  )

const numbersOfJson = (
  stored: string | null | undefined,
): ReadonlyArray<number> =>
  pipe(
    Option.fromNullishOr(stored),
    Option.flatMap(
      Option.liftThrowable((text: string): unknown => JSON.parse(text)),
    ),
    Option.flatMap(S.decodeUnknownOption(S.Array(S.Number))),
    Option.getOrElse((): ReadonlyArray<number> => []),
  )

/**
 * The tracker ids a row names, once each: a first number and a JSON list, such
 * as `issueNumber: 1538` and `issueNumbersJSON: '[1538,41]'`, name `1538` and
 * `041`. Words that are not a list of numbers name nothing.
 */
export const issueIdsOf = (
  maybeFirst: number | null | undefined,
  stored: string | null | undefined,
): ReadonlyArray<string> =>
  pipe(
    [maybeFirst, ...numbersOfJson(stored)],
    Array.filter(Predicate.isNumber),
    Array.dedupe,
    Array.map(issueIdOfNumber),
  )

const isSameStored = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean => {
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every(key => left[key] === right[key])
  )
}

/** One row of a table as Instant answers with it. */
export type StoredRow = Readonly<Record<string, unknown>>

const isStoredRow = (value: unknown): value is StoredRow =>
  Predicate.isObject(value)

/**
 * A table's rows as Instant answers with them, before each is read: a row is
 * checked to be an object and read field by field only when it changed.
 */
export const StoredRows = S.Array(S.declare(isStoredRow))

type KeptRow<Row> = Readonly<{ row: Row; stored: StoredRow }>

/**
 * A read of a table that keeps the value of each row whose fields did not
 * change. Instant restates a query's whole answer on any change, so without
 * this one new question decodes all 964 and misses every row a page remembers.
 * Answer with the same row twice and the second read does no decoding.
 */
export const keptRowsOf = <Row>(
  decodeRow: (stored: StoredRow) => Row,
): ((stored: ReadonlyArray<StoredRow>) => ReadonlyArray<Row>) => {
  let held = new Map<unknown, KeptRow<Row>>()
  return stored => {
    const next = new Map<unknown, KeptRow<Row>>()
    const rows = stored.map(row => {
      const kept = held.get(row['id'])
      const keptRow =
        kept !== undefined && isSameStored(kept.stored, row)
          ? kept
          : { row: decodeRow(row), stored: row }
      next.set(row['id'], keptRow)
      return keptRow.row
    })
    held = next
    return rows
  }
}
