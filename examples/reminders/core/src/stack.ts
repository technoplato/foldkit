import { Array, Option } from 'effect'

import type { SmartList } from './board.js'
import {
  isClearCompletedQuestion,
  isDeleteListQuestion,
  isListPage,
  isReminderListing,
  isReminderPage,
  isSearchPage,
  isSmartListPage,
  isTagPage,
} from './destination.js'
import type { ListId, ReminderId, SearchQuery, TagTitle } from './ids.js'

// STACK

type HasStack = Readonly<{
  navigation: Readonly<{
    pages: ReadonlyArray<unknown>
    maybeModal: Option.Option<Readonly<{ destination: unknown }>>
  }>
}>

/** The page on top of the pages, under any Sheet or Dialog. */
export const topPageOf = (model: HasStack): Option.Option<unknown> =>
  Array.last(model.navigation.pages)

/** The Sheet or Dialog over the pages, while one is open. */
export const modalOf = (model: HasStack): Option.Option<unknown> =>
  Option.map(model.navigation.maybeModal, modal => modal.destination)

/**
 * The list whose page is open, under any reminder page:
 * `2b7c1a0e-…` on `/reminders/lists/2b7c1a0e-…/reminder/7e1f04c2-…`.
 */
export const shownListOf = (model: HasStack): Option.Option<ListId> =>
  Option.map(
    Array.findLast(model.navigation.pages, isListPage),
    page => page.listId,
  )

/** The smart list whose page is open, under any reminder page. */
export const shownSmartListOf = (model: HasStack): Option.Option<SmartList> =>
  Option.map(
    Array.findLast(model.navigation.pages, isSmartListPage),
    page => page.smartList,
  )

/** The tag whose page is open, under any reminder page. */
export const shownTagOf = (model: HasStack): Option.Option<TagTitle> =>
  Option.map(
    Array.findLast(model.navigation.pages, isTagPage),
    page => page.tagTitle,
  )

/** The search whose page is open, under any reminder page. */
export const shownSearchOf = (model: HasStack): Option.Option<SearchQuery> =>
  Option.map(
    Array.findLast(model.navigation.pages, isSearchPage),
    page => page.query,
  )

/** The reminder whose page is on top. */
export const shownReminderOf = (model: HasStack): Option.Option<ReminderId> =>
  Option.flatMap(topPageOf(model), page =>
    isReminderPage(page) ? Option.some(page.reminderId) : Option.none(),
  )

/** True while a list, smart list, tag, or search page is on top. */
export const isOnListing = (model: HasStack): boolean =>
  Option.exists(topPageOf(model), isReminderListing)

/** True while a reminder's page is on top. */
export const isOnReminder = (model: HasStack): boolean =>
  Option.isSome(shownReminderOf(model))

/** The list the open delete question asks about. */
export const askedListOf = (model: HasStack): Option.Option<ListId> =>
  Option.flatMap(modalOf(model), destination =>
    isDeleteListQuestion(destination)
      ? Option.some(destination.listId)
      : Option.none(),
  )

/** The list the open clear-completed question asks about. */
export const clearingListOf = (model: HasStack): Option.Option<ListId> =>
  Option.flatMap(modalOf(model), destination =>
    isClearCompletedQuestion(destination)
      ? Option.some(destination.listId)
      : Option.none(),
  )

/** True while a question waits for an answer, and nothing else may run. */
export const isAsking = (model: HasStack): boolean =>
  Option.isSome(askedListOf(model)) || Option.isSome(clearingListOf(model))
