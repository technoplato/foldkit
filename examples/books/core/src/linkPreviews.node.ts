import { Array, Match as M, Option } from 'effect'
import * as ReadAloud from 'read-aloud-core-example'

import {
  type PublicAnswer,
  type PublicRoutes,
  linkPreviewAnswer,
  signInPathFor,
} from '@foldkit/instant'
import { init } from '@instantdb/admin'

import { decodeLibrary, libraryQuery } from './instantLibrary.js'
import {
  type MomentLink,
  type TitleLink,
  booksLinkOf,
  coverPathOf,
  previewLineOf,
} from './linkPreview.js'
import type { Title } from './model.js'

/**
 * Where Books link previews come from: the public origin links name, such
 * as `https://books.pisspoursoftware.xyz`, the owner's titles, a way to
 * fetch a cover from storage, and the picture books the owner read aloud,
 * such as `readAloudBooksLoader` over Scribe's logs on this laptop.
 */
export type BooksLinkPreviewConfig = Readonly<{
  origin: string
  loadTitles: () => Promise<ReadonlyArray<Title>>
  fetchCover: (url: string) => Promise<Response>
  loadReadAloudBooks: () => Promise<ReadonlyArray<ReadAloud.Book>>
  nowMs?: () => number
}>

const titlesFreshMs = 5 * 60 * 1000

const readAloudBooksFreshMs = 60 * 1000

const coverFreshMs = 24 * 60 * 60 * 1000

const coverMaxBytes = 5 * 1024 * 1024

type Cached<A> = Readonly<{ value: A; savedAtMs: number }>

const previewOf = (
  config: BooksLinkPreviewConfig,
  title: Title,
  link: TitleLink | MomentLink,
  path: string,
): PublicAnswer =>
  linkPreviewAnswer({
    siteName: 'Books',
    title: title.name,
    description: previewLineOf(title, link),
    maybeImageUrl: Option.map(
      title.maybeCoverUrl,
      () => `${config.origin}${coverPathOf(title.slug)}`,
    ),
    url: `${config.origin}${path}`,
    openPath: signInPathFor(path),
  })

const readAloudPreviewOf = (
  config: BooksLinkPreviewConfig,
  metadata: ReadAloud.ReadAloudLinkMetadata,
  path: string,
): PublicAnswer =>
  linkPreviewAnswer({
    siteName: 'Books',
    title: metadata.title,
    description: `${metadata.pageLabel}, by ${metadata.author}`,
    maybeImageUrl: Option.some(metadata.coverUrl),
    url: `${config.origin}${path}`,
    openPath: signInPathFor(path),
  })

const imageTypeOf = (response: Response): string => {
  const type = response.headers.get('content-type') ?? ''
  return type.startsWith('image/') ? type : 'image/jpeg'
}

/**
 * The public routes of Books: a preview page for a title or a moment in
 * it, with its name, authors, the moment's time, and its cover, and the
 * cover itself; and for a picture book read aloud, or one of its pages,
 * its title, "Page 4 of 14, by Alice Schertle", and its Open Library
 * cover. Nothing else about the library, its progress, bookmarks, or
 * words, and nothing about what was read when. Titles are read again
 * after five minutes, the books read aloud after a minute, and covers
 * after a day. The books read aloud, `/books/read-aloud`, have no preview.
 *
 * @example
 * ```typescript
 * hostedIdentity({ publicRoutes: booksLinkPreviews({ origin, loadTitles, fetchCover: fetch, loadReadAloudBooks }) })
 * // '/books/a-new-earth' → a page titled "A New Earth" with "by Eckhart Tolle" and its cover; '/books/profile' → 404
 * ```
 */
