import { Option } from 'effect'
import { Catalog, Navigation } from 'foldkit'
import type { UiNode } from 'foldkit/renderers'

import {
  Destination,
  type ReadAloudBook,
  type ReadAloudPage,
  type ReadAloudShelf,
  isReadAloudBook,
  isReadAloudPage,
  isReadAloudShelf,
} from './destination.js'
import { catalog } from './message.js'
import type { Model, ReadAloudView } from './model.js'
import { declared } from './routes.js'
import { openingScreen, pageScreen, shelfScreen } from './screen.js'
import { settledEntryOf } from './stack.js'

// NAVIGATION

/**
 * What one of Read Aloud's places paints, for any Model that holds Read
 * Aloud, with the holder's own Catalog entries: the shelf, a book at a
 * page, and a book on its way. None for any other place. A holder such as
 * Books puts the result inside its own frame, with its tabs under it.
 *
 * @example
 * ```typescript
 * readAloudScreenOf(model, ReadAloudPage({ book, page: 4 }), Catalog.entries(catalog, model))
 * // Some(Column: List(book), Page 4 of 14, …)
 * ```
 */
export const readAloudScreenOf = (
  model: ReadAloudView,
  destination: unknown,
  entries: ReadonlyArray<Catalog.Entry>,
): Option.Option<UiNode> => {
  if (isReadAloudShelf(destination)) {
    return Option.some(shelfScreen(model, entries))
  } else if (
    isReadAloudPage(destination) &&
    model.readings._tag !== 'ReadingsLoading'
  ) {
    return Option.some(
      pageScreen(model, destination.book, destination.page, entries),
    )
  } else if (isReadAloudPage(destination) || isReadAloudBook(destination)) {
    return Option.some(openingScreen())
  } else {
    return Option.none()
  }
}

/**
 * The shelf, with the Read Aloud Program's own entries: the Program's
 * `screen`, which Session wraps with its Session settings button.
 */
export const programShelfScreen = (model: Model): UiNode =>
  shelfScreen(model, Catalog.entries(catalog, model))

const viewOf = (
  model: Model,
  destination: Destination,
): Option.Option<Navigation.EntryView> =>
  isReadAloudShelf(destination)
    ? Option.none()
    : Option.map(
        readAloudScreenOf(model, destination, Catalog.entries(catalog, model)),
        Navigation.screenView,
      )

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
