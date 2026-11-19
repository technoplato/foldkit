import { Array, Effect, Fiber, Option, Stream } from 'effect'
import { Navigation } from 'foldkit'
import { describe, expect, it } from 'vitest'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'

import { App } from './app.js'
import { TitleSlug } from './ids.js'
import {
  bookmarksQuery,
  chaptersQueryOf,
  decodeChapters,
  decodeLibrary,
  libraryQuery,
  makeInstantLibraryStore,
  placesQuery,
  titlesQuery,
} from './instantLibrary.js'
import { decodeSegments } from './instantTranscript.js'
import type { Shelf } from './model.js'
import { titleTagStands } from './nameTags.js'
import { sampleTitles } from './sample.js'

const itemRow = (itemId: string, title: string, addedAtMs: number) => ({
  id: itemId,
  addedAtMs,
  book: [
    {
      id: `book-of-${itemId}`,
      title,
      authors: [{ name: 'Ada Quill' }],
      narrators: [{ name: 'Sam Reed' }],
      cover: [{ blob: [{ url: 'https://files.example/cover.jpg' }] }],
    },
  ],
  preferredAudio: [
    {
      id: 'rendition-1',
      durationMs: 2_400_000,
      files: [{ blob: [{ url: 'https://files.example/a.m4b' }] }],
    },
  ],
})

const namesAt = (uri: string): ReadonlyArray<string> => {
  const stack = Navigation.parseStack(
    Option.getOrThrow(Option.fromNullishOr(App.navigation)),
    uri,
  )
  return Array.map(
    [
      stack.root,
      ...Array.map(Navigation.entriesOf(stack), entry => entry.destination),
    ],
    destination => destination._tag,
  )
}

const chapters = [
  { index: 1, title: 'Two', startMs: 1_200_000, endMs: 2_400_000 },
  { index: 0, title: 'One', startMs: 0, endMs: 1_200_000 },
]

const chapterRow = (
  bookId: string,
  chapter: Readonly<{
    index: number
    title: string
    startMs: number
    endMs: number
  }>,
) => ({
  id: `${bookId}-chapter-${chapter.index.toString()}`,
  ownerUserID: 'owner-1',
  formatVersion: 1,
  bindingKind: 'audiobook',
  book: bookId,
  ...chapter,
})

const chapterRows = (bookId: string) =>
  Array.map(chapters, chapter => chapterRow(bookId, chapter))

const lantern = Option.getOrThrow(Array.head(sampleTitles))

const fakeDatabase = () => {
  const subscriptions: Array<
    Readonly<{ query: unknown; respond: (response: unknown) => void }>
  > = []
  const database = {
    subscribeQuery: (query: unknown, respond: (response: unknown) => void) => {
      subscriptions.push({ query, respond })
      return () => undefined
    },
    subscribeAuth: () => () => undefined,
  }
  return {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    database: database as unknown as ProgramLogDatabase,
    subscriptions,
  }
}

// NOTE: A forked fiber starts on the scheduler's next turn, which Effect
// queues with setImmediate. A zero timeout queued after it runs first
// whenever about a millisecond passes before the turn ends, so waiting one
// tick for the fiber's subscription fails on a busy machine. Wait for the
// thing itself instead, a second at most.
const until = async (isSo: () => boolean): Promise<void> => {
  const tries = Array.range(1, 200)
  for (const _ of tries) {
    if (isSo()) {
      return
    }
    await new Promise(resolve => {
      setTimeout(resolve, 5)
    })
  }
}

