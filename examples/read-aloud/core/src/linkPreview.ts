import { Array, Option, Schema as S } from 'effect'
import { Navigation } from 'foldkit'

import { isReadAloudBook, isReadAloudPage } from './destination.js'
import type { BookKey, PageNumber } from './ids.js'
import type { Book } from './model.js'
import { declared, shelfPathOf } from './routes.js'

// LINK PREVIEW

/**
 * What a link to a book read aloud unfurls as, in strings only: the book's
 * title, who wrote it, the page or the book's length, and its cover from
 * Open Library. Never the book's words or its pages.
 */
export const ReadAloudLinkMetadata = S.Struct({
  title: S.String,
  author: S.String,
  pageLabel: S.String,
  coverUrl: S.String,
})
/** What a link to a book read aloud unfurls as. */
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
      isbn13 => `${openLibraryCovers}b/isbn/${isbn13}-L.jpg?default=false`,
    ),
  )

const authorOf = (book: Book): Option.Option<string> =>
  Array.match(book.authors, {
    onEmpty: () => Option.none(),
    onNonEmpty: authors => Option.some(Array.join(authors, ', ')),
  })

/**
 * True for every address under the books read aloud,
 * `/books/read-aloud` and `/books/read-aloud/9780063342705/page/4`, so a
 * server answers them only as Read Aloud does, never as another route.
 */
export const isReadAloudPath = (path: string): boolean =>
  Option.exists(
    shelfPathOf(),
    shelfPath => path === shelfPath || path.startsWith(`${shelfPath}/`),
  )

type LinkedBook = Readonly<{
  book: BookKey
  maybePage: Option.Option<PageNumber>
}>

/**
 * The book, and the page if there is one, a Read Aloud address names:
 * `/books/read-aloud/9780063342705/page/4` names book `9780063342705` at
 * page 4, and `/books/read-aloud/9780063342705` the book alone. None for
 * the shelf and any other address.
 */
export const linkedBookOf = (path: string): Option.Option<LinkedBook> =>
  isReadAloudPath(path)
    ? Option.flatMap(
        Array.last(Navigation.parseStack(declared, path).pages),
        (top): Option.Option<LinkedBook> => {
          if (isReadAloudPage(top)) {
            return Option.some({
              book: top.book,
              maybePage: Option.some(top.page),
            })
          } else if (isReadAloudBook(top)) {
            return Option.some({ book: top.book, maybePage: Option.none() })
          } else {
            return Option.none()
          }
        },
      )
    : Option.none()

const pageLabelOf = (
  book: Book,
  maybePage: Option.Option<PageNumber>,
): Option.Option<string> =>
  Option.match(maybePage, {
    onNone: () =>
      Option.some(
        Option.match(book.maybePageCount, {
          onNone: () => 'Read aloud',
          onSome: count => `${count.toString()} pages`,
        }),
      ),
    onSome: page =>
      Option.match(book.maybePageCount, {
        onNone: () => Option.some(`Page ${page.toString()}`),
        onSome: count =>
          page <= count
            ? Option.some(`Page ${page.toString()} of ${count.toString()}`)
            : Option.none(),
      }),
  })

/**
 * The public metadata of a link to a book read aloud, or to one of its
 * pages. `books` are the books the server knows: Scribe's `things` rows
 * read with `bookOfThing`, or `readAloudBooksLoader` on this laptop. The
 * address names the book by its ISBN-13, or by its Scribe id when it has
 * none. The page label is the page, `Page 4 of 14`, or for the book alone
 * its length, `14 pages`. None for any other address, the shelf, a page
 * past the book's end, or a book `books` does not hold with an author and
 * a cover; a book with an ISBN and no cover of its own takes Open
 * Library's cover for that ISBN, which is missing rather than blank when
 * Open Library has none.
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
  Option.flatMap(linkedBookOf(path), ({ book: key, maybePage }) =>
    Option.flatMap(
      Array.findFirst(books, book => book.key === key),
      book =>
        Option.map(
          Option.all({
            author: authorOf(book),
            coverUrl: coverUrlOf(book),
            pageLabel: pageLabelOf(book, maybePage),
          }),
          ({ author, coverUrl, pageLabel }) => ({
            title: book.title,
            author,
            pageLabel,
            coverUrl,
          }),
        ),
    ),
  )
