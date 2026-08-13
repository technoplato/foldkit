import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { itemsFromCatalog, userDataFromAccount } from './catalog.js'

describe('catalog mapping', () => {
  test('maps Instant item rows onto shelf Items', () => {
    const items = itemsFromCatalog([
      {
        id: 'item-1',
        preferredKind: 'both',
        book: {
          title: 'A New Earth',
          authors: [{ name: 'Eckhart Tolle' }],
          cover: { path: '/media/a-new-earth.jpg' },
          chapters: [
            {
              id: 'ch-1',
              index: 1,
              title: 'EVOCATION',
              startMs: 18669,
              endMs: 483955,
            },
          ],
        },
        preferredAudio: {
          id: 'audio-1',
          files: [{ path: '/media/a-new-earth.mp3' }],
          segments: [
            {
              id: 'seg-1',
              index: 0,
              words: [
                {
                  text: 'Evocation',
                  relativeStartMs: 19309,
                  relativeEndMs: 19909,
                },
              ],
            },
          ],
        },
        preferredText: { id: 'text-1' },
      },
    ])
    expect(items).toHaveLength(1)
    expect(items[0]?.title).toBe('A New Earth')
    expect(items[0]?.authorLabel).toBe('Eckhart Tolle')
    expect(items[0]?.audioUrl).toEqual(Option.some('/media/a-new-earth.mp3'))
    expect(items[0]?.coverUrl).toEqual(Option.some('/media/a-new-earth.jpg'))
    expect(items[0]?.chapters[0]?.start).toBe(18.669)
    expect(items[0]?.words[0]?.start).toBe(19.309)
  })

  test('maps account bookmarks notes and progress', () => {
    const data = userDataFromAccount({
      bookmarks: [
        {
          id: 'b1',
          relativeMs: 20000,
          createdAt: 1,
          item: { id: 'item-1' },
          chapter: { id: 'ch-1' },
          rendition: { id: 'audio-1' },
        },
      ],
      notes: [
        {
          id: 'n1',
          body: 'first flower',
          relativeMs: 20000,
          createdAt: 1,
          updatedAt: 1,
          item: { id: 'item-1' },
          chapter: { id: 'ch-1' },
          rendition: { id: 'audio-1' },
        },
      ],
      progress: [
        {
          id: 'p1',
          relativeMs: 20000,
          finishedKind: 'unfinished',
          hiddenKind: 'visible',
          startedAt: 1,
          updatedAt: 2,
          item: { id: 'item-1' },
          chapter: { id: 'ch-1' },
          rendition: { id: 'audio-1' },
        },
      ],
    })
    expect(data.bookmarks[0]?.relative).toBe(20)
    expect(data.notes[0]?.body).toBe('first flower')
    expect(data.progress[0]?.relative).toBe(20)
    expect(data.progress[0]?.finished).toBe(false)
  })
})
