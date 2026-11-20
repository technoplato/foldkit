import {
  Array,
  Match as M,
  Number,
  Option,
  Order,
  Record,
  Schema as S,
  String,
} from 'effect'

import type { Counts } from './count'

// LEDGER

/**
 * Why one count was allowed to rise. `to` is the count the reason covers:
 * `{ kind: 'numbers', from: 14, to: 15, why: 'padding: 24 on the sheet, a layout number' }`.
 */
export const Rise = S.Struct({
  kind: S.String,
  from: S.Number,
  to: S.Number,
  why: S.String,
})
/** Why one count was allowed to rise. */
export type Rise = typeof Rise.Type

/**
 * What the ledger says of one file: its counts, a note for whoever reads
 * it next, and the reason for each rise.
 */
export const Entry = S.Struct({
  counts: S.Record(S.String, S.Number),
  note: S.optionalKey(S.String),
  rises: S.optionalKey(S.Array(Rise)),
})
/** What the ledger says of one file. */
export type Entry = typeof Entry.Type

/**
 * The checked-in counts: `about` says what the file is for, and `files`
 * holds one entry per file that counts above zero. A file not listed
 * counts zero.
 *
 * @example
 * ```typescript
 * const ledger: Ledger = {
 *   about: ['Counts per painter file.'],
 *   files: { 'packages/react/src/paintReact/paintReact.tsx': { counts: { timers: 4 } } },
 * }
 * ```
 */
export const Ledger = S.Struct({
  about: S.Array(S.String),
  files: S.Record(S.String, Entry),
})
/** The checked-in counts. */
export type Ledger = typeof Ledger.Type

/** The ledger as the text of its JSON file. */
export const LedgerJson = S.fromJsonString(Ledger)

/** What was counted in the code as it is now, by file: `{ 'a.ts': { timers: 1 } }`. */
export type Measured = Readonly<Record<string, Counts>>

// PROBLEM

/** The code holds more than the ledger says: a rule was added to a painter. */
export const Grew = S.TaggedStruct('Grew', {
  file: S.String,
  kind: S.String,
  recorded: S.Number,
  measured: S.Number,
})

/** The code holds less than the ledger says: the lower count is not recorded yet. */
export const Fell = S.TaggedStruct('Fell', {
  file: S.String,
  kind: S.String,
  recorded: S.Number,
  measured: S.Number,
})

/** The ledger's count is higher than the commit before said, and no rise says why. */
export const Unexplained = S.TaggedStruct('Unexplained', {
  file: S.String,
  kind: S.String,
  before: S.Number,
  recorded: S.Number,
})

/** Everything that fails the ratchet. */
export const Problem = S.Union([Grew, Fell, Unexplained])
/** Everything that fails the ratchet. */
export type Problem = typeof Problem.Type

// READ

const countOf = (counts: Counts, kind: string): number =>
  Option.getOrElse(Record.get(counts, kind), () => 0)

const NO_COUNTS: Counts = {}

const recordedOf = (ledger: Ledger, file: string): Counts =>
  Option.match(Record.get(ledger.files, file), {
    onNone: () => NO_COUNTS,
    onSome: entry => entry.counts,
  })

const measuredOf = (measured: Measured, file: string): Counts =>
  Option.getOrElse(Record.get(measured, file), () => NO_COUNTS)

const risesOf = (ledger: Ledger, file: string): ReadonlyArray<Rise> =>
  Option.match(Record.get(ledger.files, file), {
    onNone: () => [],
    onSome: entry => entry.rises ?? [],
  })

