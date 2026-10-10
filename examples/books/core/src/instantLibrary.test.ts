import { Array, Effect, Fiber, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'

import { TitleSlug } from './ids.js'
import {
  chaptersQueryOf,
  decodeChapters,
  decodeLibrary,
  libraryQuery,
  makeInstantLibraryStore,
} from './instantLibrary.js'
import { decodeSegments } from './instantTranscript.js'
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

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0))

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
  it("reads the shelf with one query that never joins the chapters, then a title's chapters by its book", async () => {
    const { database, subscriptions } = fakeDatabase()
    const store = await Effect.runPromise(makeInstantLibraryStore(database))
    const shelfRead = Effect.runFork(Stream.runHead(store.shelf))
    await nextTick()
    expect(subscriptions.map(subscription => subscription.query)).toEqual([
      libraryQuery,
    ])
    expect(JSON.stringify(libraryQuery)).not.toContain('chapters')
    const [shelfQuery] = subscriptions
    shelfQuery?.respond({
      data: { libraryItems: [itemRow('item-1', 'Small Hours', 1)] },
    })
    const maybeShelf = await Effect.runPromise(Fiber.join(shelfRead))
    expect(
      Option.map(maybeShelf, shelf =>
        Array.map(shelf.titles, title => title.slug),
      ),
    ).toEqual(Option.some(['small-hours']))

    const chaptersRead = Effect.runFork(
      Stream.runHead(store.chapters(TitleSlug.make('small-hours'))),
    )
    await nextTick()
    const [, chaptersQuery] = subscriptions
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

  it("fails with Instant's own words when a query cannot be answered", async () => {
    const { database, subscriptions } = fakeDatabase()
    const store = await Effect.runPromise(makeInstantLibraryStore(database))
    const shelfRead = Effect.runFork(Effect.flip(Stream.runHead(store.shelf)))
    await nextTick()
    const [shelfQuery] = subscriptions
    shelfQuery?.respond({
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
