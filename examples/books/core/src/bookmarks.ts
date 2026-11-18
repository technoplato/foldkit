import { Array, Option, Order, Schema as S, pipe } from 'effect'
import * as TranscriptPlayer from 'transcript-player-core-example'

import {
  BookmarkId,
  type ChapterNumber,
  Milliseconds,
  TitleSlug,
  clockOf,
} from './ids.js'
import { wordPathOf } from './links.js'
import {
  type Bookmark,
  type BookmarkExcerpt,
  type Chapter,
  type Model,
  bookmarksOf,
  chapterAt,
  chaptersOf,
  titleOf,
} from './model.js'
import { shownTitleOf } from './stack.js'

// BOOKMARKS

const excerptWordsEachSide = 8

const wordGap = ' '

const trailingOff = '…'

type Passages = ReadonlyArray<TranscriptPlayer.Passage>

const passageAt = (
  passages: Passages,
  placeMs: Milliseconds,
): Option.Option<TranscriptPlayer.Passage> =>
  Array.findFirst(
    passages,
    passage => passage.startMs <= placeMs && placeMs < passage.endMs,
  )

const textOf = (words: ReadonlyArray<TranscriptPlayer.Word>): string =>
  Array.join(
    Array.map(words, word => word.text),
    wordGap,
  )

/**
 * The words around the word at a place, as a bookmark keeps them: the
 * word, and up to eight before and after it in its paragraph. None where
 * no words are loaded.
 *
 * @example
 * ```typescript
 * excerptAround(passages, Milliseconds.make(1_234_000))
 * // Some({ before: 'the time the survey party reached the pass the', word: 'snow', after: 'had closed the lower road and Ilse counted' })
 * ```
 */
export const excerptAround = (
  passages: Passages,
  placeMs: Milliseconds,
): Option.Option<BookmarkExcerpt> =>
  Option.flatMap(passageAt(passages, placeMs), passage =>
    Option.flatMap(
      Array.findLastIndex(passage.words, word => word.startMs <= placeMs),
      index =>
        Option.map(Array.get(passage.words, index), word => ({
          before: textOf(
            Array.takeRight(
              Array.take(passage.words, index),
              excerptWordsEachSide,
            ),
          ),
          word: word.text,
          after: textOf(
            Array.take(
              Array.drop(passage.words, index + 1),
              excerptWordsEachSide,
            ),
          ),
        })),
    ),
  )

/**
 * The millisecond a bookmark at a place is kept on: the start of the word
 * being spoken there, so it is the address a link to that word carries,
 * or the place itself where no words are loaded.
 */
export const bookmarkPlaceAt = (
  passages: Passages,
  placeMs: Milliseconds,
): Milliseconds =>
  Option.match(TranscriptPlayer.wordAt(passages, placeMs), {
    onNone: () => placeMs,
    onSome: word => word.startMs,
  })

/**
 * A bookmark's words on one line, trailing off where the paragraph goes
 * on: `…the pass the snow had closed…`.
 */
export const excerptLineOf = (excerpt: BookmarkExcerpt): string =>
  Array.join(
    [
      ...(excerpt.before === '' ? [] : [`${trailingOff}${excerpt.before}`]),
      excerpt.word,
      ...(excerpt.after === '' ? [] : [`${excerpt.after}${trailingOff}`]),
    ],
    wordGap,
  )

/**
 * How a bookmark reads in a list: its words, or its time when it kept
 * none, `Bookmark at 1:01:00`.
 */
export const bookmarkTitleOf = (bookmark: Bookmark): string =>
  Option.match(bookmark.maybeExcerpt, {
    onNone: () => `Bookmark at ${clockOf(bookmark.atMs)}`,
    onSome: excerptLineOf,
  })

/**
 * The address of a bookmark: the link to its word, `wordPathOf`, since a
 * bookmark sits on the millisecond its word starts.
 *
 * @example
 * ```typescript
 * bookmarkPathOf(slug, Milliseconds.make(723_450)) // '/books/the-lantern-keeper/listen/12m03.45s'
 * ```
 */
export const bookmarkPathOf = wordPathOf

/** What the player says when the word asked for already has a bookmark. */
export const alreadyBookmarkedNotice = 'That word is already bookmarked'

/** `1 bookmark`, `3 bookmarks`. */
export const bookmarkCountWords = (count: number): string =>
  count === 1 ? '1 bookmark' : `${count.toString()} bookmarks`

/**
 * How many bookmarks each chapter holds, for the chapters that hold some.
 *
 * @example
 * ```typescript
 * bookmarkCountsOf(chapters, bookmarks) // Map { 2 => 2, 4 => 1 }
 * ```
 */
