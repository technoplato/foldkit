import { Array, Option, pipe } from 'effect'
import { Navigation, Route } from 'foldkit'

import {
  ReadAloudBook,
  ReadAloudPage,
  type ReadAloudPlace,
  ReadAloudShelf,
  isReadAloudShelf,
} from './destination.js'
import { BookKey, type PageNumber, PageNumberSegment } from './ids.js'

// ROUTES

const bookSegment = Route.schemaSegment('book', BookKey)

const pageSegment = Route.schemaSegment('page', PageNumberSegment)

/** The shelf's route, `read-aloud`, below the Program's `books` slug. */
export const shelfRoute = Route.literal('read-aloud')

/** A page's route above the shelf: `9780063342705/page/4`. */
export const pageRoute = pipe(
  bookSegment,
  Route.slash(Route.literal('page')),
  Route.slash(pageSegment),
)

/** A placeless book's route above the shelf: `9780063342705`. */
export const bookRoute = bookSegment

/** True when the entry beneath is the shelf, the one place a book opens. */
export const isAboveShelf = (beneath: ReadonlyArray<unknown>): boolean =>
  Option.exists(Array.last(beneath), isReadAloudShelf)

/** A page's title in the window: `Page 4`. */
export const pageTitleOf = ({ page }: ReadAloudPage): string =>
  `Page ${page.toString()}`

/**
 * Read Aloud's screens, each with its route, title, and where it may sit:
 *
 * - `/books/read-aloud` is the shelf, the root.
 * - `/books/read-aloud/9780063342705/page/4` is that book at page 4, only
 *   above the shelf.
 * - `/books/read-aloud/9780063342705` opens that book at the page being
 *   read, or its first page.
 *
 * Mounted in Books, the shelf is pushed above Books' library with
 * `shelfRoute` instead of being the root, and the same addresses result.
 */
export const declared = Navigation.screens({
  slug: 'books',
  root: Navigation.rootScreen(ReadAloudShelf, shelfRoute, {
    title: () => 'Read aloud',
  }),
  screens: [
    Navigation.pushScreen(ReadAloudPage, pageRoute, {
      title: pageTitleOf,
      isAllowedAbove: isAboveShelf,
    }),
    Navigation.pushScreen(ReadAloudBook, bookRoute, {
      title: () => 'Read aloud',
      isAllowedAbove: isAboveShelf,
    }),
  ],
})

/**
 * The address of one page of one book, printed by the routes above.
 *
 * @example
 * ```typescript
 * pagePathOf(BookKey.make('9780063342705'), PageNumber.make(4))
 * // Some('/books/read-aloud/9780063342705/page/4')
 * ```
 */
export const pagePathOf = (
  book: BookKey,
  page: PageNumber,
): Option.Option<string> =>
  Navigation.printStack(
    declared,
    Navigation.stackWithEntries<ReadAloudPlace>(ReadAloudShelf(), [
      Navigation.presented<ReadAloudPlace>(
        ReadAloudPage({ book, page }),
        Navigation.Push(),
      ),
    ]),
  )
