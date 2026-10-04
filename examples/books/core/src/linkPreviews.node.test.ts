import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { linkPreviewAnswer } from '@foldkit/instant'

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

const previewsWith = () => {
  const loads: Array<number> = []
  const fetched: Array<string> = []
  let nowMs = 0
  const routes = booksLinkPreviews({
    origin,
    loadTitles: async () => {
      loads.push(nowMs)
      return titles()
    },
    fetchCover: async url => {
      fetched.push(url)
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png' },
      })
    },
    nowMs: () => nowMs,
  })
  const answer = (path: string) =>
    routes({ path, query: new URLSearchParams() })
  const advanceMs = (ms: number) => {
    nowMs += ms
  }
  return { answer, loads, fetched, advanceMs }
}

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
})
