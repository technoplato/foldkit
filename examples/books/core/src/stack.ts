import { Array, Option } from 'effect'

import {
  isChapterPage,
  isDeleteBookmarkQuestion,
  isPlayerPage,
  isTitlePage,
} from './destination.js'
import type { BookmarkId, ChapterNumber, TitleSlug } from './ids.js'
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

/** The title whose page is open, under any chapter page or player. */
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

/** True while the player's page is on top of the pages. */
export const isOnPlayer = (model: HasStack): boolean =>
  Option.exists(topPageOf(model), isPlayerPage)

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

/** The chapter whose page is on top. */
export const shownChapterOf = (model: HasStack): Option.Option<ChapterNumber> =>
  Option.flatMap(topPageOf(model), page =>
    isChapterPage(page) ? Option.some(page.chapterNumber) : Option.none(),
  )

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
