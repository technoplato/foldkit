import { Array, Option, pipe } from 'effect'
import { Navigation, Route } from 'foldkit'

import { CounterIdSegment, counterName } from './counterId.js'
import {
  ConfirmDelete,
  CounterDetail,
  CounterList,
  Destination,
  isCounterDetail,
  isCounterList,
} from './destination.js'
import { type Model, counterOf } from './model.js'
import { confirmScreen, detailScreen, missingScreen } from './screen.js'

// NAVIGATION

const counterIdSegment = Route.schemaSegment('counterId', CounterIdSegment)

/**
 * The Multiple Counters' screens, each with its route, title, and where it
 * may sit:
 *
 * - `/counters` is the list, the root.
 * - `/counters/3` is Counter 3's page, pushed only above the list.
 * - `/counters/delete/3` is "Delete Counter 3?", a Dialog over the list
 *   or a counter's page, `/counters/3/delete/3`.
 */
export const declared = Navigation.screens({
  slug: 'counters',
  root: Navigation.rootScreen(CounterList, Route.here, {
    title: () => 'Counters',
  }),
  screens: [
    Navigation.pushScreen(CounterDetail, counterIdSegment, {
      title: ({ counterId }) => counterName(counterId),
      isAllowedAbove: beneath => Array.every(beneath, isCounterList),
    }),
    Navigation.presentScreen(
      ConfirmDelete,
      pipe(Route.literal('delete'), Route.slash(counterIdSegment)),
      Navigation.Dialog(),
      {
        title: ({ counterId }) => `Delete ${counterName(counterId)}?`,
        isAllowedAbove: beneath =>
          Array.every(
            beneath,
            destination =>
              isCounterList(destination) || isCounterDetail(destination),
          ),
      },
    ),
  ],
})

const viewOf = (
  model: Model,
  destination: Destination,
): Option.Option<Navigation.EntryView> => {
  if (isCounterDetail(destination)) {
    return Option.some(
      Navigation.screenView(
        Option.match(counterOf(model, destination.counterId), {
          onNone: () => missingScreen(destination.counterId),
          onSome: row => detailScreen(model, row),
        }),
      ),
    )
  } else if (destination._tag === 'ConfirmDelete') {
    return Option.some(
      Navigation.screenView(confirmScreen(model, destination.counterId)),
    )
  } else {
    return Option.none()
  }
}

/**
 * The navigation the Multiple Counters hold in their own Model: the
 * screens above, a NotFound page for any other path, and the stack in the
 * `navigation` field, so a counter's Open and Delete move it. The list
 * paints from the Program's `screen`, which Session wraps with its
 * Session settings button.
 *
 * @example
 * ```typescript
 * Navigation.printStack(navigation, model.navigation) // '/counters/3'
 * ```
 */
export const navigation = Navigation.composeNavigation<
  Model,
  unknown,
  Destination,
  CounterList | CounterDetail | ConfirmDelete
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
