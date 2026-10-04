import { Array, Option, Schema as S, pipe } from 'effect'
import { Navigation, Route } from 'foldkit'
import type { UiNode } from 'foldkit/renderers'

import type { Reminder } from './board.js'
import {
  ClearCompletedQuestion,
  DeleteListQuestion,
  Destination,
  DueDateSheet,
  HomePage,
  ListDetailsSheet,
  ListPage,
  MoveSheet,
  PrioritySheet,
  ProfilePage,
  ReminderPage,
  SearchPage,
  SharingSheet,
  SmartListPage,
  SortSheet,
  TagPage,
  isClearCompletedQuestion,
  isDeleteListQuestion,
  isDueDateSheet,
  isHomePage,
  isListDetailsSheet,
  isListPage,
  isMoveSheet,
  isPrioritySheet,
  isProfilePage,
  isReminderListing,
  isReminderPage,
  isSearchPage,
  isSharingSheet,
  isSmartListPage,
  isSortSheet,
  isTagPage,
} from './destination.js'
import { ListId, ReminderId, SearchQuery, TagTitleFromText } from './ids.js'
import { SmartListWord } from './message.js'
import type { Model } from './model.js'
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

const listSegment = Route.schemaSegment('listId', ListId)

const reminderSegment = Route.schemaSegment('reminderId', ReminderId)

const tagSegment = Route.schemaSegment('tagTitle', TagTitleFromText)

const smartListSegment = Route.schemaSegment('smartList', SmartListWord)

const isTopOf =
  (...predicates: ReadonlyArray<(destination: unknown) => boolean>) =>
  (beneath: ReadonlyArray<unknown>): boolean =>
    Option.exists(Array.last(beneath), top =>
      Array.some(predicates, predicate => predicate(top)),
    )

const isAboveHome = (beneath: ReadonlyArray<unknown>): boolean =>
  Array.every(beneath, isHomePage)

/**
 * Reminders' screens, each with its address, title, and where it may sit:
 *
 * - `/reminders` is home, the root.
 * - `/reminders/today` and the other smart lists, `/reminders/lists/<id>`,
 *   `/reminders/tags/errands`, `/reminders/search?search.query=milk`, and
 *   `/reminders/profile` sit right above home.
 * - `…/reminder/<id>` is a reminder's page, above the list, smart list,
 *   tag, or search it was opened from.
 * - `…/details`, `…/sharing`, `…/sort`, `…/due`, `…/priority`, and
 *   `…/move` are Sheets; `…/delete/<id>` and `…/clear-completed/<id>` are
 *   Dialogs.
 */
export const declared = Navigation.screens({
  slug: 'reminders',
  root: Navigation.rootScreen(HomePage, Route.here, {
    title: () => 'Reminders',
  }),
  screens: [
    Navigation.pushScreen(SmartListPage, smartListSegment, {
      title: ({ smartList }) => smartList,
      isAllowedAbove: isAboveHome,
    }),
    Navigation.pushScreen(
      ListPage,
      pipe(Route.literal('lists'), Route.slash(listSegment)),
      { title: () => 'List', isAllowedAbove: isAboveHome },
    ),
    Navigation.pushScreen(
      TagPage,
      pipe(Route.literal('tags'), Route.slash(tagSegment)),
      { title: ({ tagTitle }) => `#${tagTitle}`, isAllowedAbove: isAboveHome },
    ),
    Navigation.pushScreen(
      SearchPage,
      pipe(
        Route.literal('search'),
        Route.query(S.Struct({ query: SearchQuery })),
      ),
      { title: ({ query }) => `Search: ${query}`, isAllowedAbove: isAboveHome },
    ),
    Navigation.pushScreen(ProfilePage, Route.literal('profile'), {
      title: () => 'Profile',
      isAllowedAbove: isAboveHome,
    }),
    Navigation.pushScreen(
      ReminderPage,
      pipe(Route.literal('reminder'), Route.slash(reminderSegment)),
      {
        title: () => 'Reminder',
        isAllowedAbove: beneath =>
          isTopOf(isReminderListing)(beneath) &&
          !Array.some(beneath, isReminderPage),
      },
    ),
    Navigation.presentScreen(
      ListDetailsSheet,
      Route.literal('details'),
      Navigation.Sheet(),
      { title: () => 'List info', isAllowedAbove: isTopOf(isListPage) },
    ),
    Navigation.presentScreen(
      SharingSheet,
      Route.literal('sharing'),
      Navigation.Sheet(),
      { title: () => 'Sharing', isAllowedAbove: isTopOf(isListPage) },
    ),
    Navigation.presentScreen(
      SortSheet,
      Route.literal('sort'),
      Navigation.Sheet(),
      {
        title: () => 'Sort by',
        isAllowedAbove: isTopOf(isListPage, isTagPage, isSmartListPage),
      },
    ),
    Navigation.presentScreen(
      DueDateSheet,
      Route.literal('due'),
      Navigation.Sheet(),
      {
        title: () => 'Due date',
        isAllowedAbove: isTopOf(isReminderPage),
      },
    ),
    Navigation.presentScreen(
      PrioritySheet,
      Route.literal('priority'),
      Navigation.Sheet(),
      { title: () => 'Priority', isAllowedAbove: isTopOf(isReminderPage) },
    ),
    Navigation.presentScreen(
      MoveSheet,
      Route.literal('move'),
      Navigation.Sheet(),
      {
        title: () => 'Move to',
        isAllowedAbove: isTopOf(isReminderPage),
      },
    ),
    Navigation.presentScreen(
      DeleteListQuestion,
      pipe(Route.literal('delete'), Route.slash(listSegment)),
      Navigation.Dialog(),
      { title: () => 'Delete list?', isAllowedAbove: isTopOf(isListPage) },
    ),
    Navigation.presentScreen(
      ClearCompletedQuestion,
      pipe(Route.literal('clear-completed'), Route.slash(listSegment)),
      Navigation.Dialog(),
      { title: () => 'Clear completed?', isAllowedAbove: isTopOf(isListPage) },
    ),
  ],
})

const shown = (node: UiNode): Option.Option<Navigation.EntryView> =>
  Option.some(Navigation.screenView(node))

/**
 * The address to share a reminder at, above its own list, whichever page
 * it was opened from: `/reminders/lists/2b7c1a0e-…/reminder/7e1f04c2-…`.
 */
export const reminderLinkOf = (reminder: Reminder): Option.Option<string> =>
  Navigation.printStack(navigation, {
    root: HomePage(),
    pages: [
      ListPage({ listId: reminder.listId }),
      ReminderPage({ reminderId: reminder.reminderId }),
    ],
    maybeModal: Option.none(),
  })

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
    return shown(
      reminderPageScreen(model, destination.reminderId, reminderLinkOf),
    )
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
  | HomePage
  | SmartListPage
  | ListPage
  | TagPage
  | SearchPage
  | ProfilePage
  | ReminderPage
  | ListDetailsSheet
  | SharingSheet
  | SortSheet
  | DueDateSheet
  | PrioritySheet
  | MoveSheet
  | DeleteListQuestion
  | ClearCompletedQuestion
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
