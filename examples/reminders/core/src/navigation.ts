import { Option } from 'effect'
import { Navigation } from 'foldkit'
import type { UiNode } from 'foldkit/renderers'

import {
  Destination,
  type Place,
  isClearCompletedQuestion,
  isDeleteListQuestion,
  isDueDateSheet,
  isListDetailsSheet,
  isListPage,
  isMoveSheet,
  isPrioritySheet,
  isProfilePage,
  isReminderPage,
  isSearchPage,
  isSharingSheet,
  isSmartListPage,
  isSortSheet,
  isTagPage,
} from './destination.js'
import type { Model } from './model.js'
import { declared } from './routes.js'
import {
  clearCompletedScreen,
  deleteListScreen,
  dueDateScreen,
  listDetailsScreen,
  listPageScreen,
  moveScreen,
  priorityScreen,
  profileScreen,
  reminderPageScreen,
  searchScreen,
  sharingScreen,
  smartListScreen,
  sortScreen,
  tagPageScreen,
} from './screen.js'

// NAVIGATION

const shown = (node: UiNode): Option.Option<Navigation.EntryView> =>
  Option.some(Navigation.screenView(node))

const viewOf = (
  model: Model,
  destination: Destination,
): Option.Option<Navigation.EntryView> => {
  if (isSmartListPage(destination)) {
    return shown(smartListScreen(model, destination.smartList))
  } else if (isListPage(destination)) {
    return shown(listPageScreen(model, destination.listId))
  } else if (isTagPage(destination)) {
    return shown(tagPageScreen(model, destination.tagTitle))
  } else if (isSearchPage(destination)) {
    return shown(searchScreen(model, destination.query))
  } else if (isReminderPage(destination)) {
    return shown(reminderPageScreen(model, destination.reminderId))
  } else if (isProfilePage(destination)) {
    return shown(profileScreen(model))
  } else if (isListDetailsSheet(destination)) {
    return shown(listDetailsScreen(model))
  } else if (isSharingSheet(destination)) {
    return shown(sharingScreen(model))
  } else if (isSortSheet(destination)) {
    return shown(sortScreen(model))
  } else if (isDueDateSheet(destination)) {
    return shown(dueDateScreen(model))
  } else if (isPrioritySheet(destination)) {
    return shown(priorityScreen(model))
  } else if (isMoveSheet(destination)) {
    return shown(moveScreen(model))
  } else if (isDeleteListQuestion(destination)) {
    return shown(deleteListScreen(model, destination.listId))
  } else if (isClearCompletedQuestion(destination)) {
    return shown(clearCompletedScreen(model, destination.listId))
  } else {
    return Option.none()
  }
}

/**
 * The navigation Reminders holds in its own Model: the screens above, a
 * NotFound page for any other path, and the stack in the `navigation`
 * field. Home paints from the Program's `screen`, which Session wraps with
 * its settings button.
 *
 * @example
 * ```typescript
 * Navigation.printStack(navigation, model.navigation) // Some('/reminders/lists/2b7c1a0e-…/reminder/7e1f04c2-…')
 * ```
 */
export const navigation = Navigation.composeNavigation<
  Model,
  unknown,
  Destination,
  Place
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
