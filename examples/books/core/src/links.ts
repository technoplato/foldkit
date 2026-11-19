import { Schema as S } from 'effect'
import { PlaceSegment, WordSegment } from 'transcript-player-core-example'

import { Milliseconds, type TitleSlug } from './ids.js'

// LINKS

/**
 * Where Books is published, the origin of every link it hands out, such
 * as the moment Scribe's timeline opens:
 * `https://books.pisspoursoftware.xyz/books/a-tin-comet/listen/12m03s`.
 */
export const booksOrigin = 'https://books.pisspoursoftware.xyz'

const millisecondsPerSecond = 1000

/** A place on its whole second, the second an address names. */
export const secondOf = (placeMs: number): Milliseconds =>
  Milliseconds.make(
    Math.floor(placeMs / millisecondsPerSecond) * millisecondsPerSecond,
  )

/**
 * The path to a second in a title, the same address the player keeps:
 * `/books/the-lantern-keeper/listen/12m03s`.
 *
 * @example
 * ```typescript
 * placePathOf(slug, Milliseconds.make(723_400)) // '/books/the-lantern-keeper/listen/12m03s'
 * ```
 */
export const placePathOf = (slug: TitleSlug, placeMs: Milliseconds): string =>
  `/books/${slug}/listen/${S.encodeSync(PlaceSegment)(secondOf(placeMs))}`

/**
 * The path to one word of a title: the time the word starts, to the
 * millisecond, in the player's own address, so the link opens the title
 * on that word in the site, in `books open`, and from anywhere a link is
 * pasted. A word that starts on a whole second prints as the player's
 * address does.
 *
 * @example
 * ```typescript
 * wordPathOf(slug, Milliseconds.make(723_450)) // '/books/the-lantern-keeper/listen/12m03.45s'
 * wordPathOf(slug, Milliseconds.make(723_000)) // '/books/the-lantern-keeper/listen/12m03s'
 * ```
 */
export const wordPathOf = (slug: TitleSlug, startMs: Milliseconds): string =>
  `/books/${slug}/listen/${S.encodeSync(WordSegment)(startMs)}`
