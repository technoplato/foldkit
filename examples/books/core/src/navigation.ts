import { Option } from 'effect'
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
  type ContentsSheet,
  type ContributorPage,
  type DeleteBookmarkQuestion,
  Destination,
  type LibraryPage,
  type ListenPage,
  type PlayerPage,
  type ProfilePage,
  type PublisherPage,
  type SpeedSheet,
  type TitlePage,
  isAddBooksSheet,
  isContributorPage,
  isPlayerScreen,
  isProfilePage,
  isPublisherPage,
  isTitlePage,
} from './destination.js'
import type { TitleSlug } from './ids.js'
import { type Model, titleOf } from './model.js'
import { declared } from './routes.js'
import {
  audibleConnectScreen,
  audibleTitlesScreen,
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
  stack: Navigation.fieldLens<Model, Destination>(),
  embedNotFound: notFound => notFound,
  routes: [],
  viewOf,
  settleEntry: ReadAloud.settledEntryOf,
})
