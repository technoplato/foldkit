import { Schema as S } from 'effect'

export {
  MediaId,
  Milliseconds,
  Speed,
  SpeedToken,
  clockOf,
} from 'transcript-player-core-example'

// IDS

/**
 * A title's name tag in every address and command: `the-lantern-keeper`
 * in `/books/the-lantern-keeper` and `books play the-lantern-keeper`.
 * Branded, so a plain string cannot pass for a title.
 */
export const TitleSlug = S.String.check(
  S.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
).pipe(S.brand('TitleSlug'))
/** A title's name tag. */
export type TitleSlug = typeof TitleSlug.Type

/**
 * A chapter's place in its title, `3` for Chapter 3. Branded, so a count
 * or a millisecond can never stand in for a chapter.
 */
export const ChapterNumber = S.Int.check(S.isGreaterThanOrEqualTo(1)).pipe(
  S.brand('ChapterNumber'),
)
/** A chapter's place in its title. */
export type ChapterNumber = typeof ChapterNumber.Type

/** A chapter number as one URI segment or CLI word, `3` in `/chapters/3`. */
export const ChapterNumberSegment = S.FiniteFromString.pipe(
  S.decodeTo(ChapterNumber),
)

/** A bookmark's id, as the library store names it. */
export const BookmarkId = S.String.check(S.isMinLength(1)).pipe(
  S.brand('BookmarkId'),
)
/** A bookmark's id. */
export type BookmarkId = typeof BookmarkId.Type
