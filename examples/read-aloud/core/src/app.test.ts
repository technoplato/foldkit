import { Array, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import {
  type TextNode,
  type UiNode,
  buttonsOf,
  textsOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import {
  BookId,
  BookKey,
  Isbn13,
  PageNumber,
  ReadingId,
  TurnId,
} from './ids.js'
import {
  FailedReadReadings,
  ReceivedPreview,
  ReceivedReadings,
} from './message.js'
import {
  type Book,
  GooglePreview,
  NoPreview,
  type PageTurn,
  type Readings,
} from './model.js'
import { googleBooksPreviewKind } from './screen.js'
import { uncheckedIsbnOf } from './subscriptions.js'

const feelingHappyIsbn = Isbn13.make('9780063342705')

const christmasIsbn = Isbn13.make('9780544553729')

const feelingHappy: Book = {
  bookId: BookId.make('book-feeling-happy'),
  key: BookKey.make(feelingHappyIsbn),
  maybeIsbn13: Option.some(feelingHappyIsbn),
  title: 'Little Blue Truck Feeling Happy',
  authors: ['Alice Schertle'],
  publishers: ['HarperCollins Publishers'],
  maybePublishYear: Option.some('2024'),
  maybePageCount: Option.some(PageNumber.make(14)),
  maybeCoverUrl: Option.some(
    'https://covers.openlibrary.org/b/id/15154333-M.jpg',
  ),
  links: [
    {
      label: 'Open Library',
      url: 'https://openlibrary.org/books/OL50729385M',
      isVerified: true,
    },
    {
      label: 'Bookshop.org',
      url: 'https://bookshop.org/book/9780063342705',
      isVerified: false,
    },
  ],
}

const christmas: Book = {
  bookId: BookId.make('book-christmas'),
  key: BookKey.make(christmasIsbn),
  maybeIsbn13: Option.some(christmasIsbn),
  title: "Little Blue Truck's Christmas",
  authors: ['Alice Schertle'],
  publishers: ['Houghton Mifflin Harcourt'],
  maybePublishYear: Option.some('2014'),
  maybePageCount: Option.some(PageNumber.make(24)),
  maybeCoverUrl: Option.none(),
  links: [],
}

const turnOf = (
  book: Book,
  reading: string,
  page: number,
  turnedAtMs: number,
  isOngoing: boolean,
): PageTurn => ({
  turnId: TurnId.make(`${reading}-page-${page.toString()}`),
  bookId: book.bookId,
  readingId: ReadingId.make(reading),
  page: PageNumber.make(page),
  turnedAtMs,
  isOngoing,
})

const readingsOf = (turns: ReadonlyArray<PageTurn>): Readings => ({
  books: [feelingHappy, christmas],
  turns: Array.reverse(turns),
})

const pagesOneToFour: ReadonlyArray<PageTurn> = [
  turnOf(christmas, 'last-week', 24, 1_000, false),
  turnOf(feelingHappy, 'tonight', 1, 10_000, false),
  turnOf(feelingHappy, 'tonight', 2, 20_000, false),
  turnOf(feelingHappy, 'tonight', 3, 30_000, false),
  turnOf(feelingHappy, 'tonight', 4, 40_000, true),
]

const pageFive = turnOf(feelingHappy, 'tonight', 5, 50_000, true)

const pageSix = turnOf(feelingHappy, 'tonight', 6, 60_000, true)

const endedAt = (turn: PageTurn): PageTurn => ({ ...turn, isOngoing: false })

const bindApp = () => {
  let model: AppModel = App.init()[0]
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      model = App.update(model, message)[0]
    },
    stop: () => Promise.resolve(),
  }
  const bound = Interaction.bind(App, handle)
  const receive = (turns: ReadonlyArray<PageTurn>) => {
    handle.send(ReceivedReadings({ readings: readingsOf(turns) }))
  }
  return { bound, send: handle.send, receive }
}

type Bound = ReturnType<typeof bindApp>['bound']

const uriOf = (bound: Bound) => Option.map(bound.navigation(), plan => plan.uri)

const pagePath = (book: Book, page: number) =>
  Option.some(`/books/read-aloud/${book.key}/page/${page.toString()}`)

