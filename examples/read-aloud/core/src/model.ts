import { Array, Option, Order, Schema as S, pipe } from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'

import { Destination } from './destination.js'
import {
  BookId,
  BookKey,
  Isbn13,
  PageNumber,
  ReadingId,
  TurnId,
} from './ids.js'

// MODEL

/**
 * One place to find a book, most open first: its Open Library page, a
 * library near you, a shop. `isVerified` is false where the site would not
 * answer a check, and a page shows only the verified ones.
 */
export const BookLink = S.Struct({
  label: S.String,
  url: S.String,
  isVerified: S.Boolean,
})
/** One place to find a book. */
export type BookLink = typeof BookLink.Type

/**
 * One book someone has read aloud, as Scribe recorded it: its title, who
 * wrote and published it, how many pages it has, its cover from Open
 * Library, and where to find it. Book information only: never its words or
 * its pages.
 */
export const Book = S.Struct({
  bookId: BookId,
  key: BookKey,
  maybeIsbn13: S.Option(Isbn13),
  title: S.String,
  authors: S.Array(S.String),
  publishers: S.Array(S.String),
  maybePublishYear: S.Option(S.String),
  maybePageCount: S.Option(PageNumber),
  maybeCoverUrl: S.Option(S.String),
  links: S.Array(BookLink),
})
/** One book someone has read aloud. */
export type Book = typeof Book.Type

/**
 * One page Scribe heard the reader turn to: which book, in which reading,
 * which page, when the page began, and whether the reader is still on it.
 */
export const PageTurn = S.Struct({
  turnId: TurnId,
  bookId: BookId,
  readingId: ReadingId,
  page: PageNumber,
  turnedAtMs: S.Number,
  isOngoing: S.Boolean,
})
/** One page Scribe heard the reader turn to. */
export type PageTurn = typeof PageTurn.Type

/**
 * What the reading source holds: the books read aloud, newest first, and
 * the pages Scribe heard the reader turn to.
 */
export const Readings = S.Struct({
  books: S.Array(Book),
  turns: S.Array(PageTurn),
})
/** What the reading source holds. */
export type Readings = typeof Readings.Type

/** The readings have not arrived yet. */
export const ReadingsLoading = ts('ReadingsLoading')
/** The readings as the reading source last sent them. */
export const ReadingsReady = ts('ReadingsReady', { readings: Readings })
/** The reading source could not be read, and why, safe to show. */
export const ReadingsUnavailable = ts('ReadingsUnavailable', {
  reason: S.String,
})
/** Where the readings stand. */
export const ReadingsState = S.Union([
  ReadingsLoading,
  ReadingsReady,
  ReadingsUnavailable,
])
/** Where the readings stand. */
export type ReadingsState = typeof ReadingsState.Type

/** How much of a book a preview shows. */
export const PreviewExtent = S.Literals(['Partial', 'Full'])
/** How much of a book a preview shows. */
export type PreviewExtent = typeof PreviewExtent.Type

/**
 * A preview Google Books lets other sites embed, because the publisher
 * allows one: its volume, how much it shows, and its page on Google Books.
 */
export const GooglePreview = ts('GooglePreview', {
  volumeId: S.String,
  extent: PreviewExtent,
  previewUrl: S.String,
})
/** A preview Google Books lets other sites embed. */
export type GooglePreview = typeof GooglePreview.Type
/** No site offers a preview of this edition to embed. */
export const NoPreview = ts('NoPreview')
/** The preview a book has, or that it has none. */
export const Preview = S.Union([GooglePreview, NoPreview])
/** The preview a book has, or that it has none. */
export type Preview = typeof Preview.Type

/** What the preview source answered for one ISBN. */
export const PreviewChecked = ts('PreviewChecked', {
  isbn13: Isbn13,
  preview: Preview,
})
/** The preview source could not answer for one ISBN, and why. */
export const PreviewUnchecked = ts('PreviewUnchecked', {
  isbn13: Isbn13,
  reason: S.String,
})
/** One ISBN's preview check. */
export const PreviewCheck = S.Union([PreviewChecked, PreviewUnchecked])
/** One ISBN's preview check. */
export type PreviewCheck = typeof PreviewCheck.Type

/**
 * The Read Aloud Model: the books and pages from the reading source, the
 * previews checked so far, and the navigation stack, whose top names the
 * book and page on screen. A page Scribe hears that the last readings did
 * not have turns the book on screen to it.
 */
export const Model = S.Struct({
  readings: ReadingsState,
  previewChecks: S.Array(PreviewCheck),
  navigation: Navigation.NavigationStack(Destination),
})
/** A Read Aloud Model value. */
export type Model = typeof Model.Type

/**
 * What Read Aloud reads from the Model that holds it: the readings, the
 * previews checked so far, and the pages of the stack. Read Aloud's own
 * Model is one; Books' Model, with `readings` and `previewChecks` beside
 * its own fields and Read Aloud's places in its stack, is another.
 */
