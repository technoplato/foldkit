import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { BookId, BookKey, Isbn13, PageNumber } from './ids.js'
import { isReadAloudPath, readAloudLinkMetadataOf } from './linkPreview.js'
import type { Book } from './model.js'

const feelingHappy: Book = {
  bookId: BookId.make('thing-feeling-happy'),
  key: BookKey.make('9780063342705'),
  maybeIsbn13: Option.some(Isbn13.make('9780063342705')),
  title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book',
  authors: ['Alice Schertle'],
  publishers: ['HarperCollins Publishers'],
  maybePublishYear: Option.some('2024'),
  maybePageCount: Option.some(PageNumber.make(14)),
  maybeCoverUrl: Option.some(
    'https://covers.openlibrary.org/b/id/15154333-M.jpg',
  ),
  links: [],
}

const christmas: Book = {
  ...feelingHappy,
  bookId: BookId.make('thing-christmas'),
  key: BookKey.make('9780544553729'),
  maybeIsbn13: Option.some(Isbn13.make('9780544553729')),
  title: "Little Blue Truck's Christmas",
  maybePageCount: Option.none(),
  maybeCoverUrl: Option.none(),
}

const noAuthor: Book = {
  ...feelingHappy,
  bookId: BookId.make('thing-no-author'),
  key: BookKey.make('thing-no-author'),
  maybeIsbn13: Option.none(),
  authors: [],
}

const books = [feelingHappy, christmas, noAuthor]

describe('Link metadata', () => {
  it('names the book, its author, the page, and its large Open Library cover', () => {
    expect(
      readAloudLinkMetadataOf(books, '/books/read-aloud/9780063342705/page/4'),
    ).toEqual(
      Option.some({
        title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book',
        author: 'Alice Schertle',
        pageLabel: 'Page 4 of 14',
        coverUrl: 'https://covers.openlibrary.org/b/id/15154333-L.jpg',
      }),
    )
  })

  it("takes Open Library's cover for the ISBN when the book has none of its own", () => {
    expect(
      readAloudLinkMetadataOf(books, '/books/read-aloud/9780544553729/page/3'),
    ).toEqual(
      Option.some({
        title: "Little Blue Truck's Christmas",
        author: 'Alice Schertle',
        pageLabel: 'Page 3',
        coverUrl:
          'https://covers.openlibrary.org/b/isbn/9780544553729-L.jpg?default=false',
      }),
    )
  })

  it('names a book with no page in its address by its length', () => {
    expect(
      [
        '/books/read-aloud/9780063342705',
        '/books/read-aloud/9780544553729',
      ].map(path =>
        Option.map(
          readAloudLinkMetadataOf(books, path),
          metadata => metadata.pageLabel,
        ),
      ),
    ).toEqual([Option.some('14 pages'), Option.some('Read aloud')])
  })

  it('has nothing for the shelf, a page past the end, an unknown book, or another address', () => {
    expect(
      [
        '/books/read-aloud',
        '/books/read-aloud/',
        '/books/read-aloud/9780063342705/page/15',
        '/books/read-aloud/9780063342705/page/4/more',
        '/books/read-aloud/9780152056612/page/3',
        '/books/read-aloud/thing-no-author/page/2',
        '/books/the-lantern-keeper',
        '/books/the-lantern-keeper/listen/12m03s',
      ].map(path => readAloudLinkMetadataOf(books, path)),
    ).toEqual(Array(8).fill(Option.none()))
  })

  it('knows which addresses are its own', () => {
    expect(
      [
        '/books/read-aloud',
        '/books/read-aloud/9780063342705/page/4',
        '/books/read-aloudx',
        '/books/the-lantern-keeper',
      ].map(isReadAloudPath),
    ).toEqual([true, true, false, false])
  })
})
