import { Array, Option, Schema as S } from 'effect'
import { Catalog, Navigation } from 'foldkit'
import { m } from 'foldkit/message'

import { BookKey, Isbn13, PageNumber, PageNumberSegment } from './ids.js'
import {
  type Book,
  Preview,
  type ReadAloudView,
  Readings,
  booksOf,
  bylineOf,
  liveTurnOf,
} from './model.js'
import { shownBookKeyOf, shownBookOf, shownPageOf } from './stack.js'

// MESSAGE

const noBookOpen = 'no book is open'

const lastPageOf = (book: Book): Option.Option<PageNumber> =>
  book.maybePageCount

const pagesOf = (book: Book): ReadonlyArray<PageNumber> =>
  Option.match(lastPageOf(book), {
    onNone: () => [],
    onSome: last => Array.makeBy(last, index => PageNumber.make(index + 1)),
  })

/**
 * Opens one book at the page being read while it is read, else at its
 * first page. Pressing a book on the shelf presses it.
 */
export const OpenBook = Catalog.action('OpenBook', {
  fields: { book: BookKey },
  choose: {
    field: 'book',
    prompt: 'Which book?',
    token: BookKey,
    choicesOf: (model: ReadAloudView) =>
      Array.map(booksOf(model), book => ({
        value: book.key,
        title: book.title,
        detail: bylineOf(book),
        availability: Option.contains(shownBookKeyOf(model), book.key)
          ? Catalog.Disabled({ because: 'it is open' })
          : Catalog.Enabled(),
      })),
    nothingToChoose: 'no book has been read aloud yet',
  },
  what: 'Opens the book at the page being read, or at its first page',
  why: 'The person wants to follow along in that book',
  meta: { label: 'Open', keys: [], title: 'Open book' },
})

/** Turns back one page. The left arrow presses it. */
export const PreviousPage = Catalog.action('PreviousPage', {
  what: 'Turns back one page',
  why: 'The reader went back a page, or Scribe heard the wrong one',
  enabled: (model: ReadAloudView) =>
    Option.match(shownPageOf(model), {
      onNone: () => Catalog.Disabled({ because: noBookOpen }),
      onSome: ({ page }) =>
        page === 1
          ? Catalog.Disabled({ because: 'this is the first page' })
          : Catalog.Enabled(),
    }),
  meta: { label: 'Previous page', keys: ['ArrowLeft'] },
})

/** Turns forward one page. The right arrow presses it. */
export const NextPage = Catalog.action('NextPage', {
  what: 'Turns forward one page',
  why: 'The reader turned the page before Scribe heard it',
  enabled: (model: ReadAloudView) =>
    Option.match(shownPageOf(model), {
      onNone: () => Catalog.Disabled({ because: noBookOpen }),
      onSome: ({ page }) =>
        Option.exists(
          Option.flatMap(shownBookOf(model), lastPageOf),
          last => page >= last,
        )
          ? Catalog.Disabled({ because: 'this is the last page' })
          : Catalog.Enabled(),
    }),
  meta: { label: 'Next page', keys: ['ArrowRight'] },
})

/**
 * Turns to one page of the book on screen: `TurnToPage:7` turns to page 7.
 * It offers every page of a book whose length is known, and takes any page
 * up to its last.
 */
export const TurnToPage = Catalog.action('TurnToPage', {
  fields: { page: PageNumber },
  choose: {
    field: 'page',
    prompt: 'Which page?',
    token: PageNumberSegment,
    choicesOf: (model: ReadAloudView) =>
      Option.match(shownBookOf(model), {
        onNone: () => [],
        onSome: book =>
          Array.map(pagesOf(book), page => ({
            value: page,
            title: `Page ${page.toString()}`,
            availability: Option.exists(
              shownPageOf(model),
              shown => shown.page === page,
            )
              ? Catalog.Disabled({ because: 'it is open' })
              : Catalog.Enabled(),
          })),
      }),
    accepts: (model: ReadAloudView, page: PageNumber) => {
      const maybeLast = Option.flatMap(shownBookOf(model), lastPageOf)
      if (Option.isNone(shownPageOf(model))) {
        return Catalog.Disabled({ because: noBookOpen })
      } else if (Option.exists(maybeLast, last => page > last)) {
        return Catalog.Disabled({ because: 'the book ends before that page' })
      } else {
        return Catalog.Enabled()
      }
    },
    nothingToChoose: noBookOpen,
  },
  what: 'Turns to one page of the book',
  why: 'The person wants to show that page',
  meta: { label: 'Turn to page', keys: [], title: 'Turn to page' },
})

