import { Array, Effect, Option, Order, Schema as S, String, pipe } from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'

import { Destination } from './destination.js'
import {
  BookId,
  BookKey,
  ContributorKey,
  Isbn13,
  PageNumber,
  PublisherKey,
  ReadingId,
  TurnId,
  firstPage,
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
 * What a person did to make a book, in the order a book's credits list
 * them: wrote it, illustrated it, or edited it.
 */
export const CreditRole = S.Literals(['Author', 'Illustrator', 'Editor'])
/** What a person did to make a book. */
export type CreditRole = typeof CreditRole.Type

/**
 * A person a book credits: their name as the book printed it, and the tag
 * their page's address names them by, `ada-quill` for Ada Quill.
 */
export const Contributor = S.Struct({ key: ContributorKey, name: S.String })
/** A person a book credits. */
export type Contributor = typeof Contributor.Type

/** One credit on a book: Ada Quill, Author. */
export const Credit = S.Struct({ role: CreditRole, contributor: Contributor })
/** One credit on a book. */
export type Credit = typeof Credit.Type

/**
 * A book's publisher: its name, and the tag its page's address names it
 * by, `harbor-house` for Harbor House.
 */
export const Publisher = S.Struct({ key: PublisherKey, name: S.String })
/** A book's publisher. */
export type Publisher = typeof Publisher.Type

const noneYet = Effect.succeed([])

/**
 * One story or chapter of a book, as its Contents page lists it: its title
 * and the page it starts on, `Monsters, Inc.: Scariest Day Ever` at page
 * 141. Catalog facts, as Open Library keeps a table of contents: never the
 * story's words.
 */
export const Chapter = S.Struct({ title: S.String, firstPage: PageNumber })
/** One story or chapter of a book. */
export type Chapter = typeof Chapter.Type

/**
 * A moment in one of Michael's recordings: the recording, the number he
 * knows it by (`410`), the second into it, and the line said there, so a
 * link opens the recording at that line.
 */
export const Moment = S.Struct({
  recordingId: S.String,
  maybeRecordingNumber: S.Option(S.String),
  seconds: S.Number,
  maybeSegmentId: S.Option(S.String),
})
/** A moment in one of Michael's recordings. */
export type Moment = typeof Moment.Type

/**
 * One book someone has read aloud, as Scribe recorded it: its title, who
 * made and published it, how many pages it has, its cover from Open
 * Library, and where to find it. Book information only: never its words or
 * its pages. A book sent before books had credits reads as crediting
 * nobody.
 *
 * `aliases` are the other words an address may name it by: Scribe keeps one
 * book under several `things` rows when it found it by its work and later
 * by its ISBN, or under each of a person's sign-ins, so
 * `/books/read-aloud/1368002579` (its ISBN-10), `…/OL20165102W` (its Open
 * Library work), and each row's id open the book `9781368002578`. A book
 * sent before books had aliases has none.
 */
export const Book = S.Struct({
  bookId: BookId,
  key: BookKey,
  maybeIsbn13: S.Option(Isbn13),
  title: S.String,
  credits: S.Array(Credit).pipe(S.withDecodingDefaultKey(noneYet)),
  publishedBy: S.Array(Publisher).pipe(S.withDecodingDefaultKey(noneYet)),
  maybePublishYear: S.Option(S.String),
  maybePageCount: S.Option(PageNumber),
  maybeCoverUrl: S.Option(S.String),
  links: S.Array(BookLink),
  aliases: S.Array(BookKey).pipe(S.withDecodingDefaultKey(noneYet)),
  contents: S.Array(Chapter).pipe(S.withDecodingDefaultKey(noneYet)),
})
/** One book someone has read aloud. */
export type Book = typeof Book.Type

/**
 * One page Scribe heard the reader turn to: which book, in which reading,
 * which page, when the page began, whether the reader is still on it, and
 * the moment in the recording where Scribe heard it.
 */
export const PageTurn = S.Struct({
  turnId: TurnId,
  bookId: BookId,
  readingId: ReadingId,
  page: PageNumber,
  turnedAtMs: S.Number,
  isOngoing: S.Boolean,
  maybeMoment: S.Option(Moment),
})
/** One page Scribe heard the reader turn to. */
export type PageTurn = typeof PageTurn.Type

/**
 * One sitting with a book: when it began and ended, whether it goes on,
 * the pages it reached, and the moment in the recording where Scribe
 * recognized the book.
 */
export const Sitting = S.Struct({
  readingId: ReadingId,
  bookId: BookId,
  startedAtMs: S.Number,
  maybeEndedAtMs: S.Option(S.Number),
  isOngoing: S.Boolean,
  maybeFirstPage: S.Option(PageNumber),
  maybeLastPage: S.Option(PageNumber),
  maybeMoment: S.Option(Moment),
})
/** One sitting with a book. */
export type Sitting = typeof Sitting.Type

/**
 * What the reading source holds: the books read aloud, newest first, the
 * pages Scribe heard the reader turn to, and every sitting with a book,
 * newest first.
 */
export const Readings = S.Struct({
  books: S.Array(Book),
  turns: S.Array(PageTurn),
  sittings: S.Array(Sitting).pipe(S.withDecodingDefaultKey(noneYet)),
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

/**
 * True when `key` names `book`: its own key, or one of its aliases.
 *
 * @example
 * ```typescript
 * isNamedBy(BookKey.make('1368002579'))(halloween) // true: its ISBN-10
 * ```
 */
export const isNamedBy =
  (key: BookKey) =>
  (book: Book): boolean =>
    book.key === key || Array.contains(book.aliases, key)

/**
 * The book `key` names among `books`, by its own key or an alias.
 *
 * @example
 * ```typescript
 * bookNamedIn(books, BookKey.make('OL20165102W')) // Some(5-Minute Halloween Stories)
 * ```
 */
export const bookNamedIn = (
  books: ReadonlyArray<Book>,
  key: BookKey,
): Option.Option<Book> => Array.findFirst(books, isNamedBy(key))

/** The book `key` names, while the readings hold it. */
export const bookOfKey = (
  model: HasReadings,
  key: BookKey,
): Option.Option<Book> => bookNamedIn(booksOf(model), key)

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
      onNone: () => firstPage,
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
 * The people a book credits in one role, in the order its credits list
 * them.
 *
 * @example
 * ```typescript
 * contributorsAs(book, 'Author') // [{ key: 'ada-quill', name: 'Ada Quill' }]
 * ```
 */
export const contributorsAs = (
  book: Book,
  role: CreditRole,
): ReadonlyArray<Contributor> =>
  pipe(
    book.credits,
    Array.filter(credit => credit.role === role),
    Array.map(credit => credit.contributor),
  )

/**
 * A book's byline as a person reads it: its authors and its year,
 * `Alice Schertle · 2024`. Its illustrators and editors are on its page.
 *
 * @example
 * ```typescript
 * bylineOf(book) // 'Alice Schertle · 2024'
 * ```
 */
export const bylineOf = (book: Book): string =>
  pipe(
    [
      ...Array.match(contributorsAs(book, 'Author'), {
        onEmpty: () => [],
        onNonEmpty: authors => [
          Array.join(
            Array.map(authors, author => author.name),
            ', ',
          ),
        ],
      }),
      ...Option.toArray(book.maybePublishYear),
    ],
    Array.join(' · '),
  )

const isCreditOf =
  (key: ContributorKey) =>
  (credit: Credit): boolean =>
    credit.contributor.key === key

/**
 * Every book read aloud that credits the person tagged `key` in `role`,
 * newest first: `booksCreditingOf(model, 'Author', 'ada-quill')` is every
 * book Ada Quill wrote.
 */
export const booksCreditingOf = (
  model: HasReadings,
  role: CreditRole,
  key: ContributorKey,
): ReadonlyArray<Book> =>
  Array.filter(booksOf(model), book =>
    Array.some(
      book.credits,
      credit => credit.role === role && isCreditOf(key)(credit),
    ),
  )

/** The person tagged `key`, as the first book crediting them names them. */
export const contributorOfKey = (
  model: HasReadings,
  key: ContributorKey,
): Option.Option<Contributor> =>
  pipe(
    booksOf(model),
    Array.flatMap(book => book.credits),
    Array.findFirst(isCreditOf(key)),
    Option.map(credit => credit.contributor),
  )

/**
 * Every book read aloud the publisher tagged `key` published, newest
 * first.
 */
export const booksPublishedByOf = (
  model: HasReadings,
  key: PublisherKey,
): ReadonlyArray<Book> =>
  Array.filter(booksOf(model), book =>
    Array.some(book.publishedBy, publisher => publisher.key === key),
  )

/** The publisher tagged `key`, as the first book it published names it. */
export const publisherOfKey = (
  model: HasReadings,
  key: PublisherKey,
): Option.Option<Publisher> =>
  pipe(
    booksOf(model),
    Array.flatMap(book => book.publishedBy),
    Array.findFirst(publisher => publisher.key === key),
  )

/**
 * Each story in a book's Contents with its pages: from its first page to
 * the page before the next story's, the last one to the book's end when
 * the book's length is known.
 *
 * @example
 * ```typescript
 * storiesOf(halloween) // [{ chapter: Tiana's Ghost, maybeLastPage: Some(16) }, …, { chapter: Tricky Treats, maybeLastPage: Some(192) }]
 * ```
 */
export const storiesOf = (
  book: Book,
): ReadonlyArray<
  Readonly<{ chapter: Chapter; maybeLastPage: Option.Option<PageNumber> }>
> =>
  Array.map(book.contents, (chapter, index) => ({
    chapter,
    maybeLastPage: Option.match(Array.get(book.contents, index + 1), {
      onNone: () =>
        Option.filter(book.maybePageCount, count => count >= chapter.firstPage),
      onSome: next => S.decodeUnknownOption(PageNumber)(next.firstPage - 1),
    }),
  }))

/** The story a page is in: the last one in the Contents to start at or before it. */
export const storyOfPage = (
  book: Book,
  page: PageNumber,
): Option.Option<
  Readonly<{ chapter: Chapter; maybeLastPage: Option.Option<PageNumber> }>
> =>
  Array.findLast(
    storiesOf(book),
    story =>
      story.chapter.firstPage <= page &&
      Option.match(story.maybeLastPage, {
        onNone: () => true,
        onSome: last => page <= last,
      }),
  )

const bySittingStartedDescending = Order.mapInput(
  Order.flip(Order.Number),
  (sitting: Sitting) => sitting.startedAtMs,
)

/** Every sitting with `book`, the newest first. */
export const sittingsOfBook = (
  model: HasReadings,
  book: Book,
): ReadonlyArray<Sitting> =>
  Option.match(readingsOf(model), {
    onNone: () => [],
    onSome: readings =>
      pipe(
        readings.sittings,
        Array.filter(sitting => sitting.bookId === book.bookId),
        Array.sort(bySittingStartedDescending),
      ),
  })

/** Each time Scribe heard the reader turn to `page` of `book`, the newest first. */
export const turnsOfPage = (
  model: HasReadings,
  book: Book,
  page: PageNumber,
): ReadonlyArray<PageTurn> =>
  Option.match(readingsOf(model), {
    onNone: () => [],
    onSome: readings =>
      pipe(
        readings.turns,
        Array.filter(turn => turn.bookId === book.bookId && turn.page === page),
        Array.sort(byTurnedAtDescending),
      ),
  })

const momentOrigin = 'https://og.pisspoursoftware.xyz'

/**
 * The link that opens a moment: the recording at the line said there, as
 * Scribe's own deep links do, else the recording's playback at its second.
 *
 * @example
 * ```typescript
 * momentUrlOf(moment) // 'https://og.pisspoursoftware.xyz/recording/725c1dd4-…/section/e77673c1-…?t=7102.27'
 * ```
 */
export const momentUrlOf = (moment: Moment): string =>
  Option.match(moment.maybeSegmentId, {
    onNone: () =>
      `${momentOrigin}/playback/${String.toLowerCase(moment.recordingId)}?t=${Math.max(0, Math.floor(moment.seconds)).toString()}`,
    onSome: segmentId =>
      `${momentOrigin}/recording/${String.toLowerCase(moment.recordingId)}/section/${String.toLowerCase(segmentId)}?t=${moment.seconds.toFixed(2)}`,
  })

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const hoursInHalfDay = 12

/**
 * When something happened, in the reader's own time zone, the way a
 * person says it: `Nov 10, 2026, 10:06 PM`.
 */
export const momentLabelOf = (atMs: number): string => {
  const date = new Date(atMs)
  const hours = date.getHours()
  const hour =
    hours % hoursInHalfDay === 0 ? hoursInHalfDay : hours % hoursInHalfDay
  const minutes = String.padStart(2, '0')(date.getMinutes().toString())
  const month = Option.getOrElse(
    Array.get(monthNames, date.getMonth()),
    () => '',
  )
  return `${month} ${date.getDate().toString()}, ${date.getFullYear().toString()}, ${hour.toString()}:${minutes} ${hours < hoursInHalfDay ? 'AM' : 'PM'}`
}