describe('decodeLibrary', () => {
  it('reads a finished title in either vocabulary', () => {
    const finishedAs = (finishedKind: string) =>
      decodeLibrary({
        libraryItems: [itemRow('item-1', 'Small Hours', 1)],
        libraryProgress: [
          {
            id: 'p-1',
            relativeMs: 0,
            finishedKind,
            startedAtMs: 1,
            updatedAtMs: 2,
            item: [{ id: 'item-1' }],
          },
        ],
      }).shelf.progress.map(progress => progress._tag)
    expect(finishedAs('finished')).toEqual(['Finished'])
    expect(finishedAs('Finished')).toEqual(['Finished'])
    expect(finishedAs('unfinished')).toEqual(['InProgress'])
  })

  it('reads titles with their length, covers, audio, and unique name tags, and no chapters', () => {
    const { shelf, index } = decodeLibrary({
      libraryItems: [
        itemRow('item-1', 'The Lantern Keeper', 1),
        itemRow('item-2', 'The Lantern Keeper', 2),
        { id: 'broken', addedAtMs: 3 },
      ],
    })
    expect(shelf.titles.map(title => title.slug)).toEqual([
      'the-lantern-keeper',
      'the-lantern-keeper-2',
    ])
    const [first] = shelf.titles
    expect(first?.durationMs).toBe(2_400_000)
    expect(first?.maybeCoverUrl).toEqual(
      Option.some('https://files.example/cover.jpg'),
    )
    expect(first?.maybeAudioUrl).toEqual(
      Option.some('https://files.example/a.m4b'),
    )
    expect(first).not.toHaveProperty('chapters')
    expect(
      Option.map(
        Option.fromNullishOr(index.get(TitleSlug.make('the-lantern-keeper'))),
        entry => entry.bookId,
      ),
    ).toEqual(Option.some('book-of-item-1'))
  })

  it('keeps the newest progress per title and the bookmarks that name a title', () => {
    const { shelf, index } = decodeLibrary({
      libraryItems: [itemRow('item-1', 'Small Hours', 1)],
      libraryProgress: [
        {
          id: 'p-old',
          relativeMs: 10_000,
          finishedKind: 'unfinished',
          startedAtMs: 1,
          updatedAtMs: 5,
          item: [{ id: 'item-1' }],
        },
        {
          id: 'p-new',
          relativeMs: 90_000,
          finishedKind: 'unfinished',
          startedAtMs: 1,
          updatedAtMs: 9,
          item: [{ id: 'item-1' }],
        },
      ],
      libraryBookmarks: [
        {
          id: 'b-1',
          relativeMs: 30_000,
          createdAtMs: 4,
          item: [{ id: 'item-1' }],
        },
        {
          id: 'b-orphan',
          relativeMs: 1,
          createdAtMs: 4,
          item: [{ id: 'gone' }],
        },
      ],
    })
    expect(shelf.progress).toEqual([
      expect.objectContaining({
        _tag: 'InProgress',
        placeMs: 90_000,
        savedAtMs: 9,
      }),
    ])
    expect(shelf.bookmarks.map(bookmark => bookmark.bookmarkId)).toEqual([
      'b-1',
    ])
    expect(
      Option.map(
        Option.fromNullishOr(
          index.get(Option.getOrThrow(Array.head(shelf.titles)).slug),
        ),
        entry =>
          Option.map(entry.maybeProgress, progress => progress.progressId),
      ),
    ).toEqual(Option.some(Option.some('p-new')))
  })
})

describe('decodeLibrary: a title named like one of Books’ own screens', () => {
  // NOTE: A title's page and a screen cannot share an address: the exact
  // word opens the screen. A title whose name would make that word gets a
  // number, as a second title of the same name does, so its own link
  // opens it.
  const named = [
    'Menu',
    'Session',
    'Profile',
    'Add',
    'Audible',
    'Read Aloud',
    'Publishers',
    'Authors',
    'The Lantern Keeper',
  ]
  const { shelf } = decodeLibrary({
    libraryItems: Array.map(named, (name, index) =>
      itemRow(`item-${index.toString()}`, name, index),
    ),
  })
  const slugs = shelf.titles.map(title => title.slug)

  it('gives each a name tag that is not the screen’s word', () => {
    expect(slugs).toEqual([
      'menu-2',
      'session-2',
      'profile-2',
      'add-2',
      'audible-2',
      'read-aloud-2',
      'publishers-2',
      'authors-2',
      'the-lantern-keeper',
    ])
  })

  it('opens each title by its own address, and its player by its own', () => {
    for (const slug of slugs) {
      expect(namesAt(`/books/${slug}`), slug).toEqual([
        'LibraryPage',
        'TitlePage',
      ])
      expect(namesAt(`/books/${slug}/listen`), slug).toEqual([
        'LibraryPage',
        'TitlePage',
        'ListenPage',
      ])
      expect(titleTagStands(slug)).toBe(true)
    }
  })

  it('says which name tags a screen already answers to', () => {
    expect(
      Array.filter(
        ['menu', 'session', 'profile', 'add', 'audible', 'read-aloud'],
        tag => titleTagStands(tag),
      ),
    ).toEqual([])
    // `/books/authors` alone is free, but `/books/authors/listen` is a
    // person's page, so a title could not be played from its own link.
    expect(titleTagStands('authors')).toBe(false)
    expect(titleTagStands('the-lantern-keeper')).toBe(true)
    expect(titleTagStands('listen')).toBe(true)
  })
})

