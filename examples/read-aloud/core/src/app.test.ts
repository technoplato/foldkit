import { Array, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import {
  type ListNode,
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
  ContributorKey,
  Isbn13,
  PageNumber,
  PublisherKey,
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
  type Moment,
  NoPreview,
  type PageTurn,
  type Readings,
  type Sitting,
} from './model.js'
import { googleBooksPreviewKind } from './screen.js'
import { uncheckedIsbnOf } from './subscriptions.js'

process.env['TZ'] = 'America/New_York'

const feelingHappyIsbn = Isbn13.make('9780063342705')

const christmasIsbn = Isbn13.make('9780544553729')

const feelingHappy: Book = {
  bookId: BookId.make('book-feeling-happy'),
  key: BookKey.make(feelingHappyIsbn),
  maybeIsbn13: Option.some(feelingHappyIsbn),
  title: 'Little Blue Truck Feeling Happy',
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
  aliases: [],
}

const christmas: Book = {
  bookId: BookId.make('book-christmas'),
  key: BookKey.make(christmasIsbn),
  maybeIsbn13: Option.some(christmasIsbn),
  title: "Little Blue Truck's Christmas",
  credits: [
    {
      role: 'Author',
      contributor: {
        key: ContributorKey.make('alice-schertle'),
        name: 'Alice Schertle',
      },
    },
  ],
  publishedBy: [
    {
      key: PublisherKey.make('houghton-mifflin-harcourt'),
      name: 'Houghton Mifflin Harcourt',
    },
  ],
  maybePublishYear: Option.some('2014'),
  maybePageCount: Option.some(PageNumber.make(24)),
  maybeCoverUrl: Option.none(),
  links: [],
  aliases: [],
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

const identityOnTop = (bound: Bound) =>
  Option.map(
    bound.navigation(),
    plan => Array.lastNonEmpty(plan.entries).identity,
  )

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

const listsOf = (node: UiNode): ReadonlyArray<ListNode> => {
  if (node._tag === 'List') {
    return [node]
  } else if (
    node._tag === 'Row' ||
    node._tag === 'Column' ||
    node._tag === 'Box' ||
    node._tag === 'DeviceShell'
  ) {
    return Array.flatMap(node.children, listsOf)
  } else {
    return []
  }
}

const creditsListOf = (bound: Bound) =>
  Option.map(
    Array.findFirst(listsOf(screenOf(bound)), list => list.label === 'Credits'),
    list =>
      Array.map(list.items, item => ({
        title: item.title,
        lines: item.lines,
        href: item.href,
      })),
  )

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

  it('says a book was read aloud when Scribe heard none of its pages', () => {
    const { bound, send } = bindApp()
    send(
      ReceivedReadings({
        readings: { books: [feelingHappy, christmas], turns: [] },
      }),
    )
    expect(
      Option.map(
        Array.findFirst(
          listsOf(screenOf(bound)),
          list => list.label === 'Books read aloud',
        ),
        list => Array.map(list.items, item => item.lines),
      ),
    ).toEqual(
      Option.some([
        ['Alice Schertle · 2024', 'Read aloud'],
        ['Alice Schertle · 2014', 'Read aloud'],
      ]),
    )
  })

  it("lists a book's credits on its page, as names while Read Aloud has no page for them", () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    bound.press(`OpenBook:${feelingHappy.key}`)
    expect(creditsListOf(bound)).toEqual(
      Option.some([
        { title: 'Alice Schertle', lines: ['Author'], href: undefined },
        { title: 'Noor Vale', lines: ['Illustrator'], href: undefined },
        {
          title: 'HarperCollins Publishers',
          lines: ['Publisher'],
          href: undefined,
        },
      ]),
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

  it('keeps a book one page while its pages turn, and makes another book a new page', () => {
    const { bound, receive } = bindApp()
    receive(pagesOneToFour)
    bound.press(`OpenBook:${feelingHappy.key}`)
    expect(identityOnTop(bound)).toEqual(pagePath(feelingHappy, 1))
    receive([...pagesOneToFour, pageFive])
    bound.press('NextPage')
    expect(uriOf(bound)).toEqual(pagePath(feelingHappy, 6))
    expect(identityOnTop(bound)).toEqual(pagePath(feelingHappy, 1))
    bound.openUri(
      `/books/read-aloud/${christmas.key}/page/24`,
      Navigation.Link(),
    )
    expect(identityOnTop(bound)).toEqual(pagePath(christmas, 1))
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

// Scribe #2182 (Recording 410 #882-884): "displaying the rich text of the
// book and the page of the book that we're on." "so that recordings and
// pages and chapters and things are all cross-referenced."
describe('The book in full', () => {
  const halloweenIsbn = Isbn13.make('9781368002578')
  const stories: ReadonlyArray<[string, number]> = [
    ["The Princess and the Frog: Tiana's Ghost", 1],
    ["Inside Out: Riley's Haunted Halloween", 17],
    ['Pinocchio: The Witch of Walddunkel Way', 33],
    ['Winnie the Pooh: Boo to You, Winnie the Pooh', 47],
    ['Big Hero 6: Trick or Treat', 63],
    ['Tangled: Marmalade Moon Night', 79],
    ['Peter Pan: A Trick for Hook', 95],
    ["Mickey & Friends: Mickey's Slumber Party", 111],
    ['Cinderella: A Costume for Cinderella', 127],
    ['Monsters, Inc.: Scariest Day Ever', 141],
    ['Alice in Wonderland: Happy Holler-ween!', 157],
    ['Wreck-It Ralph: Tricky Treats', 173],
  ]
  const halloween: Book = {
    bookId: BookId.make('book-halloween'),
    key: BookKey.make(halloweenIsbn),
    maybeIsbn13: Option.some(halloweenIsbn),
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
    publishedBy: [
      { key: PublisherKey.make('disney-press'), name: 'Disney Press' },
    ],
    maybePublishYear: Option.some('2018'),
    maybePageCount: Option.some(PageNumber.make(192)),
    maybeCoverUrl: Option.none(),
    links: [],
    aliases: [],
    contents: Array.map(stories, ([title, page]) => ({
      title,
      firstPage: PageNumber.make(page),
    })),
  }
  const momentOf = (
    recordingId: string,
    number: string,
    seconds: number,
    segmentId: string,
  ): Moment => ({
    recordingId,
    maybeRecordingNumber: Option.some(number),
    seconds,
    maybeSegmentId: Option.some(segmentId),
  })
  const at410 = (seconds: number, segmentId: string) =>
    momentOf('725c1dd4-a8fe-4256-b794-5886ae3888de', '410', seconds, segmentId)
  const at411 = (seconds: number, segmentId: string) =>
    momentOf('f592cdd1-0bab-4c26-be2f-4008a4fe26cf', '411', seconds, segmentId)
  const lastNight: Sitting = {
    readingId: ReadingId.make('reading-410'),
    bookId: halloween.bookId,
    startedAtMs: Date.parse('2026-11-10T22:06:31-05:00'),
    maybeEndedAtMs: Option.some(Date.parse('2026-11-10T22:18:03-05:00')),
    isOngoing: false,
    maybeFirstPage: Option.some(PageNumber.make(1)),
    maybeLastPage: Option.some(PageNumber.make(141)),
    maybeMoment: Option.some(at410(7102.27, 'segment-914')),
  }
  const thisMorning: Sitting = {
    readingId: ReadingId.make('reading-411'),
    bookId: halloween.bookId,
    startedAtMs: Date.parse('2026-11-11T09:20:44-05:00'),
    maybeEndedAtMs: Option.none(),
    isOngoing: true,
    maybeFirstPage: Option.some(PageNumber.make(141)),
    maybeLastPage: Option.some(PageNumber.make(141)),
    maybeMoment: Option.none(),
  }
  const pageTurn = (
    reading: string,
    page: number,
    turnedAt: string,
    isOngoing: boolean,
    maybeMoment: Option.Option<Moment>,
  ): PageTurn => ({
    turnId: TurnId.make(`${reading}-${page.toString()}`),
    bookId: halloween.bookId,
    readingId: ReadingId.make(reading),
    page: PageNumber.make(page),
    turnedAtMs: Date.parse(turnedAt),
    isOngoing,
    maybeMoment,
  })
  const readings: Readings = {
    books: [halloween],
    turns: [
      pageTurn(
        'reading-411',
        141,
        '2026-11-11T09:21:02-05:00',
        true,
        Option.some(at411(1543.52, 'segment-137')),
      ),
      pageTurn(
        'reading-410',
        140,
        '2026-11-10T22:07:47-05:00',
        false,
        Option.some(at410(7178, 'segment-926')),
      ),
      pageTurn(
        'reading-410',
        141,
        '2026-11-10T22:06:38-05:00',
        false,
        Option.none(),
      ),
    ],
    sittings: [thisMorning, lastNight],
  }
  const openAt = (page: number) => {
    const { bound, send } = bindApp()
    send(ReceivedReadings({ readings }))
    bound.openUri(
      `/books/read-aloud/9781368002578/page/${page.toString()}`,
      Navigation.Link(),
    )
    return bound
  }
  const listOf = (bound: Bound, label: string) =>
    Option.map(
      Array.findFirst(listsOf(screenOf(bound)), list => list.label === label),
      list =>
        Array.map(list.items, item => ({
          title: item.title,
          lines: item.lines,
          href: item.href,
        })),
    )

  it('names the story the page is in, with its pages', () => {
    expect(wordsOf(openAt(141))).toContain(
      'Monsters, Inc.: Scariest Day Ever · pages 141–156',
    )
    expect(wordsOf(openAt(192))).toContain(
      'Wreck-It Ralph: Tricky Treats · pages 173–192',
    )
  })

  it("lists the book's Contents, each story a link to its first page, the page's own story marked", () => {
    const contents = Option.getOrThrow(listOf(openAt(141), 'Contents'))
    expect(contents.length).toBe(12)
    expect(contents[0]).toEqual({
      title: "The Princess and the Frog: Tiana's Ghost",
      lines: ['pages 1–16'],
      href: '/books/read-aloud/9781368002578/page/1',
    })
    expect(contents[9]).toEqual({
      title: 'Monsters, Inc.: Scariest Day Ever',
      lines: ['pages 141–156', 'You are here'],
      href: '/books/read-aloud/9781368002578/page/141',
    })
  })

  it('lists every reading of the book, the newest first, with its date, recording, pages, and the line it began on', () => {
    expect(listOf(openAt(141), 'Read aloud')).toEqual(
      Option.some([
        {
          title: 'Nov 11, 2026, 9:20 AM',
          lines: ['page 141', 'Reading now'],
          href: undefined,
        },
        {
          title: 'Nov 10, 2026, 10:06 PM',
          lines: ['Recording 410 · pages 1–141'],
          href: 'https://og.pisspoursoftware.xyz/recording/725c1dd4-a8fe-4256-b794-5886ae3888de/section/segment-914?t=7102.27',
        },
      ]),
    )
  })

  it('lists each time the page on screen was read, each a link to the line the page was said on', () => {
    expect(listOf(openAt(141), 'This page')).toEqual(
      Option.some([
        {
          title: 'Nov 11, 2026, 9:21 AM',
          lines: ['Recording 411'],
          href: 'https://og.pisspoursoftware.xyz/recording/f592cdd1-0bab-4c26-be2f-4008a4fe26cf/section/segment-137?t=1543.52',
        },
        {
          title: 'Nov 10, 2026, 10:06 PM',
          lines: [],
          href: undefined,
        },
      ]),
    )
    expect(listOf(openAt(140), 'This page')).toEqual(
      Option.some([
        {
          title: 'Nov 10, 2026, 10:07 PM',
          lines: ['Recording 410'],
          href: 'https://og.pisspoursoftware.xyz/recording/725c1dd4-a8fe-4256-b794-5886ae3888de/section/segment-926?t=7178.00',
        },
      ]),
    )
    expect(listOf(openAt(2), 'This page')).toEqual(Option.none())
  })
})

