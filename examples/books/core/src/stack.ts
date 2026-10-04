import { Array, Option } from 'effect'

import {
  isDeleteBookmarkQuestion,
  isPlayerPage,
  isPlayerScreen,
  isTitlePage,
} from './destination.js'
import type { BookmarkId, Milliseconds, TitleSlug } from './ids.js'
import type { Listening } from './model.js'

// STACK

type HasStack = Readonly<{
  navigation: Readonly<{
    pages: ReadonlyArray<unknown>
    maybeModal: Option.Option<Readonly<{ destination: unknown }>>
  }>
}>

type HasPlayer = HasStack & Readonly<{ listening: Listening }>

const topPageOf = (model: HasStack): Option.Option<unknown> =>
  Array.last(model.navigation.pages)

/** The title whose page is open, under its player. */
export const titlePageSlugOf = (model: HasStack): Option.Option<TitleSlug> =>
  Option.map(
    Array.findLast(model.navigation.pages, isTitlePage),
    page => page.slug,
  )

/** The title in this device's player. None while it is idle. */
export const loadedSlugOf = (
  model: Readonly<{ listening: Listening }>,
): Option.Option<TitleSlug> =>
  model.listening._tag === 'Loaded'
    ? Option.some(model.listening.slug)
    : Option.none()

/** True while the player is on top of the pages. */
export const isOnPlayer = (model: HasStack): boolean =>
  Option.exists(topPageOf(model), isPlayerScreen)

/**
 * The title the screen is about: the one whose page is open, under any
 * chapter page or player. It is the one `p` plays, the contents list, and
 * a chapter jump reads. None on the library.
 *
 * @example
 * ```typescript
 * shownTitleOf(model) // Some('the-lantern-keeper') on `/books/the-lantern-keeper/chapter/3`
 * ```
 */
export const shownTitleOf = (model: HasStack): Option.Option<TitleSlug> =>
  titlePageSlugOf(model)

/**
 * True while the open player is for another title than the one this
 * device has loaded, or nothing is loaded: the player offers to play it.
 */
export const isOnOtherPlayer = (model: HasPlayer): boolean =>
  isOnPlayer(model) &&
  !Option.exists(titlePageSlugOf(model), slug =>
    Option.contains(loadedSlugOf(model), slug),
  )

/** The place the player's address names, while the player is on top. */
export const addressPlaceOf = (model: HasStack): Option.Option<Milliseconds> =>
  Option.flatMap(topPageOf(model), page =>
    isPlayerPage(page) ? Option.some(page.atMs) : Option.none(),
  )

/**
 * The place a player's address asks for, when the player is not there:
 * the place a link names, or the listener's place for a placeless
 * `/listen`. None while the player already plays the address's second.
 */
export const addressCueOf = (
  model: HasPlayer,
  isOnShelf: (slug: TitleSlug) => boolean,
  placeOfSlug: (slug: TitleSlug) => Milliseconds,
): Option.Option<Readonly<{ slug: TitleSlug; atMs: Milliseconds }>> =>
  Option.flatMap(
    Option.all({
      top: Option.filter(topPageOf(model), isPlayerScreen),
      slug: Option.filter(titlePageSlugOf(model), isOnShelf),
    }),
    ({ top, slug }) => {
      if (!isPlayerPage(top)) {
        return Option.some({ slug, atMs: placeOfSlug(slug) })
      } else if (
        Option.contains(loadedSlugOf(model), slug) &&
        Math.abs(placeOfSlug(slug) - top.atMs) < placeSlackMs
      ) {
        return Option.none()
      } else {
        return Option.some({ slug, atMs: top.atMs })
      }
    },
  )

const placeSlackMs = 1000

/** The bookmark the open delete question asks about. */
export const askedBookmarkOf = (model: HasStack): Option.Option<BookmarkId> =>
  Option.flatMap(model.navigation.maybeModal, modal =>
    isDeleteBookmarkQuestion(modal.destination)
      ? Option.some(modal.destination.bookmarkId)
      : Option.none(),
  )

/** True while the delete-bookmark question waits for an answer. */
export const isAsking = (model: HasStack): boolean =>
  Option.isSome(askedBookmarkOf(model))