describe('decodeLibrary: a bookmark’s note and words', () => {
  const bookmarkRow = (fields: Readonly<Record<string, unknown>>) => ({
    id: 'b-1',
    relativeMs: 723_450,
    createdAtMs: 4,
    item: [{ id: 'item-1' }],
    ...fields,
  })

  const bookmarkOf = (fields: Readonly<Record<string, unknown>>) =>
    Array.head(
      decodeLibrary({
        libraryItems: [itemRow('item-1', 'Small Hours', 1)],
        libraryBookmarks: [bookmarkRow(fields)],
      }).shelf.bookmarks,
    )

  it('reads the note and the words a bookmark row keeps', () => {
    expect(
      bookmarkOf({
        note: 'why the lamp',
        excerptJSON: JSON.stringify({
          before: 'He trimmed the',
          word: 'wick',
          after: 'and waited',
        }),
      }),
    ).toEqual(
      Option.some(
        expect.objectContaining({
          atMs: 723_450,
          maybeNote: Option.some('why the lamp'),
          maybeExcerpt: Option.some({
            before: 'He trimmed the',
            word: 'wick',
            after: 'and waited',
          }),
        }),
      ),
    )
  })

  it('reads a row made before notes and words were kept, or with a cleared note, as having neither', () => {
    expect(bookmarkOf({})).toEqual(
      Option.some(
        expect.objectContaining({
          maybeNote: Option.none(),
          maybeExcerpt: Option.none(),
        }),
      ),
    )
    expect(
      Option.map(bookmarkOf({ note: '', excerptJSON: null }), bookmark => [
        bookmark.maybeNote,
        bookmark.maybeExcerpt,
      ]),
    ).toEqual(Option.some([Option.none(), Option.none()]))
  })

  it('keeps a bookmark whose words this build cannot read, without them', () => {
    expect(
      Option.map(
        bookmarkOf({ excerptJSON: '{"word":' }),
        bookmark => bookmark.maybeExcerpt,
      ),
    ).toEqual(Option.some(Option.none()))
  })
})

describe('decodeChapters', () => {
  it("reads one book's chapters in index order, numbered from one, leaving out a broken row", () => {
    const read = decodeChapters(
      {
        libraryChapters: [
          ...chapterRows('book-of-item-1'),
          { id: 'broken', book: 'book-of-item-1', title: 'No times' },
        ],
      },
      lantern,
    )
    expect(
      Array.map(read, chapter => [
        chapter.chapterNumber,
        chapter.name,
        chapter.startMs,
        chapter.endMs,
      ]),
    ).toEqual([
      [1, 'One', 0, 1_200_000],
      [2, 'Two', 1_200_000, 2_400_000],
    ])
  })

  it('reads a title with no chapters as one section, the whole book under its name', () => {
    expect(
      Array.map(decodeChapters({ libraryChapters: [] }, lantern), chapter => [
        chapter.chapterNumber,
        chapter.name,
        chapter.startMs,
        chapter.endMs,
      ]),
    ).toEqual([[1, lantern.name, 0, lantern.durationMs]])
  })
})

