import { Array, Option } from 'effect'
import * as ReadAloud from 'read-aloud-core-example'
import { describe, expect, it } from 'vitest'

import {
  type PublicAnswer,
  type PublicRoutes,
  linkPreviewAnswer,
} from '@foldkit/instant'

import { TitleSlug } from './ids.js'
import { booksLinkPreviews } from './linkPreviews.node.js'
import type { Title } from './model.js'
import { sampleTitles } from './sample.js'

const origin = 'https://books.example'

const coverUrl = 'https://storage.example/covers/lantern.jpg'

const lantern = (): Title => {
  const title = Option.getOrThrow(
    Array.findFirst(
      sampleTitles,
      each => each.slug === TitleSlug.make('the-lantern-keeper'),
    ),
  )
  return { ...title, maybeCoverUrl: Option.some(coverUrl) }
}

const titles = (): ReadonlyArray<Title> => [
  lantern(),
  ...Array.filter(
    sampleTitles,
    each => each.slug !== TitleSlug.make('the-lantern-keeper'),
  ),
]

const feelingHappy: ReadAloud.Book = {
  bookId: ReadAloud.BookId.make('thing-feeling-happy'),
  key: ReadAloud.BookKey.make('9780063342705'),
  maybeIsbn13: Option.some(ReadAloud.Isbn13.make('9780063342705')),
  title: 'Little Blue Truck Feeling Happy',
  authors: ['Alice Schertle'],
  publishers: ['HarperCollins Publishers'],
  maybePublishYear: Option.some('2024'),
  maybePageCount: Option.some(ReadAloud.PageNumber.make(14)),
  maybeCoverUrl: Option.some(
    'https://covers.openlibrary.org/b/id/15154333-M.jpg',
  ),
  links: [],
}

const readAloudTitle = (): Title => ({
  ...lantern(),
  slug: TitleSlug.make('read-aloud'),
})

const previewsWith = (
  extraTitles: ReadonlyArray<Title> = [],
): Readonly<{
  answer: (path: string) => ReturnType<PublicRoutes>
  loads: ReadonlyArray<number>
  readAloudLoads: ReadonlyArray<number>
  fetched: ReadonlyArray<string>
  advanceMs: (ms: number) => void
}> => {
  const loads: Array<number> = []
  const readAloudLoads: Array<number> = []
  const fetched: Array<string> = []
  let nowMs = 0
  const routes = booksLinkPreviews({
    origin,
    loadTitles: async () => {
      loads.push(nowMs)
      return [...titles(), ...extraTitles]
    },
    fetchCover: async url => {
      fetched.push(url)
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png' },
      })
    },
    loadReadAloudBooks: async () => {
      readAloudLoads.push(nowMs)
      return [feelingHappy]
    },
    nowMs: () => nowMs,
  })
  const answer = (path: string) =>
    routes({ path, query: new URLSearchParams() })
  const advanceMs = (ms: number) => {
    nowMs += ms
  }
  return { answer, loads, readAloudLoads, fetched, advanceMs }
}

const bodyOf = (maybeAnswer: Option.Option<PublicAnswer>): string =>
  Option.match(maybeAnswer, {
    onNone: () => '',
    onSome: preview => String(preview.body),
  })

describe('booksLinkPreviews', () => {
  it('previews a title with its name, author, and cover', async () => {
    const { answer } = previewsWith()
    expect(await answer('/books/the-lantern-keeper')).toEqual(
      Option.some(
        linkPreviewAnswer({
          siteName: 'Books',
          title: 'The Lantern Keeper',
          description: 'by Ada Quill',
          maybeImageUrl: Option.some(
            `${origin}/books/the-lantern-keeper/cover`,
          ),
          url: `${origin}/books/the-lantern-keeper`,
          openPath: '/__foldkit/sign-in?next=%2Fbooks%2Fthe-lantern-keeper',
        }),
      ),
    )
  })

  it('previews a moment with its time and no cover when there is none', async () => {
    const { answer } = previewsWith()
    const maybeAnswer = await answer('/books/small-hours/listen/12m03s')
    const body = Option.match(maybeAnswer, {
      onNone: () => '',
      onSome: preview => String(preview.body),
    })
    expect(body).toContain('content="Listen from 12:03, by Noor Vale"')
    expect(body).not.toContain('og:image')
  })

  it('serves the cover bytes, fetched once a day', async () => {
    const { answer, fetched, advanceMs } = previewsWith()
    const cover = Option.getOrThrow(
      await answer('/books/the-lantern-keeper/cover'),
    )
    expect(cover.headers['content-type']).toBe('image/png')
    expect(cover.body).toEqual(new Uint8Array([1, 2, 3]))
    await answer('/books/the-lantern-keeper/cover')
    advanceMs(25 * 60 * 60 * 1000)
    await answer('/books/the-lantern-keeper/cover')
    expect(fetched).toEqual([coverUrl, coverUrl])
  })

  it('answers nothing for an unknown title, a coverless cover, or another path', async () => {
    const { answer } = previewsWith()
    expect(await answer('/books/not-in-the-library')).toEqual(Option.none())
    expect(await answer('/books/small-hours/cover')).toEqual(Option.none())
    expect(await answer('/books/profile/contents')).toEqual(Option.none())
    expect(await answer('/assets/index.js')).toEqual(Option.none())
  })

  it('reads the titles again only after five minutes', async () => {
    const { answer, loads, advanceMs } = previewsWith()
    await answer('/books/the-lantern-keeper')
    advanceMs(60_000)
    await answer('/books/small-hours')
    advanceMs(5 * 60_000)
    await answer('/books/small-hours')
    expect(loads).toEqual([0, 360_000])
  })

  it('previews a page of a book read aloud with its title, the page, the author, and the Open Library cover', async () => {
    const { answer } = previewsWith()
    expect(await answer('/books/read-aloud/9780063342705/page/4')).toEqual(
      Option.some(
        linkPreviewAnswer({
          siteName: 'Books',
          title: 'Little Blue Truck Feeling Happy',
          description: 'Page 4 of 14, by Alice Schertle',
          maybeImageUrl: Option.some(
            'https://covers.openlibrary.org/b/id/15154333-L.jpg',
          ),
          url: `${origin}/books/read-aloud/9780063342705/page/4`,
          openPath:
            '/__foldkit/sign-in?next=%2Fbooks%2Fread-aloud%2F9780063342705%2Fpage%2F4',
        }),
      ),
    )
  })

  it('previews a book read aloud with no page by its length', async () => {
    const { answer } = previewsWith()
    expect(bodyOf(await answer('/books/read-aloud/9780063342705'))).toContain(
      'content="14 pages, by Alice Schertle"',
    )
  })

  it('answers nothing for the books read aloud, a page past the end, or a book never read aloud', async () => {
    const { answer } = previewsWith([readAloudTitle()])
    expect(await answer('/books/read-aloud')).toEqual(Option.none())
    expect(await answer('/books/read-aloud/9780063342705/page/15')).toEqual(
      Option.none(),
    )
    expect(await answer('/books/read-aloud/9780152056612/page/3')).toEqual(
      Option.none(),
    )
  })

  it('reads the books read aloud again only after a minute', async () => {
    const { answer, readAloudLoads, advanceMs } = previewsWith()
    await answer('/books/read-aloud/9780063342705/page/4')
    advanceMs(30_000)
    await answer('/books/read-aloud/9780063342705/page/5')
    advanceMs(31_000)
    await answer('/books/read-aloud/9780063342705/page/6')
    expect(readAloudLoads).toEqual([0, 61_000])
  })
})
