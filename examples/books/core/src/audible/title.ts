import { Schema as S } from 'effect'

import { Milliseconds } from '../ids.js'

// TITLE

/**
 * An Audible title's Amazon Standard Identification Number, ten capital
 * letters and digits: `B002V0RAUU` for A New Earth. It is the one id an
 * Audible title keeps everywhere, so the import matches books by it.
 * Branded, so a slug or a name never stands in for one.
 */
export const Asin = S.String.check(S.isPattern(/^[A-Z0-9]{10}$/)).pipe(
  S.brand('Asin'),
)
/** An Audible title's ASIN. */
export type Asin = typeof Asin.Type

/**
 * One series a title belongs to, and where in it, when Audible says:
 * `Dune Chronicles`, book `1`.
 */
export const SeriesPart = S.Struct({
  name: S.String,
  maybeSequence: S.Option(S.String),
})
/** One series a title belongs to. */
export type SeriesPart = typeof SeriesPart.Type

/**
 * Whether the shelf already has an Audible title: `New`, or `InLibrary`
 * when a book there carries the same ASIN, such as A New Earth.
 */
export const ShelfMatch = S.Literals(['New', 'InLibrary'])
/** Whether the shelf already has an Audible title. */
export type ShelfMatch = typeof ShelfMatch.Type

/**
 * One audiobook in a family member's Audible library, as Audible lists
 * it: its ASIN, title and subtitle, who wrote and reads it, its series,
 * its cover on Amazon, and how long it runs. Metadata only: nothing here
 * plays.
 *
 * @example
 * ```typescript
 * ListedTitle.make({ asin: Asin.make('B0FAKE0001'), name: 'The Quiet Orchard', maybeSubtitle: Option.none(), authors: ['Mara Linden'], narrators: ['Ezra Vale'], series: [], maybeCoverUrl: Option.none(), maybeRuntimeMs: Option.some(Milliseconds.make(36_000_000)) })
 * ```
 */
export const ListedTitle = S.Struct({
  asin: Asin,
  name: S.String,
  maybeSubtitle: S.Option(S.String),
  authors: S.Array(S.String),
  narrators: S.Array(S.String),
  series: S.Array(SeriesPart),
  maybeCoverUrl: S.Option(S.String),
  maybeRuntimeMs: S.Option(Milliseconds),
})
/** One audiobook in a family member's Audible library. */
export type ListedTitle = typeof ListedTitle.Type

/**
 * Something the importer notes about a title it imports: `Free`, such as
 * a complimentary Audible Original, and `Explicit`, an adult title it
 * marks explicit.
 */
export const TitleMark = S.Literals(['Free', 'Explicit'])
/** Something the importer notes about a title it imports. */
export type TitleMark = typeof TitleMark.Type

/**
 * One audiobook a family member owns on Audible, as the import shows it:
 * its listing, whether the shelf already has it, `match: 'InLibrary'`
 * for A New Earth when it is already there, and what the importer notes
 * about it.
 */
export const AudibleTitle = S.Struct({
  ...ListedTitle.fields,
  match: ShelfMatch,
  marks: S.Array(TitleMark),
})
/** One audiobook a family member owns on Audible, as the import shows it. */
export type AudibleTitle = typeof AudibleTitle.Type

/**
 * Why the importer leaves an Audible title out: a podcast, an Audible
 * Plus loan, which the family member borrows rather than owns, a part of
 * a book that comes in whole, a second edition of a book, or another
 * reason, such as a row on the shelf it must not touch.
 */
export const SkipKind = S.Literals([
  'Podcast',
  'AudiblePlusLoan',
  'Part',
  'Duplicate',
  'Other',
])
/** Why the importer leaves an Audible title out. */
export type SkipKind = typeof SkipKind.Type

/** How many titles the importer leaves out for one reason: 4 podcasts. */
export const SkippedCount = S.Struct({
  kind: SkipKind,
  count: S.Int.check(S.isGreaterThanOrEqualTo(1)),
})
/** How many titles the importer leaves out for one reason. */
export type SkippedCount = typeof SkippedCount.Type

/** How many imported titles carry one mark: 3 free titles. */
export const MarkedCount = S.Struct({
  mark: TitleMark,
  count: S.Int.check(S.isGreaterThanOrEqualTo(1)),
})
/** How many imported titles carry one mark. */
export type MarkedCount = typeof MarkedCount.Type

/**
 * What the library has no place for yet, so an import leaves it out: the
 * publisher, the series name, the full release date (the year stays), and
 * contributors credited with a role, such as a foreword.
 */
export const LeftOutField = S.Literals([
  'Publisher',
  'SeriesName',
  'ReleaseDate',
  'Contributors',
])
/** What the library has no place for yet. */
export type LeftOutField = typeof LeftOutField.Type

/**
 * Which part of an import is running: reading each title's chapters from
 * Audible, then adding the books to the library.
 */
export const ImportStage = S.Literals(['ReadingChapters', 'AddingBooks'])
/** Which part of an import is running. */
export type ImportStage = typeof ImportStage.Type

/**
 * How far an import is: `done` of `total` through one stage. While it
 * reads chapters they count titles, such as 12 of 40 titles' chapters
 * read; while it adds books they count the importer's steps, such as 3 of
 * 8 writes, which the screen shows as a share, 38%.
 */
export const ImportProgress = S.Struct({
  stage: ImportStage,
  done: S.Int.check(S.isGreaterThanOrEqualTo(0)),
  total: S.Int.check(S.isGreaterThanOrEqualTo(0)),
})
/** How far an import is. */
export type ImportProgress = typeof ImportProgress.Type

/** One title an import could not add, and why, safe to show. */
export const NotAddedTitle = S.Struct({
  asin: Asin,
  name: S.String,
  reason: S.String,
})
/** One title an import could not add. */
export type NotAddedTitle = typeof NotAddedTitle.Type

/**
 * What an import did: how many titles it added, how many it matched to a
 * book already on the shelf, the ones it could not add, the marks it put
 * on the ones it imported, and what it had no place for. `Added 37,
 * matched 3` with 3 free titles is
 * `{ added: 37, matched: 3, notAdded: [], marked: [{ mark: 'Free', count: 3 }], leftOut: ['Publisher'] }`.
 */
export const ImportSummary = S.Struct({
  added: S.Int.check(S.isGreaterThanOrEqualTo(0)),
  matched: S.Int.check(S.isGreaterThanOrEqualTo(0)),
  notAdded: S.Array(NotAddedTitle),
  marked: S.Array(MarkedCount),
  leftOut: S.Array(LeftOutField),
})
/** What an import did. */
export type ImportSummary = typeof ImportSummary.Type
