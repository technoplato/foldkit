import { Array, Option, Schema as S, pipe } from 'effect'
import { Navigation, Route } from 'foldkit'

import {
  ClearCompletedQuestion,
  DeleteListQuestion,
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
  isHomePage,
  isListPage,
  isReminderListing,
  isReminderPage,
  isSmartListPage,
  isTagPage,
} from './destination.js'
import { ListId, ReminderId, SearchQuery, TagTitleFromText } from './ids.js'
import { SmartListWord } from './words.js'

// ROUTES

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
 * Reminders' screens, each with its address, title, and where it may sit.
 * It names no view, so the links a screen shows print through it without
 * reaching back into the screens:
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