export const bookmarkCountsOf = (
  chapters: Array.NonEmptyReadonlyArray<Chapter>,
  bookmarks: ReadonlyArray<Bookmark>,
): ReadonlyMap<ChapterNumber, number> =>
  Array.reduce(
    bookmarks,
    new Map<ChapterNumber, number>(),
    (counts, bookmark) => {
      const chapterNumber = chapterAt(chapters, bookmark.atMs).chapterNumber
      return new Map([
        ...counts,
        [chapterNumber, (counts.get(chapterNumber) ?? 0) + 1],
      ])
    },
  )

/** The bookmark on the word that starts at `atMs` in `slug`, if there is one. */
export const bookmarkOnWord = (
  bookmarks: ReadonlyArray<Bookmark>,
  slug: TitleSlug,
  atMs: Milliseconds,
): Option.Option<Bookmark> =>
  Array.findFirst(
    bookmarks,
    bookmark => bookmark.slug === slug && bookmark.atMs === atMs,
  )

// LISTING

/** One bookmark as a terminal or another program reads it. */
export const ListedBookmark = S.Struct({
  bookmarkId: BookmarkId,
  atMs: Milliseconds,
  place: S.String,
  chapter: S.optionalKey(S.String),
  link: S.String,
  words: S.optionalKey(S.String),
  note: S.optionalKey(S.String),
})
/** One bookmark as a terminal or another program reads it. */
export type ListedBookmark = typeof ListedBookmark.Type

/** A title's bookmarks, earliest place first. */
export const BookmarksListing = S.Struct({
  slug: TitleSlug,
  title: S.String,
  bookmarks: S.Array(ListedBookmark),
})
/** A title's bookmarks, earliest place first. */
export type BookmarksListing = typeof BookmarksListing.Type

/** A title's bookmarks as one line of JSON. */
export const BookmarksListingJson = S.fromJsonString(BookmarksListing)

type HasBookmarks = Pick<
  Model,
  'library' | 'chapters' | 'listening' | 'navigation'
>

const listedSlugOf = (model: HasBookmarks): Option.Option<TitleSlug> =>
  Option.orElse(shownTitleOf(model), () =>
    model.listening._tag === 'Loaded'
      ? Option.some(model.listening.slug)
      : Option.none(),
  )

const byPlace = Order.mapInput(
  Order.Number,
  (bookmark: Bookmark) => bookmark.atMs,
)

/**
 * The bookmarks of the title on screen, or else of the one in the player,
 * as a terminal prints them. None when no title is open or playing.
 *
 * @example
 * ```typescript
 * bookmarksListingOf(model)
 * // Some({ slug: 'the-lantern-keeper', title: 'The Lantern Keeper', bookmarks: [{ place: '20:34', chapter: 'The Light', words: '…the snow had closed…', link: '/books/the-lantern-keeper/listen/20m34s', … }] })
 * ```
 */
export const bookmarksListingOf = (
  model: HasBookmarks,
): Option.Option<BookmarksListing> =>
  Option.flatMap(listedSlugOf(model), slug =>
    Option.map(titleOf(model, slug), title => ({
      slug,
      title: title.name,
      bookmarks: pipe(
        bookmarksOf(model, slug),
        Array.sort(byPlace),
        Array.map(bookmark => ({
          bookmarkId: bookmark.bookmarkId,
          atMs: bookmark.atMs,
          place: clockOf(bookmark.atMs),
          ...Option.match(chaptersOf(model, slug), {
            onNone: () => ({}),
            onSome: chapters => ({
              chapter: chapterAt(chapters, bookmark.atMs).name,
            }),
          }),
          link: bookmarkPathOf(slug, bookmark.atMs),
          ...Option.match(bookmark.maybeExcerpt, {
            onNone: () => ({}),
            onSome: excerpt => ({ words: excerptLineOf(excerpt) }),
          }),
          ...Option.match(bookmark.maybeNote, {
            onNone: () => ({}),
            onSome: note => ({ note }),
          }),
        })),
      ),
    })),
  )

const listingSeparator = ' · '

/**
 * A listing as lines for a pipe: a `#` line with the title and the count,
 * then one line per bookmark: its time, chapter, words, note, link and id.
 *
 * @example
 * ```typescript
 * bookmarksListingLines(listing)
 * // ['# The Lantern Keeper · 2 bookmarks', '20:34 · The Light · …the snow had closed… · /books/the-lantern-keeper/listen/20m34s · b-snow', …]
 * ```
 */
export const bookmarksListingLines = (
  listing: BookmarksListing,
): ReadonlyArray<string> => [
  `# ${listing.title}${listingSeparator}${bookmarkCountWords(listing.bookmarks.length)}`,
  ...Array.map(listing.bookmarks, bookmark =>
    Array.join(
      [
        bookmark.place,
        ...Array.fromNullishOr(bookmark.chapter),
        ...Array.fromNullishOr(bookmark.words),
        ...Array.map(
          Array.fromNullishOr(bookmark.note),
          note => `note: ${note}`,
        ),
        bookmark.link,
        bookmark.bookmarkId,
      ],
      listingSeparator,
    ),
  ),
]
