import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { decodeLibrary } from './instantLibrary.js'
import { decodeSegments } from './instantTranscript.js'

const itemRow = (
  itemId: string,
  title: string,
  addedAtMs: number,
  chapters: ReadonlyArray<
    Readonly<{ index: number; title: string; startMs: number; endMs: number }>
  >,
) => ({
  id: itemId,
  addedAtMs,
  book: [
    {
      title,
      authors: [{ name: 'Ada Quill' }],
      narrators: [{ name: 'Sam Reed' }],
      chapters,
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

describe('decodeLibrary', () => {
  it('reads a finished title in either vocabulary', () => {
    const finishedAs = (finishedKind: string) =>
      decodeLibrary({
        libraryItems: [itemRow('item-1', 'Small Hours', 1, chapters)],
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

  it('reads titles with chapters in order, their covers and audio, and unique name tags', () => {
    const { shelf } = decodeLibrary({
      libraryItems: [
        itemRow('item-1', 'The Lantern Keeper', 1, chapters),
        itemRow('item-2', 'The Lantern Keeper', 2, chapters),
        { id: 'broken', addedAtMs: 3 },
      ],
    })
    expect(shelf.titles.map(title => title.slug)).toEqual([
      'the-lantern-keeper',
      'the-lantern-keeper-2',
    ])
    const [first] = shelf.titles
    expect(
      first?.chapters.map(chapter => [chapter.chapterNumber, chapter.name]),
    ).toEqual([
      [1, 'One'],
      [2, 'Two'],
    ])
    expect(first?.maybeCoverUrl).toEqual(
      Option.some('https://files.example/cover.jpg'),
    )
    expect(first?.maybeAudioUrl).toEqual(
      Option.some('https://files.example/a.m4b'),
    )
  })

  it('reads a title with no chapters as one section, the whole book under its name', () => {
    const { shelf } = decodeLibrary({
      libraryItems: [itemRow('item-1', 'Notes from the Night Ferry', 1, [])],
    })
    expect(
      Array.map(shelf.titles, title => [
        title.name,
        title.durationMs,
        Array.map(title.chapters, chapter => [
          chapter.chapterNumber,
          chapter.name,
          chapter.startMs,
          chapter.endMs,
        ]),
      ]),
    ).toEqual([
      [
        'Notes from the Night Ferry',
        2_400_000,
        [[1, 'Notes from the Night Ferry', 0, 2_400_000]],
      ],
    ])
  })

  it('keeps the newest progress per title and the bookmarks that name a title', () => {
    const { shelf, index } = decodeLibrary({
      libraryItems: [itemRow('item-1', 'Small Hours', 1, chapters)],
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