const screenOf = (bound: Bound): UiNode =>
  Option.getOrThrow(
    Option.flatMap(Navigation.frameOf(bound), frame =>
      frame.base.view._tag === 'Screen'
        ? Option.some(frame.base.view.node)
        : Option.none(),
    ),
  )

const wordsOf = (bound: Bound): ReadonlyArray<string> =>
  Array.map(textsOf(screenOf(bound)), text => text.content)

const embedOf = (bound: Bound): Option.Option<TextNode> =>
  Array.findFirst(
    textsOf(screenOf(bound)),
    text => text.embed?.kind === googleBooksPreviewKind,
  )

const availabilityOf = (bound: Bound, tag: string) =>
  Option.map(
    Array.findFirst(bound.entries(), entry => entry.tag === tag),
    entry => entry.availability,
  )

const christmasPreview = GooglePreview({
  volumeId: 'l2WMBAAAQBAJ',
  extent: 'Partial',
  previewUrl:
    'https://books.google.com/books?id=l2WMBAAAQBAJ&source=gbs_ViewAPI',
})

describe('Read Aloud', () => {
  it('shows the books read aloud, the one being read now first', () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    expect(uriOf(bound)).toEqual(Option.some('/books/read-aloud'))
    expect(wordsOf(bound)).toContain(
      'Reading now: Little Blue Truck Feeling Happy, page 4 of 14.',
    )
  })

  it('opens a book at the page being read, and the address names that page', () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    bound.press(`OpenBook:${feelingHappy.key}`)
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 4))
    expect(wordsOf(bound)).toContain('Page 4')
    expect(wordsOf(bound)).toContain(
      'Following along. The page turns here when Scribe hears you turn it.',
    )
  })

  it('turns the page when Scribe hears the reader turn it', () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    bound.press(`OpenBook:${feelingHappy.key}`)
    receive([...pagesOneToFour, pageFive])
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 5))
    receive([...pagesOneToFour, pageFive, pageSix])
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 6))
  })

  it('keeps the page a link names until the reader turns another', () => {
    const { bound, receive } = bindApp()
    bound.openUri(
      `/books/read-aloud/${feelingHappy.key}/page/2`,
      Navigation.Link(),
    )
    receive(pagesOneToFour)
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 2))
    receive(pagesOneToFour)
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 2))
    receive([...pagesOneToFour, pageFive])
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 5))
  })

  it('keeps a linked page while Scribe rewrites pages it already had', () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    bound.openUri(
      `/books/read-aloud/${feelingHappy.key}/page/2`,
      Navigation.Link(),
    )
    receive(Array.map(pagesOneToFour, endedAt))
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 2))
  })

  it('says why the books could not be opened', () => {
    const { bound, send } = bindApp()
    send(FailedReadReadings({ reason: 'the read-aloud endpoint stopped' }))
    expect(wordsOf(bound)).toContain(
      'The books you read aloud could not be opened: the read-aloud endpoint stopped',
    )
  })

  it('opens an address with no page at the page being read, or the first page', () => {
    const { bound, receive } = bindApp()
    bound.openUri(`/books/read-aloud/${feelingHappy.key}`, Navigation.Link())
    receive(pagesOneToFour)
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 4))
    bound.openUri(`/books/read-aloud/${christmas.key}`, Navigation.Link())
    expect(uriOf(bound)).toEqual(pagePath(christmas, 1))
  })

  it('turns pages by hand within the book, and holds them until the next page Scribe hears', () => {
    const { bound, receive } = bindApp()
    receive(Array.map(pagesOneToFour, endedAt))
    bound.press(`OpenBook:${feelingHappy.key}`)
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 1))
    expect(availabilityOf(bound, 'PreviousPage')).toEqual(
      Option.some({ _tag: 'Disabled', because: 'this is the first page' }),
    )
    bound.pressKey(Interaction.keyInput('ArrowRight'))
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 2))
    bound.press('TurnToPage:14')
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 14))
    expect(availabilityOf(bound, 'NextPage')).toEqual(
      Option.some({ _tag: 'Disabled', because: 'this is the last page' }),
    )
    expect(bound.press('TurnToPage:15')).toBe(false)
    receive(Array.map(pagesOneToFour, endedAt))
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 14))
    receive([...Array.map(pagesOneToFour, endedAt), pageFive])
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 5))
  })

  it('follows the reading again after someone turned away from it', () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    bound.press(`OpenBook:${christmas.key}`)
    expect(uriOf(bound)).toEqual(pagePath(christmas, 1))
    expect(wordsOf(bound)).toContain(
      'Scribe hears Little Blue Truck Feeling Happy being read now, at page 4.',
    )
    bound.pressKey(Interaction.keyInput('f'))
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 4))
    expect(availabilityOf(bound, 'FollowReading')).toEqual(
      Option.some({ _tag: 'Disabled', because: 'this is the page being read' }),
    )
  })

  it('asks once whether the book on screen has a preview, then embeds it at the page', () => {
    const { bound, receive, send } = bindApp()
    receive(pagesOneToFour)
    bound.openUri(
      `/books/read-aloud/${christmas.key}/page/3`,
      Navigation.Link(),
    )
    expect(uncheckedIsbnOf(bound.readModel())).toEqual(
      Option.some(christmasIsbn),
    )
    expect(wordsOf(bound)).toContain('Looking for a preview…')
    send(ReceivedPreview({ isbn13: christmasIsbn, preview: christmasPreview }))
    expect(uncheckedIsbnOf(bound.readModel())).toEqual(Option.none())
    expect(Option.map(embedOf(bound), text => text.embed?.params)).toEqual(
      Option.some(
        expect.objectContaining({
          volume: 'ISBN:9780544553729',
          page: '3',
        }),
      ),
    )
    bound.press('NextPage')
    expect(
      Option.map(embedOf(bound), text => text.embed?.params['page']),
    ).toEqual(Option.some('4'))
    expect(Option.map(embedOf(bound), text => text.href)).toEqual(
      Option.some('https://books.google.com/books?id=l2WMBAAAQBAJ&pg=PA4'),
    )
    expect(uriOf(bound)).toEqual(pagePath(christmas, 4))
  })

  it('shows no Share button on its own, where nothing can share a link', () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    bound.press(`OpenBook:${feelingHappy.key}`)
    expect(
      Array.filter(
        buttonsOf(screenOf(bound)),
        button => button.label === 'Share',
      ),
    ).toEqual([])
  })

  it('says clearly that a book has no preview, and shows its details and only the links that check out', () => {
    const { bound, receive, send } = bindApp()
    receive(pagesOneToFour)
    bound.press(`OpenBook:${feelingHappy.key}`)
    send(ReceivedPreview({ isbn13: feelingHappyIsbn, preview: NoPreview() }))
    expect(embedOf(bound)).toEqual(Option.none())
    expect(wordsOf(bound)).toEqual(
      expect.arrayContaining(['No preview available', 'Open Library']),
    )
    expect(
      Array.filter(wordsOf(bound), words => words.startsWith('Bookshop')),
    ).toEqual([])
  })

  it('opens a link to a book it has no reading of, by its ISBN, and still looks for a preview', () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    bound.openUri('/books/read-aloud/9780152056612/page/3', Navigation.Link())
    expect(uriOf(bound)).toEqual(
      Option.some('/books/read-aloud/9780152056612/page/3'),
    )
    expect(uncheckedIsbnOf(bound.readModel())).toEqual(
      Option.some(Isbn13.make('9780152056612')),
    )
  })

  it('prints every address the way it parses, and parses every one it prints', () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    Array.forEach(
      [
        '/books/read-aloud',
        `/books/read-aloud/${feelingHappy.key}/page/4`,
        `/books/read-aloud/${christmas.key}/page/24`,
      ],
      uri => {
        bound.openUri(uri, Navigation.Link())
        expect(uriOf(bound)).toEqual(Option.some(uri))
      },
    )
    expect(
      bound.canonicalUri(`/books/read-aloud/${feelingHappy.key}/page/04`),
    ).toEqual(Option.some(`/books/read-aloud/${feelingHappy.key}/page/4`))
  })
})
