import { Context, Data, Effect, Option, Schema as S, Stream } from 'effect'
import { ts } from 'foldkit/schema'

import { type Board, ListColor, Priority, Role } from './board.js'
import { DueAt } from './calendar.js'
import {
  EmailAddress,
  ListId,
  ListTitle,
  MemberId,
  MembershipId,
  ReminderId,
  ReminderTitle,
  ShareId,
  TagId,
  TagTitle,
} from './ids.js'

// STORE

/** Inserts a list owned by the signed-in person, at `position`. */
export const InsertList = ts('InsertList', {
  title: ListTitle,
  color: ListColor,
  position: S.Number,
})
/** Updates a list's title. */
export const UpdateListTitle = ts('UpdateListTitle', {
  listId: ListId,
  title: ListTitle,
})
/** Updates a list's color. */
export const UpdateListColor = ts('UpdateListColor', {
  listId: ListId,
  color: ListColor,
})
/** Removes a list and, by Reminders V3's cascade, every reminder in it. */
export const RemoveList = ts('RemoveList', { listId: ListId })
/**
 * Inserts an open reminder at `position` in a list, flagged and due as
 * the screen it was added on asks: due today on Today, flagged on Flagged.
 */
export const InsertReminder = ts('InsertReminder', {
  listId: ListId,
  title: ReminderTitle,
  position: S.Number,
  isFlagged: S.Boolean,
  maybeDue: S.Option(DueAt),
})
/** Updates a reminder's title. */
export const UpdateReminderTitle = ts('UpdateReminderTitle', {
  reminderId: ReminderId,
  title: ReminderTitle,
})
/** Updates a reminder's notes; empty notes clear them. */
export const UpdateReminderNotes = ts('UpdateReminderNotes', {
  reminderId: ReminderId,
  notes: S.String,
})
/** Updates whether a reminder is done. */
export const UpdateCompletion = ts('UpdateCompletion', {
  reminderId: ReminderId,
  isCompleted: S.Boolean,
})
/** Updates whether a reminder is flagged. */
export const UpdateFlag = ts('UpdateFlag', {
  reminderId: ReminderId,
  isFlagged: S.Boolean,
})
/** Updates when a reminder is due, on the person's own calendar, or clears it. */
export const UpdateDue = ts('UpdateDue', {
  reminderId: ReminderId,
  maybeDue: S.Option(DueAt),
})
/** Updates how much a reminder matters, or clears it. */
export const UpdatePriority = ts('UpdatePriority', {
  reminderId: ReminderId,
  maybePriority: S.Option(Priority),
})
/** Links a reminder to another list, at its end. */
export const RelinkReminder = ts('RelinkReminder', {
  reminderId: ReminderId,
  fromListId: ListId,
  toListId: ListId,
  position: S.Number,
})
/** Removes reminders, one, or every done one in a list. */
export const RemoveReminders = ts('RemoveReminders', {
  reminderIds: S.Array(ReminderId),
})
/**
 * Links a tag to a reminder: the tag already named `title` when the person
 * can see one, else a new tag of that name.
 */
export const LinkTag = ts('LinkTag', {
  reminderId: ReminderId,
  title: TagTitle,
  maybeTagId: S.Option(TagId),
})
/** Unlinks a tag from a reminder. */
export const UnlinkTag = ts('UnlinkTag', {
  reminderId: ReminderId,
  tagId: TagId,
})
/** Removes a tag from every reminder that has it. */
export const RemoveTag = ts('RemoveTag', { tagId: TagId })
/** Inserts a list's share, with the owner as its first member. */
export const InsertShare = ts('InsertShare', { listId: ListId })
/** The roles a person can give someone they share a list with. */
export const SharedRole = S.Literals(['Writer', 'Reader'])
/** A role a person can give someone they share a list with. */
export type SharedRole = typeof SharedRole.Type
/**
 * Inserts a membership for the person who signs in with `email`, who can
 * then edit the list or only view it.
 */
export const InsertMembership = ts('InsertMembership', {
  listId: ListId,
  shareId: ShareId,
  email: EmailAddress,
  role: SharedRole,
})
/** Updates what someone a list is shared with may do. */
export const UpdateMembershipRole = ts('UpdateMembershipRole', {
  listId: ListId,
  shareId: ShareId,
  membershipId: MembershipId,
  memberId: MemberId,
  from: Role,
  to: SharedRole,
})
/** Revokes one person's membership in a list's share. */
export const RevokeMembership = ts('RevokeMembership', {
  listId: ListId,
  shareId: ShareId,
  membershipId: MembershipId,
  memberId: MemberId,
  role: Role,
})

/** One change the store makes for the signed-in person. */
export const RemindersWrite = S.Union([
  InsertList,
  UpdateListTitle,
  UpdateListColor,
  RemoveList,
  InsertReminder,
  UpdateReminderTitle,
  UpdateReminderNotes,
  UpdateCompletion,
  UpdateFlag,
  UpdateDue,
  UpdatePriority,
  RelinkReminder,
  RemoveReminders,
  LinkTag,
  UnlinkTag,
  RemoveTag,
  InsertShare,
  InsertMembership,
  UpdateMembershipRole,
  RevokeMembership,
])
/** One change the store makes for the signed-in person. */
export type RemindersWrite = typeof RemindersWrite.Type

/** The store could not do what was asked, and why, safe to show. */
export class RemindersStoreError extends Data.TaggedError(
  'RemindersStoreError',
)<{
  readonly reason: string
}> {}

/**
 * Where the reminders live: the board, sent again whenever it changes on
 * any device, `None` while nobody is signed in, and the writes that change
 * it. The live store reads and writes the Reminders V3 entities in
 * Instant; tests use one in memory.
 */
export class RemindersStore extends Context.Service<
  RemindersStore,
  Readonly<{
    board: Stream.Stream<Option.Option<Board>, RemindersStoreError>
    write: (write: RemindersWrite) => Effect.Effect<void, RemindersStoreError>
  }>
>()('reminders/RemindersStore') {}
