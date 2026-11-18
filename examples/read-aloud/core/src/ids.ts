import { Array, Option, Schema as S, String, pipe } from 'effect'

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

const nameTagPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

/**
 * A person's word in an address: a tag of their name, `ada-quill` in
 * `/books/authors/ada-quill`. Branded, so a title's slug or a book's key
 * never stands in for it.
 */
export const ContributorKey = S.String.check(S.isPattern(nameTagPattern)).pipe(
  S.brand('ContributorKey'),
)
/** A person's word in an address. */
export type ContributorKey = typeof ContributorKey.Type

/**
 * A publisher's word in an address: a tag of its name, `harbor-house` in
 * `/books/publishers/harbor-house`. Branded, so a person's tag never
 * stands in for it.
 */
export const PublisherKey = S.String.check(S.isPattern(nameTagPattern)).pipe(
  S.brand('PublisherKey'),
)
/** A publisher's word in an address. */
export type PublisherKey = typeof PublisherKey.Type

const combiningMarks = /\p{M}/gu

const runsOutsideTag = /[^a-z0-9]+/gu

const edgeHyphens = /^-+|-+$/gu

const blank = /^\s$/u

const codePointRadix = 16

const latinTagOf = (name: string): string =>
  pipe(
    name.normalize('NFKD'),
    String.toLowerCase,
    String.replace(combiningMarks, ''),
    String.replace(runsOutsideTag, '-'),
    String.replace(edgeHyphens, ''),
  )

const codePointTagOf = (name: string): string =>
  pipe(
    Array.fromIterable(name),
    Array.filter(character => !blank.test(character)),
    Array.map(character => Option.fromNullishOr(character.codePointAt(0))),
    Array.getSomes,
    Array.map(codePoint => codePoint.toString(codePointRadix)),
    Array.join('-'),
  )

const nameTagOf = (name: string): Option.Option<string> =>
  pipe(
    Option.liftPredicate(latinTagOf(name), String.isNonEmpty),
    Option.orElse(() =>
      Option.liftPredicate(codePointTagOf(name), String.isNonEmpty),
    ),
  )

/**
 * The tag an address names a person by: their name's words in lowercase,
 * joined by hyphens, with accents and stops dropped. A name with no Latin
 * letters or digits is tagged by its code points, so it still has a page.
 * None for a blank name.
 *
 * @example
 * ```typescript
 * contributorKeyOf('H. G. Marsh') // Some('h-g-marsh')
 * contributorKeyOf('Renée Lune') // Some('renee-lune')
 * contributorKeyOf('宮崎 駿') // Some('5bae-5d0e-99ff')
 * ```
 */
export const contributorKeyOf = (name: string): Option.Option<ContributorKey> =>
  Option.flatMap(nameTagOf(name), S.decodeUnknownOption(ContributorKey))

/**
 * The tag an address names a publisher by, made as a person's is.
 *
 * @example
 * ```typescript
 * publisherKeyOf('Harbor House, Inc.') // Some('harbor-house-inc')
 * ```
 */
export const publisherKeyOf = (name: string): Option.Option<PublisherKey> =>
  Option.flatMap(nameTagOf(name), S.decodeUnknownOption(PublisherKey))
