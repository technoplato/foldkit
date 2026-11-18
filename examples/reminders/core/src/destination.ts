import { Schema as S } from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'

import { SmartList } from './board.js'
import { ListId, ReminderId, SearchQuery, TagTitle } from './ids.js'

// DESTINATION

/**
 * The home screen, the root at `/reminders`: search, the smart lists with
 * their counts, every list, the tags, and who is signed in.
 */
export const HomePage = ts('HomePage')
/** The home screen. */
export type HomePage = typeof HomePage.Type

/** One smart list, above home: `/reminders/today`, `/reminders/flagged`. */
export const SmartListPage = ts('SmartListPage', { smartList: SmartList })
/** One smart list. */
export type SmartListPage = typeof SmartListPage.Type

/** One list, above home: `/reminders/lists/2b7c1a0e-…`. */
export const ListPage = ts('ListPage', { listId: ListId })
/** One list. */
export type ListPage = typeof ListPage.Type

/** One tag's reminders, above home: `/reminders/tags/errands`. */
export const TagPage = ts('TagPage', { tagTitle: TagTitle })
/** One tag's reminders. */
export type TagPage = typeof TagPage.Type

/** What a search found, above home: `/reminders/search?search.query=milk`. */
export const SearchPage = ts('SearchPage', { query: SearchQuery })
/** What a search found. */
export type SearchPage = typeof SearchPage.Type

/**
 * One reminder's page, above the list, smart list, tag, or search it was
 * opened from, so its address names both:
 * `/reminders/lists/2b7c1a0e-…/reminder/7e1f04c2-…`.
 */
export const ReminderPage = ts('ReminderPage', { reminderId: ReminderId })
/** One reminder's page. */
export type ReminderPage = typeof ReminderPage.Type

/** Who is signed in, above home: `/reminders/profile`. */
export const ProfilePage = ts('ProfilePage')
/** Who is signed in. */
export type ProfilePage = typeof ProfilePage.Type

/** A list's name, color, and Delete, a Sheet over the list at `…/details`. */
export const ListDetailsSheet = ts('ListDetailsSheet')
/** A list's name, color, and Delete. */
export type ListDetailsSheet = typeof ListDetailsSheet.Type

/** Who a list is shared with, a Sheet over the list at `…/sharing`. */
export const SharingSheet = ts('SharingSheet')
/** Who a list is shared with. */
export type SharingSheet = typeof SharingSheet.Type

/** The orders to choose from, a Sheet at `…/sort`. */
export const SortSheet = ts('SortSheet')
/** The orders to choose from. */
export type SortSheet = typeof SortSheet.Type

/** The due dates to choose from, a Sheet over a reminder at `…/due`. */
export const DueDateSheet = ts('DueDateSheet')
/** The due dates to choose from. */
export type DueDateSheet = typeof DueDateSheet.Type

/** The priorities to choose from, a Sheet over a reminder at `…/priority`. */
export const PrioritySheet = ts('PrioritySheet')
/** The priorities to choose from. */
export type PrioritySheet = typeof PrioritySheet.Type

/** The lists to move a reminder to, a Sheet over it at `…/move`. */
export const MoveSheet = ts('MoveSheet')
/** The lists to move a reminder to. */
export type MoveSheet = typeof MoveSheet.Type

/**
 * The question "Delete Groceries?", a Dialog. It names the list it asks
 * about, so answering can only delete that one.
 */
export const DeleteListQuestion = ts('DeleteListQuestion', { listId: ListId })
/** The question "Delete Groceries?". */
export type DeleteListQuestion = typeof DeleteListQuestion.Type

/**
 * The question "Delete 3 completed reminders in Groceries?", a Dialog
 * naming its list.
 */
export const ClearCompletedQuestion = ts('ClearCompletedQuestion', {
  listId: ListId,
})
/** The question "Delete 3 completed reminders?". */
export type ClearCompletedQuestion = typeof ClearCompletedQuestion.Type

/**
 * Every place Reminders can show and a link can name, from home to the
 * clear-completed question.
 */
export const Place = S.Union([
  HomePage,
  SmartListPage,
  ListPage,
  TagPage,
  SearchPage,
  ReminderPage,
  ProfilePage,
  ListDetailsSheet,
  SharingSheet,
  SortSheet,
  DueDateSheet,
  PrioritySheet,
  MoveSheet,
  DeleteListQuestion,
  ClearCompletedQuestion,
])
/** Every place Reminders can show and a link can name. */
export type Place = typeof Place.Type

/** True for a place a link can name, false for a URI no route matched. */
export const isPlace = S.is(Place)

/**
 * Every place Reminders can show, and the URI no route matched. A stack
 * holds only these.
 */
export const Destination = S.Union([...Place.members, Navigation.NotFound])
/** Every place Reminders can show. */
export type Destination = typeof Destination.Type

/** True for the home screen. */
export const isHomePage = S.is(HomePage)
/** True for a smart list. */
export const isSmartListPage = S.is(SmartListPage)
/** True for a list. */
export const isListPage = S.is(ListPage)
/** True for a tag's reminders. */
export const isTagPage = S.is(TagPage)
/** True for a search. */
export const isSearchPage = S.is(SearchPage)
/** True for a reminder's page. */
export const isReminderPage = S.is(ReminderPage)
/** True for who is signed in. */
export const isProfilePage = S.is(ProfilePage)
/** True for a list's details. */
export const isListDetailsSheet = S.is(ListDetailsSheet)
/** True for a list's sharing. */
export const isSharingSheet = S.is(SharingSheet)
/** True for the orders. */
export const isSortSheet = S.is(SortSheet)
/** True for the due dates. */
export const isDueDateSheet = S.is(DueDateSheet)
/** True for the priorities. */
export const isPrioritySheet = S.is(PrioritySheet)
/** True for the lists to move to. */
export const isMoveSheet = S.is(MoveSheet)
/** True for the delete-list question. */
export const isDeleteListQuestion = S.is(DeleteListQuestion)
/** True for the clear-completed question. */
export const isClearCompletedQuestion = S.is(ClearCompletedQuestion)

/**
 * True for a page that shows reminders a person can open: a list, a smart
 * list, a tag, or a search.
 */
export const isReminderListing = (destination: unknown): boolean =>
  isListPage(destination) ||
  isSmartListPage(destination) ||
  isTagPage(destination) ||
  isSearchPage(destination)
