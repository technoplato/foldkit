import { Array, Option, Schema as S } from 'effect'
import { Navigation } from 'foldkit'

import { isReadAloudBook, isReadAloudPage } from './destination.js'
import type { BookKey, PageNumber } from './ids.js'
import { type Book, bookNamedIn, contributorsAs } from './model.js'
import { bookPathOf, declared, pagePathOf, shelfPathOf } from './routes.js'

// LINK PREVIEW

/**
 * What a link to a book read aloud unfurls as, in strings only: the book's
 * title, who wrote it when the catalog says, the page or the book's
 * length, its cover from Open Library when there is one, and the book's
 * own address, `canonicalPath`, which names it by its key whichever of its
 * names the link used. Never the book's words or its pages.
 */
export const ReadAloudLinkMetadata = S.Struct({
  title: S.String,
  maybeAuthor: S.Option(S.String),
  pageLabel: S.String,
  maybeCoverUrl: S.Option(S.String),
  canonicalPath: S.String,
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
  Array.match(contributorsAs(book, 'Author'), {
    onEmpty: () => Option.none(),
    onNonEmpty: authors =>
      Option.some(
        Array.join(
          Array.map(authors, author => author.name),
          ', ',
        ),
      ),
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

const canonicalPathOf = (
  book: Book,
  maybePage: Option.Option<PageNumber>,
): Option.Option<string> =>
  Option.match(maybePage, {
    onNone: () => bookPathOf(book.key),
    onSome: page => pagePathOf(book.key, page),
  })

/**
 * The public metadata of a link to a book read aloud, or to one of its
 * pages. `books` are the books the server knows: Scribe's `things` rows
 * read with `readingsOfRows`, or `readAloudBooksLoader` on this laptop.
 * The address may name the book by any of its names, its key or an alias;
 * `canonicalPath` names it by its key. The page label is the page, `Page 4
 * of 14`, or for the book alone its length, `14 pages`. A book the catalog
 * names no author for has no byline, and a book with no cover and no ISBN
 * has no picture: a kept book's page always answers. None only for any
 * other address, the shelf, a page past the book's end, or a book `books`
 * does not hold. A book with an ISBN and no cover of its own takes Open
 * Library's cover for that ISBN, which is missing rather than blank when
 * Open Library has none.
 *
 * Scribe #2182 (Recording 410, 2026-11-10): this once needed an author, and
 * the edition he read had none in Open Library, so its link said Not found.
 *
 * @example
 * ```typescript
 * readAloudLinkMetadataOf(books, '/books/read-aloud/9780063342705/page/4')
 * // Some({ title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book', maybeAuthor: Some('Alice Schertle'), pageLabel: 'Page 4 of 14', maybeCoverUrl: Some('https://covers.openlibrary.org/b/id/15154333-L.jpg'), canonicalPath: '/books/read-aloud/9780063342705/page/4' })
 * ```
 */
export const readAloudLinkMetadataOf = (
  books: ReadonlyArray<Book>,
  path: string,
): Option.Option<ReadAloudLinkMetadata> =>
  Option.flatMap(linkedBookOf(path), ({ book: key, maybePage }) =>
    Option.flatMap(bookNamedIn(books, key), book =>
      Option.map(
        Option.all({
          pageLabel: pageLabelOf(book, maybePage),
          canonicalPath: canonicalPathOf(book, maybePage),
        }),
        ({ pageLabel, canonicalPath }) => ({
          title: book.title,
          maybeAuthor: authorOf(book),
          pageLabel,
          maybeCoverUrl: coverUrlOf(book),
          canonicalPath,
        }),
      ),
    ),
  )
