import { Array, Option, pipe } from 'effect'
import { Navigation, Route } from 'foldkit'

import {
  ReadAloudBook,
  ReadAloudPage,
  type ReadAloudPlace,
  ReadAloudShelf,
  isReadAloudShelf,
} from './destination.js'
import {
  BookKey,
  type PageNumber,
  PageNumberSegment,
  firstPage,
} from './ids.js'
import { type ReadAloudView, nameOfBookKey } from './model.js'
import { shownPageOf } from './stack.js'

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
 * What keeps a book's page the same page while it is read: its book, with
 * the page reset. Turning from `/books/read-aloud/9780063342705/page/4` to
 * `…/page/5` keeps the identity `/books/read-aloud/9780063342705/page/1`,
 * so a painter keeps the screen, its scroll, and the Google viewer, which
 * turns its page instead of loading the book again.
 *
 * @example
 * ```typescript
 * pageIdentityOf(ReadAloudPage({ book, page: PageNumber.make(4) }))
 * // ReadAloudPage({ book, page: 1 })
 * ```
 */
export const pageIdentityOf = ({ book }: ReadAloudPage): ReadAloudPage =>
  ReadAloudPage({ book, page: firstPage })

/**
 * Read Aloud's screens, each with its route, title, and where it may sit:
 *
 * - `/books/read-aloud` is the shelf, the root.
 * - `/books/read-aloud/9780063342705/page/4` is that book at page 4, only
 *   above the shelf. Its address follows the page being read, and it
 *   stays one page while it does, so the Google viewer turns its page
 *   instead of loading the book again.
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
      identityOf: pageIdentityOf,
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

/**
 * The address of the books read aloud, the shelf: `/books/read-aloud`.
 *
 * @example
 * ```typescript
 * shelfPathOf() // Some('/books/read-aloud')
 * ```
 */
export const shelfPathOf = (): Option.Option<string> =>
  Navigation.defaultUri(declared)

/**
 * The link to share for the page on screen: its address, and the words to
 * send with it. None while no page is open.
 *
 * @example
 * ```typescript
 * pageLinkOf(model)
 * // Some({ path: '/books/read-aloud/9780063342705/page/4', title: 'Little Blue Truck Feeling Happy, page 4' })
 * ```
 */
export const pageLinkOf = (
  model: ReadAloudView,
): Option.Option<Readonly<{ path: string; title: string }>> =>
  Option.flatMap(shownPageOf(model), ({ book, page }) =>
    Option.map(pagePathOf(book, page), path => ({
      path,
      title: `${nameOfBookKey(model, book)}, page ${page.toString()}`,
    })),
  )
