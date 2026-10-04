import { Option } from 'effect'
import { Navigation } from 'foldkit'

import {
  Destination,
  type ReadAloudBook,
  type ReadAloudPage,
  type ReadAloudShelf,
  isReadAloudBook,
  isReadAloudPage,
  isReadAloudShelf,
} from './destination.js'
import type { Model, ReadAloudView } from './model.js'
import { declared } from './routes.js'
import { openingScreen, pageScreen, shelfScreen } from './screen.js'
import { settledEntryOf } from './stack.js'

// NAVIGATION

/**
 * What one of Read Aloud's places paints, for any Model that holds Read
 * Aloud: a book at a page, a book opening, and, where it is not the root,
 * the shelf. None for any other place.
 *
 * @example
 * ```typescript
 * readAloudViewOf(model, ReadAloudPage({ book, page: 4 })) // Some(Screen(the page screen))
 * ```
 */
export const readAloudViewOf = (
  model: ReadAloudView,
  destination: unknown,
): Option.Option<Navigation.EntryView> => {
  if (isReadAloudShelf(destination)) {
    return Option.some(Navigation.screenView(shelfScreen(model)))
  } else {
    return viewOf(model, destination)
  }
}

const viewOf = (
  model: ReadAloudView,
  destination: unknown,
): Option.Option<Navigation.EntryView> => {
  if (
    isReadAloudPage(destination) &&
    model.readings._tag !== 'ReadingsLoading'
  ) {
    return Option.some(
      Navigation.screenView(
        pageScreen(model, destination.book, destination.page),
      ),
    )
  } else if (isReadAloudPage(destination) || isReadAloudBook(destination)) {
    return Option.some(Navigation.screenView(openingScreen()))
  } else {
    return Option.none()
  }
}

/**
 * The navigation Read Aloud holds in its own Model: the screens in
 * `routes.ts`, a NotFound page for any other path, and the stack in the
 * `navigation` field. A link to a book with no page settles to the page it
 * opens at. The shelf paints from the Program's `screen`, which Session
 * wraps with its Session settings button.
 *
 * @example
 * ```typescript
 * Navigation.printStack(navigation, model.navigation) // Some('/books/read-aloud/9780063342705/page/4')
 * ```
 */
export const navigation = Navigation.composeNavigation<
  Model,
  unknown,
  Destination,
  ReadAloudShelf | ReadAloudPage | ReadAloudBook
>({
  child: declared,
  hold: 'Owns',
  Destination,
  childOf: model => model,
  stack: Navigation.fieldLens<Model, Destination>(),
  embedNotFound: notFound => notFound,
  routes: [],
  viewOf,
  settleEntry: settledEntryOf,
})
