import { Schema as S } from 'effect'

// IDS

/**
 * A book's id as Scribe names it, the id of its `things` row, such as
 * `9c0b4772-3f1e-5a0d-8c2b-6e4f1a7d9b30`. Branded, so an ISBN or a page
 * never stands in for it.
 */
export const BookId = S.String.check(S.isMinLength(1)).pipe(S.brand('BookId'))
/** A book's id as Scribe names it. */
export type BookId = typeof BookId.Type

/**
 * A book's ISBN-13: thirteen digits starting 978 or 979, such as
 * `9780063342705`.
 */
export const Isbn13 = S.String.check(S.isPattern(/^97[89]\d{10}$/u)).pipe(
  S.brand('Isbn13'),
)
/** A book's ISBN-13. */
export type Isbn13 = typeof Isbn13.Type

/**
 * A book's word in an address and a command: its ISBN-13 when it has one,
 * else its Scribe id. `9780063342705` in
 * `/books/read-aloud/9780063342705/page/4` and `read-aloud open
 * 9780063342705`.
 */
export const BookKey = S.String.check(
  S.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
).pipe(S.brand('BookKey'))
/** A book's word in an address and a command. */
export type BookKey = typeof BookKey.Type

/**
 * A page of a book as the reader counts them, from 1: `4` for the fourth
 * page. Branded, so a count or an index never stands in for a page.
 */
export const PageNumber = S.Int.check(S.isGreaterThanOrEqualTo(1)).pipe(
  S.brand('PageNumber'),
)
/** A page of a book as the reader counts them. */
export type PageNumber = typeof PageNumber.Type

/** A page as one URI segment or CLI word, `4` in `/page/4`. */
export const PageNumberSegment = S.FiniteFromString.pipe(S.decodeTo(PageNumber))

/** A book's first page, page 1, where a book opens when nobody is reading it. */
export const firstPage = PageNumber.make(1)

/**
 * One reading of a book, as Scribe names it: the id of the recognition
 * that spans the pages read in one sitting.
 */
export const ReadingId = S.String.check(S.isMinLength(1)).pipe(
  S.brand('ReadingId'),
)
/** One reading of a book. */
export type ReadingId = typeof ReadingId.Type

/**
 * One page turn, as Scribe names it: the id of the recognition for the
 * page the reader turned to.
 */
export const TurnId = S.String.check(S.isMinLength(1)).pipe(S.brand('TurnId'))
/** One page turn. */
export type TurnId = typeof TurnId.Type
