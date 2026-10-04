import { Array, Option } from 'effect'

import {
  ReadAloudPage,
  isReadAloudBook,
  isReadAloudPage,
} from './destination.js'
import { type BookKey, PageNumber } from './ids.js'
import {
  type Book,
  type ReadingsState,
  bookOfKey,
  openingPageOf,
} from './model.js'

// STACK

type HasStack = Readonly<{
  navigation: Readonly<{ pages: ReadonlyArray<unknown> }>
}>

const topPageOf = (model: HasStack): Option.Option<unknown> =>
  Array.last(model.navigation.pages)

/**
 * The book and page on screen, while a book is open at a page.
 *
 * @example
 * ```typescript
 * shownPageOf(model) // Some({ book: '9780063342705', page: 4 }) on `/books/read-aloud/9780063342705/page/4`
 * ```
 */
export const shownPageOf = (
  model: HasStack,
): Option.Option<Readonly<{ book: BookKey; page: PageNumber }>> =>
  Option.flatMap(topPageOf(model), page =>
    isReadAloudPage(page)
      ? Option.some({ book: page.book, page: page.page })
      : Option.none(),
  )

/** The book on screen, with or without a page in its address. */
export const shownBookKeyOf = (model: HasStack): Option.Option<BookKey> =>
  Option.flatMap(topPageOf(model), page =>
    isReadAloudPage(page) || isReadAloudBook(page)
      ? Option.some(page.book)
      : Option.none(),
  )

/** The book on screen, while the readings hold it. */
export const shownBookOf = (
  model: HasStack & Readonly<{ readings: ReadingsState }>,
): Option.Option<Book> =>
  Option.flatMap(shownBookKeyOf(model), key => bookOfKey(model, key))

/**
 * A placeless book settled to the page it opens at, once the readings are
 * here: `/books/read-aloud/9780063342705` becomes `…/page/4` while page 4
 * is being read, `…/page/1` otherwise. Any other place stays as it is. It
 * is the navigation's `settleEntry`, so a link settles wherever Read Aloud
 * is mounted.
 *
 * @example
 * ```typescript
 * settledEntryOf(model, ReadAloudBook({ book })) // ReadAloudPage({ book, page: 4 })
 * ```
 */
export const settledEntryOf = <Destination>(
  model: Readonly<{ readings: ReadingsState }>,
  destination: Destination,
): Destination | ReadAloudPage =>
  isReadAloudBook(destination) && model.readings._tag === 'ReadingsReady'
    ? ReadAloudPage({
        book: destination.book,
        page: Option.match(bookOfKey(model, destination.book), {
          onNone: () => PageNumber.make(1),
          onSome: book => openingPageOf(model, book),
        }),
      })
    : destination