export type ReadAloudView = Readonly<{
  readings: ReadingsState
  previewChecks: ReadonlyArray<PreviewCheck>
  navigation: Readonly<{ pages: ReadonlyArray<unknown> }>
}>

// READ

type HasReadings = Readonly<{ readings: ReadingsState }>

/** The readings, once the reading source has sent them. */
export const readingsOf = (model: HasReadings): Option.Option<Readings> =>
  model.readings._tag === 'ReadingsReady'
    ? Option.some(model.readings.readings)
    : Option.none()

/** Every book read aloud, newest first. */
export const booksOf = (model: HasReadings): ReadonlyArray<Book> =>
  Option.match(readingsOf(model), {
    onNone: () => [],
    onSome: readings => readings.books,
  })

/** The book `key` names, while the readings hold it. */
export const bookOfKey = (
  model: HasReadings,
  key: BookKey,
): Option.Option<Book> =>
  Array.findFirst(booksOf(model), book => book.key === key)

const isIsbn13 = S.is(Isbn13)

/**
 * How a book reads by the word its address names it with: its title once
 * the readings hold it, else `ISBN 9780063342705`, or the word itself for
 * a book named by its Scribe id.
 *
 * @example
 * ```typescript
 * nameOfBookKey(model, BookKey.make('9780063342705')) // 'Little Blue Truck Feeling Happy', or 'ISBN 9780063342705' before the readings arrive
 * ```
 */
export const nameOfBookKey = (model: HasReadings, key: BookKey): string =>
  Option.match(bookOfKey(model, key), {
    onNone: () => (isIsbn13(key) ? `ISBN ${key}` : key),
    onSome: book => book.title,
  })

const byTurnedAtDescending = Order.mapInput(
  Order.flip(Order.Number),
  (turn: PageTurn) => turn.turnedAtMs,
)

/**
 * The newest page turn in `book`, the page the reader is on or stopped at.
 *
 * @example
 * ```typescript
 * newestTurnOf(model, book) // Some({ page: 4, isOngoing: true, ... }) while page 4 is read
 * ```
 */
export const newestTurnOf = (
  model: HasReadings,
  book: Book,
): Option.Option<PageTurn> =>
  Option.flatMap(readingsOf(model), readings =>
    pipe(
      readings.turns,
      Array.filter(turn => turn.bookId === book.bookId),
      Array.sort(byTurnedAtDescending),
      Array.head,
    ),
  )

/**
 * The page being read now, in any book: the newest page turn the reader is
 * still on. None while nothing is being read.
 */
export const liveTurnOf = (
  model: HasReadings,
): Option.Option<Readonly<{ book: Book; turn: PageTurn }>> =>
  Option.flatMap(readingsOf(model), readings =>
    pipe(
      readings.turns,
      Array.filter(turn => turn.isOngoing),
      Array.sort(byTurnedAtDescending),
      Array.head,
      Option.flatMap(turn =>
        Option.map(
          Array.findFirst(readings.books, book => book.bookId === turn.bookId),
          book => ({ book, turn }),
        ),
      ),
    ),
  )

/**
 * The page a book opens at: the page being read while a reading of it is
 * going on, else its first page.
 */
export const openingPageOf = (model: HasReadings, book: Book): PageNumber =>
  Option.match(
    Option.filter(newestTurnOf(model, book), turn => turn.isOngoing),
    {
      onNone: () => PageNumber.make(1),
      onSome: turn => turn.page,
    },
  )

/**
 * True when `turn` is a page the earlier readings did not have: Scribe
 * heard the reader turn to it since. Nothing is new in the first readings.
 *
 * @example
 * ```typescript
 * isNewTurn(model.readings, pageFive) // true once Scribe logs page 5
 * ```
 */
export const isNewTurn = (earlier: ReadingsState, turn: PageTurn): boolean =>
  earlier._tag === 'ReadingsReady' &&
  !Array.some(
    earlier.readings.turns,
    seen => seen.turnId === turn.turnId && seen.page === turn.page,
  )

/** What the preview source answered for `isbn13`, once it has. */
export const previewCheckOf = (
  model: Readonly<{ previewChecks: ReadonlyArray<PreviewCheck> }>,
  isbn13: Isbn13,
): Option.Option<PreviewCheck> =>
  Array.findFirst(model.previewChecks, check => check.isbn13 === isbn13)

/**
 * A book's byline as a person reads it: `Alice Schertle · 2024`.
 *
 * @example
 * ```typescript
 * bylineOf(book) // 'Alice Schertle · 2024'
 * ```
 */
export const bylineOf = (book: Book): string =>
  pipe(
    [
      ...Array.match(book.authors, {
        onEmpty: () => [],
        onNonEmpty: authors => [Array.join(authors, ', ')],
      }),
      ...Option.toArray(book.maybePublishYear),
    ],
    Array.join(' · '),
  )