describe('makeInstantLibraryStore', () => {
  // NOTE: A live query hands its whole result over each time any row in
  // it changes. One query for the whole library sent every title, cover
  // and audio address again each time a place was saved, about every ten
  // seconds while a title plays. The library is read as three queries by
  // how often each changes, so a saved place sends the places.
  const answering = async (
    subscriptions: ReturnType<typeof fakeDatabase>['subscriptions'],
  ) => {
    await until(() => subscriptions.length === 3)
    const queryFor = (table: string) =>
      Option.getOrThrow(
        Array.findFirst(subscriptions, subscription =>
          JSON.stringify(subscription.query).startsWith(`{"${table}"`),
        ),
      )
    return {
      titles: queryFor('libraryItems'),
      places: queryFor('libraryProgress'),
      bookmarks: queryFor('libraryBookmarks'),
    }
  }

  const progressRow = (itemId: string, relativeMs: number) => ({
    id: `progress-of-${itemId}`,
    relativeMs,
    finishedKind: 'unfinished',
    startedAtMs: 1,
    updatedAtMs: 2 + relativeMs,
    item: [{ id: itemId }],
  })

  it("reads the shelf with three queries, by how often each changes, none joining the chapters, then a title's chapters by its book", async () => {
    const { database, subscriptions } = fakeDatabase()
    const store = await Effect.runPromise(makeInstantLibraryStore(database))
    const shelfRead = Effect.runFork(Stream.runHead(store.shelf))
    const queries = await answering(subscriptions)
    expect(subscriptions.map(subscription => subscription.query)).toEqual([
      titlesQuery,
      placesQuery,
      bookmarksQuery,
    ])
    expect(JSON.stringify(titlesQuery)).not.toContain('libraryProgress')
    expect(JSON.stringify(placesQuery)).not.toContain('libraryItems')
    expect(
      JSON.stringify([titlesQuery, placesQuery, bookmarksQuery]),
    ).not.toContain('chapters')
    // One read that is not live still asks for all three at once.
    expect(libraryQuery).toEqual({
      ...titlesQuery,
      ...placesQuery,
      ...bookmarksQuery,
    })
    queries.titles.respond({
      data: { libraryItems: [itemRow('item-1', 'Small Hours', 1)] },
    })
    queries.places.respond({
      data: { libraryProgress: [progressRow('item-1', 30_000)] },
    })
    queries.bookmarks.respond({ data: { libraryBookmarks: [] } })
    const maybeShelf = await Effect.runPromise(Fiber.join(shelfRead))
    expect(
      Option.map(maybeShelf, shelf => [
        Array.map(shelf.titles, title => title.slug),
        Array.map(shelf.progress, progress =>
          progress._tag === 'InProgress' ? progress.placeMs : -1,
        ),
      ]),
    ).toEqual(Option.some([['small-hours'], [30_000]]))

    const chaptersRead = Effect.runFork(
      Stream.runHead(store.chapters(TitleSlug.make('small-hours'))),
    )
    await until(() => subscriptions.length === 4)
    const chaptersQuery = subscriptions[3]
    expect(chaptersQuery?.query).toEqual(chaptersQueryOf('book-of-item-1'))
    chaptersQuery?.respond({
      data: { libraryChapters: chapterRows('book-of-item-1') },
    })
    const maybeChapters = await Effect.runPromise(Fiber.join(chaptersRead))
    expect(
      Option.map(maybeChapters, read =>
        Array.map(read, chapter => chapter.name),
      ),
    ).toEqual(Option.some(['One', 'Two']))
  })

  it('takes a saved place from the places query alone, a small part of what the one query sent again', async () => {
    const items = Array.map(Array.range(1, 65), number =>
      itemRow(
        `item-${number.toString()}`,
        `Made-up Title ${number.toString()}`,
        number,
      ),
    )
    const places = [progressRow('item-1', 30_000), progressRow('item-2', 5_000)]
    const { database, subscriptions } = fakeDatabase()
    const store = await Effect.runPromise(makeInstantLibraryStore(database))
    const shelves: Array<Shelf> = []
    const reading = Effect.runFork(
      Stream.runForEach(store.shelf, shelf =>
        Effect.sync(() => {
          shelves.push(shelf)
        }),
      ),
    )
    const queries = await answering(subscriptions)
    queries.titles.respond({ data: { libraryItems: items } })
    queries.places.respond({ data: { libraryProgress: places } })
    queries.bookmarks.respond({ data: { libraryBookmarks: [] } })
    await until(() => shelves.length === 1)
    // Ten seconds later a place is saved: only the places are sent again.
    const moved = [progressRow('item-1', 40_000), progressRow('item-2', 5_000)]
    queries.places.respond({ data: { libraryProgress: moved } })
    await until(() => shelves.length === 2)
    await Effect.runPromise(Fiber.interrupt(reading))
    const placeOf = (shelf: Shelf | undefined) =>
      Array.map(shelf?.progress ?? [], progress =>
        progress._tag === 'InProgress' ? progress.placeMs : -1,
      )
    expect(placeOf(shelves[1])).toEqual([40_000, 5_000])
    expect(shelves[1]?.titles.length).toBe(65)
    const sentForOnePlace = JSON.stringify({ libraryProgress: moved }).length
    const sentByOneQuery = JSON.stringify({
      libraryItems: items,
      libraryProgress: moved,
      libraryBookmarks: [],
    }).length
    expect(sentForOnePlace * 20).toBeLessThan(sentByOneQuery)
  })

  it('keeps a cover’s and an audio file’s address when the store only renews its signature', async () => {
    const endsInHours = (hours: number): string =>
      Math.floor((Date.now() + hours * 3_600_000) / 1_000).toString()
    const signedRow = (signature: string, hours: number) => ({
      ...itemRow('item-1', 'Small Hours', 1),
      book: [
        {
          id: 'book-of-item-1',
          title: 'Small Hours',
          authors: [{ name: 'Noor Vale' }],
          narrators: [{ name: 'Noor Vale' }],
          cover: [
            {
              blob: [
                {
                  url: `https://files.example/made-up/1/cover?Expires=${endsInHours(hours)}&Signature=${signature}`,
                },
              ],
            },
          ],
        },
      ],
    })
    const { database, subscriptions } = fakeDatabase()
    const store = await Effect.runPromise(makeInstantLibraryStore(database))
    const covers: Array<string> = []
    const reading = Effect.runFork(
      Stream.runForEach(store.shelf, shelf =>
        Effect.sync(() => {
          covers.push(
            Option.getOrElse(
              Option.flatMap(
                Array.head(shelf.titles),
                title => title.maybeCoverUrl,
              ),
              () => '',
            ),
          )
        }),
      ),
    )
    const queries = await answering(subscriptions)
    queries.titles.respond({ data: { libraryItems: [signedRow('first', 24)] } })
    queries.places.respond({ data: { libraryProgress: [] } })
    queries.bookmarks.respond({ data: { libraryBookmarks: [] } })
    await until(() => covers.length === 1)
    queries.titles.respond({
      data: { libraryItems: [signedRow('second', 48)] },
    })
    queries.places.respond({
      data: { libraryProgress: [progressRow('item-1', 10_000)] },
    })
    await until(() => covers.length >= 2)
    await Effect.runPromise(Fiber.interrupt(reading))
    expect(Array.dedupe(covers)).toEqual([covers[0]])
    expect(covers[0]).toContain('Signature=first')
  })

  it("fails with Instant's own words when a query cannot be answered", async () => {
    const { database, subscriptions } = fakeDatabase()
    const store = await Effect.runPromise(makeInstantLibraryStore(database))
    const shelfRead = Effect.runFork(Effect.flip(Stream.runHead(store.shelf)))
    const queries = await answering(subscriptions)
    queries.places.respond({
      error: {
        message: 'Operation timed out: handle-receive',
        hint: { 'timeout-ms': 5000 },
      },
    })
    const error = await Effect.runPromise(Fiber.join(shelfRead))
    expect(error.reason).toEqual(
      'the library could not be read: Operation timed out: handle-receive',
    )
  })

  it('refuses the chapters of a title that is not on the shelf', async () => {
    const { database } = fakeDatabase()
    const store = await Effect.runPromise(makeInstantLibraryStore(database))
    const error = await Effect.runPromise(
      Effect.flip(Stream.runHead(store.chapters(TitleSlug.make('gone')))),
    )
    expect(error.reason).toEqual('that title is not in the library')
  })
})

describe('decodeSegments', () => {
  it('reads each segment as a passage, its words with their ids or made ones', () => {
    const passages = decodeSegments({
      librarySegments: [
        {
          id: 'segment-1',
          relativeStartMs: 18_700,
          relativeEndMs: 484_000,
          wordsJSON: JSON.stringify([
            {
              id: 'w0',
              kind: 'word',
              text: ' Evocation',
              relativeStartMs: 19_300,
              relativeEndMs: 20_100,
            },
            { text: 'Earth,', relativeStartMs: 22_000, relativeEndMs: 22_600 },
            { text: '   ', relativeStartMs: 22_600, relativeEndMs: 22_700 },
          ]),
        },
        { id: 'broken', relativeStartMs: 0, relativeEndMs: 1, wordsJSON: '{' },
      ],
    })
    expect(
      Array.map(passages, passage => [
        passage.passageId,
        Array.map(passage.words, word => [
          word.wordId,
          word.text,
          word.startMs,
        ]),
      ]),
    ).toEqual([
      [
        'segment-1',
        [
          ['w0', 'Evocation', 19_300],
          ['segment-1.1', 'Earth,', 22_000],
        ],
      ],
      ['broken', []],
    ])
  })
})
