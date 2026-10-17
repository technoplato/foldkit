import { Array, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { type ListNode, type UiNode, textsOf } from 'foldkit/renderers'
import * as ReadAloud from 'read-aloud-core-example'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import { ReceivedShelf } from './message.js'
import { contributorPathOf, publisherPathOf } from './routes.js'
import { sampleShelf } from './sample.js'

const creditOf = (
  role: ReadAloud.CreditRole,
  name: string,
  key: string,
): ReadAloud.Credit => ({
  role,
  contributor: { key: ReadAloud.ContributorKey.make(key), name },
})

const harborHouse: ReadAloud.Publisher = {
  key: ReadAloud.PublisherKey.make('harbor-house'),
  name: 'Harbor House',
}

const harborLights: ReadAloud.Book = {
  bookId: ReadAloud.BookId.make('thing-harbor-lights'),
  key: ReadAloud.BookKey.make('9780000000019'),
  maybeIsbn13: Option.some(ReadAloud.Isbn13.make('9780000000019')),
  title: 'Harbor Lights',
  credits: [
    creditOf('Author', 'Ada Quill', 'ada-quill'),
    creditOf('Illustrator', 'Noor Vale', 'noor-vale'),
    creditOf('Editor', 'Iris Penn', 'iris-penn'),
  ],
  publishedBy: [harborHouse],
  maybePublishYear: Option.some('2019'),
  maybePageCount: Option.some(ReadAloud.PageNumber.make(32)),
  maybeCoverUrl: Option.none(),
  links: [],
}

const tidePools: ReadAloud.Book = {
  bookId: ReadAloud.BookId.make('thing-tide-pools'),
  key: ReadAloud.BookKey.make('9780000000026'),
  maybeIsbn13: Option.some(ReadAloud.Isbn13.make('9780000000026')),
  title: 'Tide Pools',
  credits: [
    creditOf('Author', 'Ada Quill', 'ada-quill'),
    creditOf('Illustrator', 'Ada Quill', 'ada-quill'),
  ],
  publishedBy: [harborHouse],
  maybePublishYear: Option.some('2021'),
  maybePageCount: Option.some(ReadAloud.PageNumber.make(24)),
  maybeCoverUrl: Option.none(),
  links: [],
}

const readings = ReadAloud.ReceivedReadings({
  readings: { books: [harborLights, tidePools], turns: [] },
})

const bindApp = () => {
  let model: AppModel = App.update(
    App.init()[0],
    ReceivedShelf({ shelf: sampleShelf }),
  )[0]
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      model = App.update(model, message)[0]
    },
    stop: () => Promise.resolve(),
  }
  const bound = Interaction.bind(App, handle)
  handle.send(readings)
  return bound
}

type Bound = ReturnType<typeof bindApp>

const opened = (path: string): Bound => {
  const bound = bindApp()
  bound.openUri(path, Navigation.Link())
  return bound
}

const uriOf = (bound: Bound) => Option.map(bound.navigation(), plan => plan.uri)

const entryUrisOf = (bound: Bound) =>
  Option.map(bound.navigation(), plan =>
    Array.map(plan.entries, entry => entry.uri),
  )

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

const linksOf = (bound: Bound) =>
  Array.getSomes(
    Array.map(textsOf(screenOf(bound)), text =>
      Option.map(Option.fromNullishOr(text.href), href => ({
        words: text.content,
        href,
      })),
    ),
  )

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

const rowsOf = (bound: Bound, label: string) =>
  Option.map(listOf(bound, label), rows =>
    Array.map(rows, row => ({ title: row.title, href: row.href })),
  )

