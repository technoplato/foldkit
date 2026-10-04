import { Array, Option, String, pipe } from 'effect'
import { Navigation, Route } from 'foldkit'
import { PlaceSegment } from 'transcript-player-core-example'

import {
  ContentsSheet,
  DeleteBookmarkQuestion,
  Destination,
  LibraryPage,
  ListenPage,
  PlayerPage,
  SpeedSheet,
  TitlePage,
  isLibraryPage,
  isPlayerScreen,
  isTitlePage,
} from './destination.js'
import { BookmarkId, TitleSlug } from './ids.js'
import { type Model, titleOf } from './model.js'
import {
  contentsScreen,
  deleteBookmarkScreen,
  missingTitleScreen,
  playerScreen,
  speedScreen,
  titleScreen,
} from './screen.js'

// NAVIGATION

const slugSegment = Route.schemaSegment('slug', TitleSlug)
const placeSegment = Route.schemaSegment('atMs', PlaceSegment)
const bookmarkSegment = Route.schemaSegment('bookmarkId', BookmarkId)

const isTopOf =
  (...predicates: ReadonlyArray<(destination: unknown) => boolean>) =>
  (beneath: ReadonlyArray<unknown>): boolean =>
    Option.exists(Array.last(beneath), top =>
      Array.some(predicates, predicate => predicate(top)),
    )

/**
 * How a title reads in a window title before the shelf arrives: its name
 * tag in words, `The Lantern Keeper` for `the-lantern-keeper`.
 */
export const nameOfSlug = (slug: TitleSlug): string =>
  pipe(String.split(slug, '-'), Array.map(String.capitalize), Array.join(' '))

/**
 * Books' screens, each with its route, title, and where it may sit:
 *
 * - `/books` is the library, the root.
 * - `/books/the-lantern-keeper` is a title's page, only above the library.
 * - `/books/the-lantern-keeper/listen/12:03` is that title's player at
 *   12:03, only above its page: a link to that moment, kept up to date as
 *   it plays. `/books/the-lantern-keeper/listen` opens it at the listener's
 *   place.
 * - `…/contents` and `…/speed` are Sheets; `…/delete-bookmark/<id>` is a
 *   Dialog.
 */
export const declared = Navigation.screens({
  slug: 'books',
  root: Navigation.rootScreen(LibraryPage, Route.here, {
    title: () => 'Library',
  }),
  screens: [
    Navigation.pushScreen(TitlePage, slugSegment, {
      title: ({ slug }) => nameOfSlug(slug),
      isAllowedAbove: beneath => Array.every(beneath, isLibraryPage),
    }),
    Navigation.pushScreen(
      PlayerPage,
      pipe(Route.literal('listen'), Route.slash(placeSegment)),
      {
        title: () => 'Now playing',
        isAllowedAbove: beneath =>
          isTopOf(isTitlePage)(beneath) && !Array.some(beneath, isPlayerScreen),
      },
    ),
    Navigation.pushScreen(ListenPage, Route.literal('listen'), {
      title: () => 'Now playing',
      isAllowedAbove: beneath =>
        isTopOf(isTitlePage)(beneath) && !Array.some(beneath, isPlayerScreen),
    }),
    Navigation.presentScreen(
      ContentsSheet,
      Route.literal('contents'),
      Navigation.Sheet(),
      {
        title: () => 'Contents',
        isAllowedAbove: isTopOf(isTitlePage, isPlayerScreen),
      },
    ),
    Navigation.presentScreen(
      SpeedSheet,
      Route.literal('speed'),
      Navigation.Sheet(),
      {
        title: () => 'Speed',
        isAllowedAbove: isTopOf(isPlayerScreen),
      },
    ),
    Navigation.presentScreen(
      DeleteBookmarkQuestion,
      pipe(Route.literal('delete-bookmark'), Route.slash(bookmarkSegment)),
      Navigation.Dialog(),
      {
        title: () => 'Delete bookmark?',
        isAllowedAbove: isTopOf(isTitlePage, isPlayerScreen),
      },
    ),
  ],
})

const titlePageView = (model: Model, slug: TitleSlug) =>
  Option.match(titleOf(model, slug), {
    onNone: () => missingTitleScreen(slug),
    onSome: title => titleScreen(model, title),
  })

const viewOf = (
  model: Model,
  destination: Destination,
): Option.Option<Navigation.EntryView> => {
  if (isTitlePage(destination)) {
    return Option.some(
      Navigation.screenView(titlePageView(model, destination.slug)),
    )
  } else if (isPlayerScreen(destination)) {
    return Option.some(Navigation.screenView(playerScreen(model)))
  } else if (destination._tag === 'ContentsSheet') {
    return Option.some(Navigation.screenView(contentsScreen(model)))
  } else if (destination._tag === 'SpeedSheet') {
    return Option.some(Navigation.screenView(speedScreen(model)))
  } else if (destination._tag === 'DeleteBookmarkQuestion') {
    return Option.some(
      Navigation.screenView(
        deleteBookmarkScreen(model, destination.bookmarkId),
      ),
    )
  } else {
    return Option.none()
  }
}

/**
 * The navigation Books holds in its own Model: the screens above, a
 * NotFound page for any other path, and the stack in the `navigation`
 * field. The library paints from the Program's `screen`, which Session
 * wraps with its Session settings button.
 *
 * @example
 * ```typescript
 * Navigation.printStack(navigation, model.navigation) // Some('/books/the-lantern-keeper/listen')
 * ```
 */
export const navigation = Navigation.composeNavigation<
  Model,
  unknown,
  Destination,
  | LibraryPage
  | TitlePage
  | PlayerPage
  | ListenPage
  | ContentsSheet
  | SpeedSheet
  | DeleteBookmarkQuestion
>({
  child: declared,
  hold: 'Owns',
  Destination,
  childOf: model => model,
  stack: Navigation.fieldLens<Model, Destination>(),
  embedNotFound: notFound => notFound,
  routes: [],
  viewOf,
})