const sorted = (names: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.sort(Array.dedupe(names), Order.String)

const isExplained = (
  rises: ReadonlyArray<Rise>,
  kind: string,
  recorded: number,
): boolean =>
  Array.some(
    rises,
    rise =>
      rise.kind === kind &&
      rise.to >= recorded &&
      String.isNonEmpty(String.trim(rise.why)),
  )

// CHECK

const codeProblemsOf = (
  measured: Measured,
  ledger: Ledger,
  file: string,
): ReadonlyArray<Problem> => {
  const inCode = measuredOf(measured, file)
  const inLedger = recordedOf(ledger, file)
  return Array.flatMap(
    sorted([...Record.keys(inCode), ...Record.keys(inLedger)]),
    (kind): ReadonlyArray<Problem> => {
      const counts = {
        file,
        kind,
        recorded: countOf(inLedger, kind),
        measured: countOf(inCode, kind),
      }
      if (counts.measured > counts.recorded) {
        return [Grew.make(counts)]
      } else if (counts.measured < counts.recorded) {
        return [Fell.make(counts)]
      } else {
        return []
      }
    },
  )
}

const ledgerProblemsOf = (
  ledger: Ledger,
  before: Ledger,
  file: string,
): ReadonlyArray<Problem> => {
  const inLedger = recordedOf(ledger, file)
  const inBefore = recordedOf(before, file)
  return Array.flatMap(sorted(Record.keys(inLedger)), kind => {
    const recorded = countOf(inLedger, kind)
    const was = countOf(inBefore, kind)
    if (recorded > was && !isExplained(risesOf(ledger, file), kind, recorded)) {
      return [Unexplained.make({ file, kind, before: was, recorded })]
    } else {
      return []
    }
  })
}

/**
 * Everything that fails the ratchet. The code may not hold more than the
 * ledger says, and a file the ledger does not list counts zero. The ledger
 * may not say more than an earlier ledger did, unless a rise beside the
 * count says why. A count that fell fails too, until it is written down,
 * so a count never drifts back up for free.
 *
 * @example
 * ```typescript
 * problemsOf({
 *   measured: { 'paintReact.tsx': { timers: 5 } },
 *   ledger: { about: [], files: { 'paintReact.tsx': { counts: { timers: 4 } } } },
 *   earlier: [],
 * })
 * // [Grew({ file: 'paintReact.tsx', kind: 'timers', recorded: 4, measured: 5 })]
 * ```
 */
export const problemsOf = (
  input: Readonly<{
    measured: Measured
    ledger: Ledger
    earlier: ReadonlyArray<Ledger>
  }>,
): ReadonlyArray<Problem> => {
  const files = sorted([
    ...Record.keys(input.measured),
    ...Record.keys(input.ledger.files),
  ])
  return [
    ...Array.flatMap(files, file =>
      codeProblemsOf(input.measured, input.ledger, file),
    ),
    ...Array.dedupe(
      Array.flatMap(input.earlier, before =>
        Array.flatMap(sorted(Record.keys(input.ledger.files)), file =>
          ledgerProblemsOf(input.ledger, before, file),
        ),
      ),
    ),
  ]
}

// WRITE

const keptRisesOf = (
  rises: ReadonlyArray<Rise>,
  counts: Counts,
): ReadonlyArray<Rise> =>
  Array.flatMap(rises, rise => {
    const count = countOf(counts, rise.kind)
    if (count > rise.from) {
      return [{ ...rise, to: Number.min(rise.to, count) }]
    } else {
      return []
    }
  })

const isAboveZero = (counts: Counts): boolean =>
  Array.some(Record.values(counts), count => count > 0)

const entryOf = (
  ledger: Ledger,
  measured: Measured,
  file: string,
): Option.Option<Entry> => {
  const counts = measuredOf(measured, file)
  const maybeNote = Option.flatMap(Record.get(ledger.files, file), entry =>
    Option.fromNullishOr(entry.note),
  )
  const rises = keptRisesOf(risesOf(ledger, file), counts)
  if (isAboveZero(counts) || Option.isSome(maybeNote)) {
    return Option.some({
      counts,
      ...Option.match(maybeNote, {
        onNone: () => ({}),
        onSome: note => ({ note }),
      }),
      ...(Array.isReadonlyArrayNonEmpty(rises) ? { rises } : {}),
    })
  } else {
    return Option.none()
  }
}

const pairOf = (file: string, entry: Entry): readonly [string, Entry] => [
  file,
  entry,
]

/**
 * The ledger with its counts set to what the code holds now. Notes stay.
 * A rise stays while its count is still above where it rose from, and its
 * `to` comes down with the count. A file that counts zero and has no note
 * leaves the ledger.
 *
 * @example
 * ```typescript
 * rewritten(
 *   { about: [], files: { 'a.ts': { counts: { timers: 4 } } } },
 *   { 'a.ts': { timers: 3 } },
 * )
 * // { about: [], files: { 'a.ts': { counts: { timers: 3 } } } }
 * ```
 */
export const rewritten = (ledger: Ledger, measured: Measured): Ledger => ({
  about: ledger.about,
  files: Record.fromEntries(
    Array.flatMap(
      sorted([...Record.keys(measured), ...Record.keys(ledger.files)]),
      file =>
        Option.match(entryOf(ledger, measured, file), {
          onNone: () => [],
          onSome: entry => [pairOf(file, entry)],
        }),
    ),
  ),
})

// SAY

/**
 * How many of each kind the ledger's files hold together:
 * `{ timers: 41, heldState: 212, listeners: 96, numbers: 480 }`.
 */
export const totalsOf = (ledger: Ledger): Counts =>
  Array.reduce(Record.values(ledger.files), NO_COUNTS, (totals, entry) =>
    Record.union(totals, entry.counts, (left, right) => left + right),
  )

/**
 * One problem as a line a person can act on.
 *
 * @example
 * ```typescript
 * lineOf(Grew.make({ file: 'paintReact.tsx', kind: 'timers', recorded: 4, measured: 5 }))
 * // 'paintReact.tsx: timers rose from 4 to 5'
 * ```
 */
export const lineOf = (problem: Problem): string =>
  M.value(problem).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Grew: ({ file, kind, recorded, measured }) =>
        `${file}: ${kind} rose from ${recorded} to ${measured}`,
      Fell: ({ file, kind, recorded, measured }) =>
        `${file}: ${kind} fell from ${recorded} to ${measured}, and the ledger still says ${recorded}`,
      Unexplained: ({ file, kind, before, recorded }) =>
        `${file}: the ledger raises ${kind} from ${before} to ${recorded} with no rise that says why`,
    }),
  )