describe('Credits in Books', () => {
  it("names a book read aloud's author, illustrator, editor, and publisher, each a link to its page in Books", () => {
    const bound = opened('/books/read-aloud/9780000000019/page/1')
    expect(listOf(bound, 'Credits')).toEqual(
      Option.some([
        {
          title: 'Ada Quill',
          lines: ['Author'],
          href: '/books/authors/ada-quill',
        },
        {
          title: 'Noor Vale',
          lines: ['Illustrator'],
          href: '/books/illustrators/noor-vale',
        },
        {
          title: 'Iris Penn',
          lines: ['Editor'],
          href: '/books/editors/iris-penn',
        },
        {
          title: 'Harbor House',
          lines: ['Publisher'],
          href: '/books/publishers/harbor-house',
        },
      ]),
    )
  })

  it("opens an author's page above the library, and lists their books read aloud, each a link to the book", () => {
    const bound = opened('/books/authors/ada-quill')
    expect(entryUrisOf(bound)).toEqual(
      Option.some(['/books', '/books/authors/ada-quill']),
    )
    expect(wordsOf(bound)).toEqual(
      expect.arrayContaining(['Ada Quill', 'Author']),
    )
    expect(rowsOf(bound, 'Books read aloud')).toEqual(
      Option.some([
        { title: 'Harbor Lights', href: '/books/read-aloud/9780000000019' },
        { title: 'Tide Pools', href: '/books/read-aloud/9780000000026' },
      ]),
    )
  })

  it("lists the library's audiobooks an author wrote on their page", () => {
    const bound = opened('/books/authors/ada-quill')
    expect(rowsOf(bound, 'In your library')).toEqual(
      Option.some([
        { title: 'The Lantern Keeper', href: '/books/the-lantern-keeper' },
      ]),
    )
  })

  it("links a person's other roles from their page, each to its own page", () => {
    const bound = opened('/books/authors/ada-quill')
    expect(linksOf(bound)).toContainEqual({
      words: 'Also an illustrator',
      href: '/books/illustrators/ada-quill',
    })
    const illustrated = opened('/books/illustrators/ada-quill')
    expect(rowsOf(illustrated, 'Books read aloud')).toEqual(
      Option.some([
        { title: 'Tide Pools', href: '/books/read-aloud/9780000000026' },
      ]),
    )
    expect(linksOf(illustrated)).toContainEqual({
      words: 'Also an author',
      href: '/books/authors/ada-quill',
    })
  })

  it("opens an illustrator's, an editor's, and a publisher's page with the books each made", () => {
    expect(
      rowsOf(opened('/books/illustrators/noor-vale'), 'Books read aloud'),
    ).toEqual(
      Option.some([
        { title: 'Harbor Lights', href: '/books/read-aloud/9780000000019' },
      ]),
    )
    expect(
      rowsOf(opened('/books/editors/iris-penn'), 'Books read aloud'),
    ).toEqual(
      Option.some([
        { title: 'Harbor Lights', href: '/books/read-aloud/9780000000019' },
      ]),
    )
    const publisher = opened('/books/publishers/harbor-house')
    expect(wordsOf(publisher)).toEqual(
      expect.arrayContaining(['Harbor House', 'Publisher']),
    )
    expect(rowsOf(publisher, 'Books read aloud')).toEqual(
      Option.some([
        { title: 'Harbor Lights', href: '/books/read-aloud/9780000000019' },
        { title: 'Tide Pools', href: '/books/read-aloud/9780000000026' },
      ]),
    )
  })

  it('prints each credit page at its address, and reads the address back to the same page', () => {
    const pages: ReadonlyArray<readonly [Option.Option<string>, string]> = [
      [
        contributorPathOf('Author', ReadAloud.ContributorKey.make('ada-quill')),
        '/books/authors/ada-quill',
      ],
      [
        contributorPathOf(
          'Illustrator',
          ReadAloud.ContributorKey.make('noor-vale'),
        ),
        '/books/illustrators/noor-vale',
      ],
      [
        contributorPathOf('Editor', ReadAloud.ContributorKey.make('iris-penn')),
        '/books/editors/iris-penn',
      ],
      [
        publisherPathOf(ReadAloud.PublisherKey.make('harbor-house')),
        '/books/publishers/harbor-house',
      ],
    ]
    Array.forEach(pages, ([printed, path]) => {
      expect(printed).toEqual(Option.some(path))
      expect(uriOf(opened(path))).toEqual(Option.some(path))
    })
  })

  it('says so when no book names a person in that role', () => {
    const bound = opened('/books/editors/ada-quill')
    expect(wordsOf(bound)).toEqual(
      expect.arrayContaining([
        'Ada Quill',
        'Editor',
        'No book read aloud names Ada Quill as an editor.',
      ]),
    )
  })

  it("links a library title's authors to their pages", () => {
    const bound = opened('/books/a-field-guide-to-weather')
    expect(linksOf(bound)).toEqual(
      expect.arrayContaining([
        { words: 'Iris Penn', href: '/books/authors/iris-penn' },
        { words: 'Tomas Hale', href: '/books/authors/tomas-hale' },
      ]),
    )
  })
})
