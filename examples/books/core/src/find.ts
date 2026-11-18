import { Array, Match as M, Option, Schema as S } from 'effect'
import { Catalog } from 'foldkit'
import {
  type ButtonNode,
  type TranscriptWordAction,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'
import { ts } from 'foldkit/schema'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { Milliseconds, TitleSlug, clockOf } from './ids.js'
import { wordPathOf } from './links.js'
import { BookmarkWord, CopyWordLink, catalog } from './message.js'
import {
  type Loaded,
  type Model,
  type Title,
  chapterNameAt,
  loadedTitleOf,
} from './model.js'

// FIND

/**
 * What a word's menu offers in Books besides playing from it: `Copy link
 * to this word`, which presses `CopyWordLink` with the word, and
 * `Bookmark this word`, which presses `BookmarkWord` with it.
 */
export const wordActions: ReadonlyArray<TranscriptWordAction> = [
  { action: CopyWordLink.tag, label: 'Copy link to this word', icon: 'Link' },
  {
    action: BookmarkWord.tag,
    label: 'Bookmark this word',
    icon: 'Bookmark',
  },
]

/**
 * The words of the title in the player, as the reader shows them: the
 * Transcript Player's own words, with what a search found marked and the
 * view kept where the person put it, and with Books' word menu.
 */
export const readerTranscriptOf = (loaded: Loaded): UiNode =>
  TranscriptPlayer.transcriptOf(loaded.player, { wordActions })

const entriesOf = (model: Model): ReadonlyArray<Catalog.Entry> =>
  Catalog.entries(catalog, model)

/**
 * The search while it is open, for the player page to place by the
 * words: the field, how the search stands, the buttons to step and to
 * close, and the matches. Nothing while the search is closed.
 */
export const readerSearchOf = (
  model: Model,
  loaded: Loaded,
): ReadonlyArray<UiNode> =>
  TranscriptPlayer.searchPanelOf(loaded.player, entriesOf(model))

/**
 * The reader's own buttons, for the player page to place under the
 * words: `Back to playhead` while the words are away from the word being
 * read, and `Search` while the search is closed.
 */
export const readerButtonsOf = (
  model: Model,
  loaded: Loaded,
): ReadonlyArray<ButtonNode> =>
  TranscriptPlayer.readerButtonsOf(loaded.player, entriesOf(model))

/**
 * The link to the word being read in this device's player, the time the
 * word starts in the player's own address. None while nothing is in the
 * player or no word near the place is known.
 *
 * @example
 * ```typescript
 * currentWordLinkOf(model) // Some('/books/the-lantern-keeper/listen/12m03.45s')
 * ```
 */
export const currentWordLinkOf = (model: Model): Option.Option<string> =>
  Option.flatMap(loadedTitleOf(model), ({ title, loaded }) =>
    Option.map(TranscriptPlayer.currentWordOf(loaded.player), word =>
      wordPathOf(title.slug, word.startMs),
    ),
  )

/**
 * `Copy link to this word` for the word being read, as a button for the
 * player's controls, labelled `Word link` to sit beside `Share` and
 * `Bookmark`. Nothing while no word near the place is known.
 */
export const currentWordLinkButtonOf = (
  model: Model,
  loaded: Loaded,
): ReadonlyArray<ButtonNode> =>
  Option.match(TranscriptPlayer.currentWordOf(loaded.player), {
    onNone: () => [],
    onSome: word =>
      Array.map(
        actionButtons(
          Array.filter(
            Catalog.entriesFor(entriesOf(model), word.wordId),
            entry => entry.tag === `${CopyWordLink.tag}:${word.wordId}`,
          ),
        ),
        button => ({
          ...button,
          label: 'Word link',
          icon: 'Link',
          variant: 'Ghost',
        }),
      ),
  })

// SEARCH

/**
 * One place a search found in a book: where it is in milliseconds and as
 * a clock, the chapter it is in, the words that matched with a few either
 * side, and the link that opens the book on its first word.
 */
export const BookMatch = S.Struct({
  placeMs: Milliseconds,
  place: S.String,
  maybeChapter: S.OptionFromOptionalKey(S.String),
  before: S.String,
  text: S.String,
  after: S.String,
  link: S.String,
})
/** One place a search found in a book. */
export type BookMatch = typeof BookMatch.Type

/** There is no search to read, and why in a sentence. */
export const NoBookSearch = ts('NoBookSearch', { sentence: S.String })
/** The book in the player is being searched for `query`. */
export const SearchingBook = ts('SearchingBook', {
  slug: TitleSlug,
  title: S.String,
  query: S.String,
})
/**
 * What a search of the book in the player found: how many places in the
 * whole book, and the first of them in order.
 */
export const BookMatches = ts('BookMatches', {
  slug: TitleSlug,
  title: S.String,
  query: S.String,
  total: S.Int,
  matches: S.Array(BookMatch),
})
/** The book could not be searched, and why, safe to show. */
export const BookSearchFailed = ts('BookSearchFailed', {
  slug: TitleSlug,
  title: S.String,
  query: S.String,
  reason: S.String,
})

/** How a search of the book in this device's player stands. */
export const BookSearch = S.Union([
  NoBookSearch,
  SearchingBook,
  BookMatches,
  BookSearchFailed,
])
/** How a search of the book in this device's player stands. */
export type BookSearch = typeof BookSearch.Type

const MatchWire = BookMatch.pipe(S.encodeKeys({ maybeChapter: 'chapter' }))

/**
 * A book search as one line of JSON, with no `maybe` in its keys:
 * `{"_tag":"BookMatches","slug":"the-lantern-keeper","query":"lamp","total":2,"matches":[{"place":"0:43","chapter":"The Tide","text":"lamp.","link":"/books/the-lantern-keeper/listen/43.5s",…}]}`.
 */
export const BookSearchJson = S.fromJsonString(
  S.toCodecJson(
    S.Union([
      NoBookSearch,
      SearchingBook,
      ts('BookMatches', {
        slug: TitleSlug,
        title: S.String,
        query: S.String,
        total: S.Int,
        matches: S.Array(MatchWire),
      }),
      BookSearchFailed,
    ]),
  ),
)

const bookMatchOf = (
  model: Model,
  title: Title,
  match: TranscriptPlayer.Match,
): BookMatch => ({
  placeMs: match.startMs,
  place: clockOf(match.startMs),
  maybeChapter: chapterNameAt(model, title.slug, match.startMs),
  before: match.before,
  text: match.text,
  after: match.after,
  link: wordPathOf(title.slug, match.startMs),
})

/**
 * How the search of the book in this device's player stands, from the
 * Model alone, so every Client says the same thing: nothing to read, the
 * book being searched, the matches with their times, chapters and links,
 * or why it could not be searched.
 *
 * @example
 * ```typescript
 * bookSearchOf(model)
 * // BookMatches({ title: 'The Lantern Keeper', query: 'lamp', total: 2, matches: [{ place: '0:43', link: '/books/the-lantern-keeper/listen/43.5s', … }, …] })
 * ```
 */
export const bookSearchOf = (model: Model): BookSearch =>
  Option.match(loadedTitleOf(model), {
    onNone: () => NoBookSearch({ sentence: 'Nothing is in the player.' }),
    onSome: ({ title, loaded }) =>
      Option.match(TranscriptPlayer.searchOf(loaded.player), {
        onNone: () =>
          NoBookSearch({ sentence: 'Nothing has been searched for.' }),
        onSome: M.type<TranscriptPlayer.Search>().pipe(
          M.withReturnType<BookSearch>(),
          M.tagsExhaustive({
            SearchIdle: () =>
              NoBookSearch({ sentence: 'Nothing has been searched for.' }),
            Searching: ({ query }) =>
              SearchingBook({ slug: title.slug, title: title.name, query }),
            SearchFound: ({ query, total, matches, maybeParts }) =>
              Option.isSome(maybeParts)
                ? SearchingBook({ slug: title.slug, title: title.name, query })
                : BookMatches({
                    slug: title.slug,
                    title: title.name,
                    query,
                    total,
                    matches: Array.map(matches, match =>
                      bookMatchOf(model, title, match),
                    ),
                  }),
            SearchFailed: ({ query, reason }) =>
              BookSearchFailed({
                slug: title.slug,
                title: title.name,
                query,
                reason,
              }),
          }),
        ),
      }),
  })

/** True once a search has an answer: its matches, or why it has none. */
export const isBookSearchSettled = (search: BookSearch): boolean =>
  search._tag !== 'SearchingBook'

const countOf = (count: number): string => count.toLocaleString('en-US')

const matchesHeadOf = (
  found: Extract<BookSearch, { _tag: 'BookMatches' }>,
): string => {
  if (found.total === 0) {
    return `# No matches for “${found.query}” in ${found.title}`
  } else if (found.total > found.matches.length) {
    return `# The first ${countOf(found.matches.length)} of ${countOf(found.total)} matches for “${found.query}” in ${found.title}`
  } else {
    return `# ${countOf(found.total)} ${found.total === 1 ? 'match' : 'matches'} for “${found.query}” in ${found.title}`
  }
}

const matchLineOf = (match: BookMatch): string =>
  Array.join(
    [
      match.place,
      ...Array.fromOption(match.maybeChapter),
      Array.join(
        Array.filter(
          [match.before, `[${match.text}]`, match.after],
          part => part !== '',
        ),
        ' ',
      ),
      match.link,
    ],
    ' · ',
  )

/**
 * A book search as lines for a pipe. The first line starts with `#` and
 * says how many places were found, for which words, in which book; then
 * one line per match: its time, its chapter, the words with the match in
 * brackets, and its link.
 *
 * @example
 * ```typescript
 * bookSearchLines(bookSearchOf(model))
 * // ['# 2 matches for “lamp” in The Lantern Keeper',
 * //  '0:43 · The Tide · Far out a bell answered the [lamp.] · /books/the-lantern-keeper/listen/43.5s', …]
 * ```
 */
export const bookSearchLines = (search: BookSearch): ReadonlyArray<string> =>
  M.value(search).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      NoBookSearch: ({ sentence }) => [`# ${sentence}`],
      SearchingBook: ({ title, query }) => [
        `# Searching ${title} for “${query}”…`,
      ],
      BookMatches: found => [
        matchesHeadOf(found),
        ...Array.map(found.matches, matchLineOf),
      ],
      BookSearchFailed: ({ title, query, reason }) => [
        `# Could not search ${title} for “${query}”: ${reason}`,
      ],
    }),
  )
