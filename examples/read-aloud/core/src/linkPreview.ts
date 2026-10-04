import { Array, Option, Schema as S } from 'effect'
import { Navigation } from 'foldkit'

import { isReadAloudPage } from './destination.js'
import type { BookKey, PageNumber } from './ids.js'
import type { Book } from './model.js'
import { declared } from './routes.js'

// LINK PREVIEW

/**
 * What a link to one page of a book read aloud unfurls as, in strings
 * only: the book's title, who wrote it, the page, and its cover from Open
 * Library. Never the book's words or its pages.
 */
export const ReadAloudLinkMetadata = S.Struct({
  title: S.String,
  author: S.String,
  pageLabel: S.String,
  coverUrl: S.String,
})
/** What a link to one page of a book read aloud unfurls as. */
export type ReadAloudLinkMetadata = typeof ReadAloudLinkMetadata.Type

const openLibraryCovers = 'https://covers.openlibrary.org/'

const coverSizePattern = /-[SM]\.jpg$/u

/**
 * An Open Library cover at its large size, the one a link preview shows:
 * `…/b/id/15154333-M.jpg` becomes `…/b/id/15154333-L.jpg`. Any other
 * picture stays as it is.
 *
 * @example
 * ```typescript
 * largeCoverUrlOf('https://covers.openlibrary.org/b/id/15154333-M.jpg')
 * // 'https://covers.openlibrary.org/b/id/15154333-L.jpg'
 * ```
 */
export const largeCoverUrlOf = (url: string): string =>
  url.startsWith(openLibraryCovers)
    ? url.replace(coverSizePattern, '-L.jpg')
    : url

const coverUrlOf = (book: Book): Option.Option<string> =>
  Option.orElse(Option.map(book.maybeCoverUrl, largeCoverUrlOf), () =>
    Option.map(
      book.maybeIsbn13,
      isbn13 => `${openLibraryCovers}b/isbn/${isbn13}-L.jpg`,
    ),
  )

const authorOf = (book: Book): Option.Option<string> =>
  Array.match(book.authors, {
    onEmpty: () => Option.none(),
    onNonEmpty: authors => Option.some(Array.join(authors, ', ')),
  })

const pageLabelOf = (book: Book, page: PageNumber): string =>
  Option.match(book.maybePageCount, {
    onNone: () => `Page ${page.toString()}`,
    onSome: count => `Page ${page.toString()} of ${count.toString()}`,
  })

const readAloudPrefix = '/books/read-aloud/'

/**
 * The book and page a Read Aloud page address names:
 * `/books/read-aloud/9780063342705/page/4` names book `9780063342705` at
 * page 4. None for any other address.
 */
export const pageOfPath = (
  path: string,
): Option.Option<Readonly<{ book: BookKey; page: PageNumber }>> =>
  path.startsWith(readAloudPrefix)
    ? Option.flatMap(
        Array.last(Navigation.parseStack(declared, path).pages),
        top =>
          isReadAloudPage(top)
            ? Option.some({ book: top.book, page: top.page })
            : Option.none(),
      )
    : Option.none()

/**
 * The public metadata of a link to one page of a book read aloud.
 * `books` are the books the server knows: Scribe's `things` rows read
 * with `bookOfThing`, or `readingsOfDirectory(…).books` on this laptop.
 * The address names the book by its ISBN-13, or by its Scribe id when it
 * has none, and the page. None for any other address, the shelf, a book
 * with no page in its address, or a book `books` does not hold with an
 * author and a cover; a book with an ISBN and no cover of its own takes
 * Open Library's cover for that ISBN.
 *
 * @example
 * ```typescript
 * readAloudLinkMetadataOf(books, '/books/read-aloud/9780063342705/page/4')
 * // Some({ title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book', author: 'Alice Schertle', pageLabel: 'Page 4 of 14', coverUrl: 'https://covers.openlibrary.org/b/id/15154333-L.jpg' })
 * ```
 */
export const readAloudLinkMetadataOf = (
  books: ReadonlyArray<Book>,
  path: string,
): Option.Option<ReadAloudLinkMetadata> =>
  Option.flatMap(pageOfPath(path), ({ book: key, page }) =>
    Option.flatMap(
      Array.findFirst(books, book => book.key === key),
      book =>
        Option.map(
          Option.all({ author: authorOf(book), coverUrl: coverUrlOf(book) }),
          ({ author, coverUrl }) => ({
            title: book.title,
            author,
            pageLabel: pageLabelOf(book, page),
            coverUrl,
          }),
        ),
    ),
  )