/**
 * Turns to the book and page being read now, after someone turned away
 * from it. `f` presses it.
 */
export const FollowReading = Catalog.action('FollowReading', {
  what: 'Turns to the book and page being read now',
  why: 'The person wants the screen to follow the reader again',
  enabled: (model: ReadAloudView) =>
    Option.match(liveTurnOf(model), {
      onNone: () => Catalog.Disabled({ because: 'nothing is being read now' }),
      onSome: ({ book, turn }) =>
        Option.exists(
          shownPageOf(model),
          shown => shown.book === book.key && shown.page === turn.page,
        )
          ? Catalog.Disabled({ because: 'this is the page being read' })
          : Catalog.Enabled(),
    }),
  meta: { label: 'Follow the reading', keys: ['f'] },
})

/**
 * Shares a link to the page on screen, the way the Program that holds Read
 * Aloud shares links: Books sends it through its share sheet or the
 * clipboard, like a moment in a title. Read Aloud declares it but does not
 * handle it, so only a holder that can share offers it, and its screens
 * show the button only where the holder's entries have it.
 */
export const SharePage = Catalog.action('SharePage', {
  what: 'Shares a link to this page of the book',
  why: 'The person wants someone to see this page, or to come back to it',
  enabled: (model: ReadAloudView) =>
    Option.isSome(shownPageOf(model))
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: noBookOpen }),
  meta: { label: 'Share', keys: [], title: 'Share this page' },
})

/**
 * Every Read Aloud Action every holder handles, in the order surfaces list
 * them. The action menu shows each once; OpenBook and TurnToPage ask which
 * book or page next. A holder that can share adds SharePage.
 */
export const catalog = Catalog.make([
  OpenBook,
  PreviousPage,
  NextPage,
  TurnToPage,
  FollowReading,
])

/** The reading source sent the books and the pages Scribe heard. */
export const ReceivedReadings = m('ReceivedReadings', { readings: Readings })
/** The reading source could not be read, and why, safe to show. */
export const FailedReadReadings = m('FailedReadReadings', {
  reason: S.String,
})
/** The preview source answered whether a book has a preview to embed. */
export const ReceivedPreview = m('ReceivedPreview', {
  isbn13: Isbn13,
  preview: Preview,
})
/** The preview source could not answer for a book, and why, safe to show. */
export const FailedCheckPreview = m('FailedCheckPreview', {
  isbn13: Isbn13,
  reason: S.String,
})

/**
 * The Messages Read Aloud handles wherever it is mounted: the Catalog's
 * Actions, and the facts the reading and preview sources report. A
 * Program that holds Read Aloud, such as Books, lists these in its own
 * Message and hands them to `updateReadAloud`.
 */
export const ReadAloudMessage = S.Union([
  ...catalog.Message.members,
  ReceivedReadings,
  FailedReadReadings,
  ReceivedPreview,
  FailedCheckPreview,
])
/** A Message Read Aloud handles wherever it is mounted. */
export type ReadAloudMessage = typeof ReadAloudMessage.Type

/**
 * Every Message the Read Aloud Program accepts on its own: Read Aloud's,
 * and the carrier facts its stack folds.
 */
export const Message = S.Union([
  ...ReadAloudMessage.members,
  Navigation.OpenedUri,
  Navigation.NavigatedBack,
])
/** A Read Aloud Program Message value. */
export type Message = typeof Message.Type
