import { Array, Match as M, Option, Schema as S, String } from 'effect'
import { ts } from 'foldkit/schema'
import { PlaceSegment } from 'transcript-player-core-example'

import { Milliseconds, TitleSlug, clockOf } from './ids.js'
import type { Title } from './model.js'

// LINK

/** A link to one title, `/books/a-new-earth`. */
export const TitleLink = ts('TitleLink', { slug: TitleSlug })
/** A link to one title. */
export type TitleLink = typeof TitleLink.Type

/** A link to one moment of a title, `/books/a-new-earth/listen/1h00m00s`. */
export const MomentLink = ts('MomentLink', {
  slug: TitleSlug,
  atMs: Milliseconds,
})
/** A link to one moment of a title. */
export type MomentLink = typeof MomentLink.Type

/** A title's cover, the picture its previews show, `/books/a-new-earth/cover`. */
export const CoverLink = ts('CoverLink', { slug: TitleSlug })
/** A title's cover. */
export type CoverLink = typeof CoverLink.Type

/** A Books link that anyone it is sent to may see a preview of. */
export const BooksLink = S.Union([TitleLink, MomentLink, CoverLink])
/** A Books link that anyone may preview. */
export type BooksLink = typeof BooksLink.Type

const decodeSlug = S.decodeUnknownOption(TitleSlug)

const decodePlace = S.decodeUnknownOption(PlaceSegment)

/**
 * The previewable link a path names: a title, a moment in it, or its
 * cover. None for every other path, such as `/books/profile` or a chapter
 * list, so a preview never names more than its link.
 *
 * @example
 * ```typescript
 * booksLinkOf('/books/a-new-earth/listen/1h00m00s') // Some(MomentLink({ slug: 'a-new-earth', atMs: 3600000 }))
 * booksLinkOf('/books/a-new-earth/contents') // None
 * ```
 */
export const booksLinkOf = (path: string): Option.Option<BooksLink> => {
  const segments = Array.filter(String.split(path, '/'), String.isNonEmpty)
  const segmentAt = (index: number): string =>
    Option.getOrElse(Array.get(segments, index), () => '')
  const kind = segmentAt(2)
  if (segmentAt(0) !== 'books') {
    return Option.none()
  }
  return Option.flatMap(decodeSlug(segmentAt(1)), slug => {
    if (segments.length === 2 || (segments.length === 3 && kind === 'listen')) {
      return Option.some(TitleLink({ slug }))
    } else if (segments.length === 3 && kind === 'cover') {
      return Option.some(CoverLink({ slug }))
    } else if (segments.length === 4 && kind === 'listen') {
      return Option.map(decodePlace(segmentAt(3)), atMs =>
        MomentLink({ slug, atMs }),
      )
    } else {
      return Option.none()
    }
  })
}

/** The path of a title's cover, `/books/a-new-earth/cover`. */
export const coverPathOf = (slug: TitleSlug): string => `/books/${slug}/cover`

const bylineOf = (title: Title): string =>
  Array.match(title.authors, {
    onEmpty: () => 'An audiobook',
    onNonEmpty: authors => `by ${Array.join(authors, ', ')}`,
  })

/**
 * The one line under a preview's title: who wrote it, and for a moment,
 * where it starts. Nothing past the title's name, authors, and the time.
 *
 * @example
 * ```typescript
 * previewLineOf(title, MomentLink({ slug, atMs: 3600000 })) // 'Listen from 1:00:00, by Eckhart Tolle'
 * ```
 */
export const previewLineOf = (
  title: Title,
  link: TitleLink | MomentLink,
): string =>
  M.value(link).pipe(
    M.tagsExhaustive({
      TitleLink: () => bylineOf(title),
      MomentLink: ({ atMs }) =>
        `Listen from ${clockOf(atMs)}, ${bylineOf(title)}`,
    }),
  )
