import { Array, Option } from 'effect'
import { Navigation } from 'foldkit'
import * as ReadAloud from 'read-aloud-core-example'

import {
  type AudibleConnectPage,
  type AudibleTitlesPage,
  isAudibleConnectPage,
  isAudibleTitlesPage,
} from './audible/destination.js'
import {
  type AddBooksSheet,
  type BookmarkDrawer,
  type BookmarksDrawer,
  type ContentsSheet,
  type ContributorPage,
  type DeleteBookmarkQuestion,
  Destination,
  type LibraryPage,
  type ListenPage,
  PlayerPage,
  type ProfilePage,
  type PublisherPage,
  type SpeedSheet,
  type TitlePage,
  isAddBooksSheet,
  isContributorPage,
  isPlayerPage,
  isPlayerScreen,
  isProfilePage,
  isPublisherPage,
  isTitlePage,
} from './destination.js'
import type { TitleSlug } from './ids.js'
import { secondOf } from './links.js'
import { type Model, titleOf } from './model.js'
import { declared } from './routes.js'
import {
  audibleConnectScreen,
  audibleTitlesScreen,
  bookmarkScreen,
  bookmarksScreen,
  contentsScreen,
  contributorScreen,
  deleteBookmarkScreen,
  missingTitleScreen,
  playerScreen,
  profileScreen,
  publisherScreen,
  readAloudScreen,
  speedScreen,
  titleScreen,
} from './screen.js'
import { addBooksScreen } from './sources.js'
import { titlePageSlugOf } from './stack.js'

// NAVIGATION

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
  } else if (isProfilePage(destination)) {
    return Option.some(Navigation.screenView(profileScreen(model)))
  } else if (isPlayerScreen(destination)) {
    return Option.some(Navigation.screenView(playerScreen(model)))
  } else if (destination._tag === 'ContentsSheet') {
    return Option.some(Navigation.screenView(contentsScreen(model)))
  } else if (destination._tag === 'BookmarksDrawer') {
    return Option.some(Navigation.screenView(bookmarksScreen(model)))
  } else if (destination._tag === 'BookmarkDrawer') {
    return Option.some(
      Navigation.screenView(bookmarkScreen(model, destination.bookmarkId)),
    )
  } else if (destination._tag === 'SpeedSheet') {
    return Option.some(Navigation.screenView(speedScreen(model)))
  } else if (destination._tag === 'DeleteBookmarkQuestion') {
    return Option.some(
      Navigation.screenView(
        deleteBookmarkScreen(model, destination.bookmarkId),
      ),
    )
  } else if (isAddBooksSheet(destination)) {
    return Option.some(Navigation.screenView(addBooksScreen(model)))
  } else if (isAudibleConnectPage(destination)) {
    return Option.some(Navigation.screenView(audibleConnectScreen(model)))
  } else if (isAudibleTitlesPage(destination)) {
    return Option.some(Navigation.screenView(audibleTitlesScreen(model)))
  } else if (isContributorPage(destination)) {
    return Option.some(
      Navigation.screenView(contributorScreen(model, destination)),
    )
  } else if (isPublisherPage(destination)) {
    return Option.some(
      Navigation.screenView(publisherScreen(model, destination)),
    )
  } else {
    return Option.map(
      readAloudScreen(model, destination),
      Navigation.screenView,
    )
  }
}

/**
 * The navigation Books holds in its own Model: the screens in `routes.ts`,
 * a NotFound page for any other path, and the stack in the `navigation`
 * field. The library paints from the Program's `screen`, which Session
 * wraps with its Session settings button. A link to a book read aloud
 * with no page settles to the page it opens at.
 *
 * @example
 * ```typescript
 * Navigation.printStack(navigation, model.navigation) // Some('/books/the-lantern-keeper/listen')
 * ```
 */
const baseStackLens = Navigation.fieldLens<Model, Destination>()

/**
 * Projects the live ephemeral playhead tick onto the top PlayerPage when
 * reading the stack, so the address stays on the second being heard without
 * mutating `synced` `model.navigation` on every audio tick.
 */
const liveStackOf = (model: Model): Navigation.NavigationStack<Destination> => {
  if (model.listening._tag !== 'Loaded') {
    return model.navigation
  }
  const maybeTick = model.listening.player.maybeTickPlaceMs
  if (Option.isNone(maybeTick)) {
    return model.navigation
  }
  if (!Option.contains(titlePageSlugOf(model), model.listening.slug)) {
    return model.navigation
  }
  const maybeTop = Array.last(model.navigation.pages)
  if (Option.isNone(maybeTop) || !isPlayerScreen(maybeTop.value)) {
    return model.navigation
  }
  const atMs = secondOf(maybeTick.value)
  if (isPlayerPage(maybeTop.value) && maybeTop.value.atMs === atMs) {
    return model.navigation
  }
  return {
    ...model.navigation,
    pages: [
      ...Array.dropRight(model.navigation.pages, 1),
      PlayerPage({ atMs }),
    ],
  }
}

const booksStackLens: Navigation.StackLens<Model, Destination> = {
  get: model => Option.some(liveStackOf(model)),
  set: baseStackLens.set,
}

export const navigation = Navigation.composeNavigation<
  Model,
  unknown,
  Destination,
  | LibraryPage
  | ProfilePage
  | TitlePage
  | PlayerPage
  | ListenPage
  | ContentsSheet
  | BookmarksDrawer
  | BookmarkDrawer
  | SpeedSheet
  | DeleteBookmarkQuestion
  | AddBooksSheet
  | AudibleConnectPage
  | AudibleTitlesPage
  | ContributorPage
  | PublisherPage
  | ReadAloud.ReadAloudPlace
>({
  child: declared,
  hold: 'Owns',
  Destination,
  childOf: model => model,
  stack: booksStackLens,
  embedNotFound: notFound => notFound,
  routes: [],
  viewOf,
  settleEntry: ReadAloud.settledEntryOf,
})
