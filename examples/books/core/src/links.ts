import { Schema as S } from 'effect'
import { PlaceSegment } from 'transcript-player-core-example'

import { Milliseconds, type TitleSlug } from './ids.js'

// LINKS

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
