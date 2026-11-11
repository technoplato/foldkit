import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  BookId,
  BookKey,
  ContributorKey,
  Isbn13,
  PageNumber,
  PublisherKey,
} from './ids.js'
import { isReadAloudPath, readAloudLinkMetadataOf } from './linkPreview.js'
import type { Book } from './model.js'

const feelingHappy: Book = {
  bookId: BookId.make('thing-feeling-happy'),
  key: BookKey.make('9780063342705'),
  maybeIsbn13: Option.some(Isbn13.make('9780063342705')),
  title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book',
  credits: [
    {
      role: 'Author',
      contributor: {
        key: ContributorKey.make('alice-schertle'),
        name: 'Alice Schertle',
      },
    },
    {
      role: 'Illustrator',
      contributor: { key: ContributorKey.make('noor-vale'), name: 'Noor Vale' },
    },
  ],
  publishedBy: [
    {
      key: PublisherKey.make('harpercollins-publishers'),
      name: 'HarperCollins Publishers',
    },
  ],
  maybePublishYear: Option.some('2024'),
  maybePageCount: Option.some(PageNumber.make(14)),
  maybeCoverUrl: Option.some(
    'https://covers.openlibrary.org/b/id/15154333-M.jpg',
  ),
  links: [],
  aliases: [],
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
  credits: [
    {
      role: 'Illustrator',
      contributor: { key: ContributorKey.make('noor-vale'), name: 'Noor Vale' },
    },
  ],
}

const noCover: Book = {
  ...noAuthor,
  bookId: BookId.make('thing-no-cover'),
  key: BookKey.make('thing-no-cover'),
  title: 'A Book Nobody Photographed',
  maybeCoverUrl: Option.none(),
}

const halloween: Book = {
  ...feelingHappy,
  bookId: BookId.make('thing-halloween-isbn'),
  key: BookKey.make('9781368002578'),
  maybeIsbn13: Option.some(Isbn13.make('9781368002578')),
  title: '5-Minute Halloween Stories',
  credits: [
    {
      role: 'Author',
      contributor: {
        key: ContributorKey.make('disney-storybook-art-team'),
        name: 'Disney Storybook Art Team',
      },
    },
  ],
  maybePageCount: Option.some(PageNumber.make(192)),
  maybeCoverUrl: Option.some(
    'https://covers.openlibrary.org/b/id/8811043-M.jpg',
  ),
  aliases: [
    BookKey.make('thing-halloween-isbn'),
    BookKey.make('thing-halloween-work'),
    BookKey.make('1368002579'),
    BookKey.make('OL20165102W'),
  ],
}

const books = [feelingHappy, christmas, noAuthor, noCover, halloween]

describe('Link metadata', () => {
  it('names the book, its author but not its illustrator, the page, and its large Open Library cover', () => {
    expect(
      readAloudLinkMetadataOf(books, '/books/read-aloud/9780063342705/page/4'),
    ).toEqual(
      Option.some({
        title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book',
        maybeAuthor: Option.some('Alice Schertle'),
        pageLabel: 'Page 4 of 14',
        maybeCoverUrl: Option.some(
          'https://covers.openlibrary.org/b/id/15154333-L.jpg',
        ),
        canonicalPath: '/books/read-aloud/9780063342705/page/4',
      }),
    )
  })

  it("takes Open Library's cover for the ISBN when the book has none of its own", () => {
    expect(
      readAloudLinkMetadataOf(books, '/books/read-aloud/9780544553729/page/3'),
    ).toEqual(
      Option.some({
        title: "Little Blue Truck's Christmas",
        maybeAuthor: Option.some('Alice Schertle'),
        pageLabel: 'Page 3',
        maybeCoverUrl: Option.some(
          'https://covers.openlibrary.org/b/isbn/9780544553729-L.jpg?default=false',
        ),
        canonicalPath: '/books/read-aloud/9780544553729/page/3',
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
        '/books/read-aloud/9781368002578/page/193',
        '/books/the-lantern-keeper',
        '/books/the-lantern-keeper/listen/12m03s',
      ].map(path => readAloudLinkMetadataOf(books, path)),
    ).toEqual(Array(8).fill(Option.none()))
  })

  // Scribe #2182 (Recording 410 #935-937, 2026-11-10): Open Library's record of
  // the edition he read had no author, so its preview answered nothing, the
  // public address said Not found, and the book never showed as recognized.
  it('answers for a kept book with no author, with the page and no byline', () => {
    expect(
      readAloudLinkMetadataOf(
        books,
        '/books/read-aloud/thing-no-author/page/2',
      ),
    ).toEqual(
      Option.some({
        title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book',
        maybeAuthor: Option.none(),
        pageLabel: 'Page 2 of 14',
        maybeCoverUrl: Option.some(
          'https://covers.openlibrary.org/b/id/15154333-L.jpg',
        ),
        canonicalPath: '/books/read-aloud/thing-no-author/page/2',
      }),
    )
  })

  it('answers for a kept book with no cover and no ISBN, with no picture', () => {
    expect(
      Option.map(
        readAloudLinkMetadataOf(books, '/books/read-aloud/thing-no-cover'),
        metadata => metadata.maybeCoverUrl,
      ),
    ).toEqual(Option.some(Option.none()))
  })

  it('answers under every name the book is kept by, and names its own address', () => {
    expect(
      [
        '/books/read-aloud/9781368002578/page/141',
        '/books/read-aloud/1368002579/page/141',
        '/books/read-aloud/thing-halloween-work/page/141',
        '/books/read-aloud/thing-halloween-isbn',
        '/books/read-aloud/OL20165102W',
      ].map(path =>
        Option.map(readAloudLinkMetadataOf(books, path), metadata => [
          metadata.title,
          metadata.pageLabel,
          metadata.canonicalPath,
        ]),
      ),
    ).toEqual([
      Option.some([
        '5-Minute Halloween Stories',
        'Page 141 of 192',
        '/books/read-aloud/9781368002578/page/141',
      ]),
      Option.some([
        '5-Minute Halloween Stories',
        'Page 141 of 192',
        '/books/read-aloud/9781368002578/page/141',
      ]),
      Option.some([
        '5-Minute Halloween Stories',
        'Page 141 of 192',
        '/books/read-aloud/9781368002578/page/141',
      ]),
      Option.some([
        '5-Minute Halloween Stories',
        '192 pages',
        '/books/read-aloud/9781368002578',
      ]),
      Option.some([
        '5-Minute Halloween Stories',
        '192 pages',
        '/books/read-aloud/9781368002578',
      ]),
    ])
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
