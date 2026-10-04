import { Array, Option, Schema as S } from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'

import {
  Board,
  Ordering,
  type Reminder,
  type ReminderList,
  type Tag,
  listIn,
  listsInOrder,
  reminderIn,
  tagNamed,
  writableListsIn,
} from './board.js'
import { LocalDay } from './calendar.js'
import { Destination } from './destination.js'
import type { ListId, ReminderId, TagTitle } from './ids.js'

// MODEL

/** The board has not arrived from the store yet. */
export const BoardLoading = ts('BoardLoading')
/** The board as the store last sent it. */
export const BoardReady = ts('BoardReady', { board: Board })
/** Nobody is signed in, so there is no board to show. */
export const BoardSignedOut = ts('BoardSignedOut')
/** The store could not be read, and why, safe to show. */
export const BoardUnavailable = ts('BoardUnavailable', { reason: S.String })
/** Where the board stands. */
export const BoardState = S.Union([
  BoardLoading,
  BoardReady,
  BoardSignedOut,
  BoardUnavailable,
])
/** Where the board stands. */
export type BoardState = typeof BoardState.Type

/** Whether lists show their done reminders under the open ones. */
export const CompletedVisibility = S.Literals(['Hidden', 'Shown'])
/** Whether lists show their done reminders. */
export type CompletedVisibility = typeof CompletedVisibility.Type

/**
 * The Reminders Model: the board from the store, today on this device's
 * calendar, how this device orders lists and whether it shows done
 * reminders, the last write the store refused, a short notice such as
 * `Link copied` that lasts until the screen changes, and the navigation
 * stack. The board and today come from outside the log, so a refold keeps
 * them.
 */
export const Model = S.Struct({
  board: BoardState,
  maybeToday: S.Option(LocalDay),
  ordering: Ordering,
  completed: CompletedVisibility,
  maybeProblem: S.Option(S.String),
  maybeNotice: S.Option(S.String),
  navigation: Navigation.NavigationStack(Destination),
})
/** A Reminders Model value. */
export type Model = typeof Model.Type

// READ

type HasBoard = Readonly<{ board: BoardState }>

/** The board, once the store has sent it. */
export const boardOf = (model: HasBoard): Option.Option<Board> =>
  model.board._tag === 'BoardReady'
    ? Option.some(model.board.board)
    : Option.none()

/** Every list the person can see, in their order. */
export const listsOf = (model: HasBoard): ReadonlyArray<ReminderList> =>
  Option.match(boardOf(model), { onNone: () => [], onSome: listsInOrder })

/** The list `listId` names, while the person can see it. */
export const listOf = (
  model: HasBoard,
  listId: ListId,
): Option.Option<ReminderList> =>
  Option.flatMap(boardOf(model), board => listIn(board, listId))

/** The reminder `reminderId` names, while the person can see it. */
export const reminderOf = (
  model: HasBoard,
  reminderId: ReminderId,
): Option.Option<Reminder> =>
  Option.flatMap(boardOf(model), board => reminderIn(board, reminderId))

/** Every reminder the person can see. */
export const remindersOf = (model: HasBoard): ReadonlyArray<Reminder> =>
  Option.match(boardOf(model), {
    onNone: () => [],
    onSome: board => board.reminders,
  })

/** The tag `tagTitle` names, while a reminder the person can see has it. */
export const tagOf = (
  model: HasBoard,
  tagTitle: TagTitle,
): Option.Option<Tag> =>
  Option.flatMap(boardOf(model), board => tagNamed(board, tagTitle))

/** The lists whose reminders the person may change, in their order. */
export const writableListsOf = (model: HasBoard): ReadonlyArray<ReminderList> =>
  Option.match(boardOf(model), { onNone: () => [], onSome: writableListsIn })

/** True when the person may change the reminders in `listId`. */
export const canWrite = (model: HasBoard, listId: ListId): boolean =>
  Array.some(writableListsOf(model), list => list.listId === listId)