export const booksLinkPreviews = (
  config: BooksLinkPreviewConfig,
): PublicRoutes => {
  const nowMs = config.nowMs ?? Date.now
  let maybeTitles: Option.Option<Cached<ReadonlyArray<Title>>> = Option.none()
  let maybeReadAloudBooks: Option.Option<
    Cached<ReadonlyArray<ReadAloud.Book>>
  > = Option.none()
  const covers = new Map<string, Cached<PublicAnswer>>()

  const isFresh = (cached: Cached<unknown>, freshMs: number): boolean =>
    nowMs() - cached.savedAtMs < freshMs

  const titlesNow = async (): Promise<ReadonlyArray<Title>> => {
    const maybeFresh = Option.filter(maybeTitles, cached =>
      isFresh(cached, titlesFreshMs),
    )
    if (Option.isSome(maybeFresh)) {
      return maybeFresh.value.value
    } else {
      const titles = await config.loadTitles()
      maybeTitles = Option.some({ value: titles, savedAtMs: nowMs() })
      return titles
    }
  }

  const readAloudBooksNow = async (): Promise<
    ReadonlyArray<ReadAloud.Book>
  > => {
    const maybeFresh = Option.filter(maybeReadAloudBooks, cached =>
      isFresh(cached, readAloudBooksFreshMs),
    )
    if (Option.isSome(maybeFresh)) {
      return maybeFresh.value.value
    } else {
      const books = await config.loadReadAloudBooks()
      maybeReadAloudBooks = Option.some({ value: books, savedAtMs: nowMs() })
      return books
    }
  }

  const readAloudAnswerOf = async (
    path: string,
  ): Promise<Option.Option<PublicAnswer>> =>
    Option.map(
      ReadAloud.readAloudLinkMetadataOf(await readAloudBooksNow(), path),
      metadata => readAloudPreviewOf(config, metadata, path),
    )

  const coverOf = async (
    title: Title,
  ): Promise<Option.Option<PublicAnswer>> => {
    const maybeCached = Option.filter(
      Option.fromNullishOr(covers.get(title.slug)),
      cached => isFresh(cached, coverFreshMs),
    )
    if (Option.isSome(maybeCached)) {
      return Option.some(maybeCached.value.value)
    } else if (Option.isNone(title.maybeCoverUrl)) {
      return Option.none()
    }
    const response = await config.fetchCover(title.maybeCoverUrl.value)
    if (!response.ok) {
      return Option.none()
    }
    const body = new Uint8Array(await response.arrayBuffer())
    if (body.byteLength > coverMaxBytes) {
      return Option.none()
    }
    const answer: PublicAnswer = {
      status: 200,
      headers: {
        'content-type': imageTypeOf(response),
        'cache-control': 'public, max-age=86400',
        'x-robots-tag': 'noindex',
      },
      body,
    }
    covers.set(title.slug, { value: answer, savedAtMs: nowMs() })
    return Option.some(answer)
  }

  return async ({ path }) => {
    if (ReadAloud.isReadAloudPath(path)) {
      return readAloudAnswerOf(path)
    }
    const maybeLink = booksLinkOf(path)
    if (Option.isNone(maybeLink)) {
      return Option.none()
    }
    const link = maybeLink.value
    const maybeTitle = Array.findFirst(
      await titlesNow(),
      title => title.slug === link.slug,
    )
    if (Option.isNone(maybeTitle)) {
      return Option.none()
    }
    const title = maybeTitle.value
    return M.value(link).pipe(
      M.tagsExhaustive({
        CoverLink: () => coverOf(title),
        TitleLink: titleLink =>
          Promise.resolve(
            Option.some(previewOf(config, title, titleLink, path)),
          ),
        MomentLink: momentLink =>
          Promise.resolve(
            Option.some(previewOf(config, title, momentLink, path)),
          ),
      }),
    )
  }
}

/**
 * Reads one person's titles with the Instant admin token, as that person,
 * so their library permissions still apply: the same query and decoding
 * the app uses, so a slug names the same title in both.
 */
export const instantTitlesLoader =
  (
    config: Readonly<{ appId: string; adminToken: string; ownerEmail: string }>,
  ) =>
  async (): Promise<ReadonlyArray<Title>> => {
    const database = init({
      appId: config.appId,
      adminToken: config.adminToken,
    })
    const data = await database
      .asUser({ email: config.ownerEmail })
      .query(libraryQuery)
    return decodeLibrary(data).shelf.titles
  }
