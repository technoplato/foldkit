import {
  Array,
  Match as M,
  Option,
  Order,
  Schema as S,
  String,
  pipe,
} from 'effect'

import { DueAt, type LocalDay } from './calendar.js'
import {
  ListId,
  MemberId,
  MembershipId,
  ReminderId,
  ShareId,
  TagId,
  TagTitle,
} from './ids.js'

// BOARD

/** How much a reminder matters, as Reminders V3 stores it: 1, 2, or 3. */
export const Priority = S.Literals(['Low', 'Medium', 'High'])
/** How much a reminder matters. */
export type Priority = typeof Priority.Type

/**
 * The lists every person has without making them, each a filter over
 * their reminders: due today or earlier, due any day, all open, flagged,
 * and done.
 */
export const SmartList = S.Literals([
  'Today',
  'Scheduled',
  'All',
  'Flagged',
  'Completed',
])
/** A list every person has without making it. */
export type SmartList = typeof SmartList.Type

/** How a list orders its reminders, Reminders V3's four orders. */
export const Ordering = S.Literals(['Manual', 'DueDate', 'Priority', 'Title'])
/** How a list orders its reminders. */
export type Ordering = typeof Ordering.Type

/**
 * What a person may do with a list: own it, edit it, or only view it.
 * Reminders V3 stores it as the list's owner, writers, and readers.
 */
export const Role = S.Literals(['Owner', 'Writer', 'Reader'])
/** What a person may do with a list. */
export type Role = typeof Role.Type

/** A list's color as a lowercase hex, `#4a99ef`, the way Reminders V3 stores it. */
export const ListColor = S.String.check(S.isPattern(/^#[0-9a-f]{6}$/)).pipe(
  S.brand('ListColor'),
)
/** A list's color as a lowercase hex. */
export type ListColor = typeof ListColor.Type

/** The color a new list takes, Reminders V3's default blue. */
export const defaultListColor = ListColor.make('#4a99ef')

/** When a reminder is due: the instant, and its day and time on the person's own calendar. */
export const Due = S.Struct({ ...DueAt.fields, atMs: S.Number })
/** When a reminder is due. */
export type Due = typeof Due.Type

/** One reminder, the fields Reminders V3 stores for it. */
export const Reminder = S.Struct({
  reminderId: ReminderId,
  listId: ListId,
  title: S.String,
  notes: S.String,
  isCompleted: S.Boolean,
  isFlagged: S.Boolean,
  maybeDue: S.Option(Due),
  maybePriority: S.Option(Priority),
  position: S.Number,
  createdAtMs: S.Number,
  tagIds: S.Array(TagId),
})
/** One reminder. */
export type Reminder = typeof Reminder.Type

/** One tag, `errands`, shown as `#errands`. */
export const Tag = S.Struct({ tagId: TagId, title: TagTitle })
/** One tag. */
export type Tag = typeof Tag.Type

/** One person, as their Instant `$users` row tells: their email and names. */
export const Member = S.Struct({
  memberId: MemberId,
  maybeEmail: S.Option(S.String),
  maybeDisplayName: S.Option(S.String),
  maybeUsername: S.Option(S.String),
  maybeImageUrl: S.Option(S.String),
})
/** One person. */
export type Member = typeof Member.Type

/** One person's place in a list's share, and whether it was taken back. */
export const Membership = S.Struct({
  membershipId: MembershipId,
  memberId: MemberId,
  role: Role,
  acceptedAtMs: S.Number,
  maybeRevokedAtMs: S.Option(S.Number),
})
/** One person's place in a list's share. */
export type Membership = typeof Membership.Type

/** A list's share: who started it, and everyone it was shared with. */
export const Share = S.Struct({
  shareId: ShareId,
  token: S.String,
  ownerId: MemberId,
  createdAtMs: S.Number,
  updatedAtMs: S.Number,
  maybeRevokedAtMs: S.Option(S.Number),
  memberships: S.Array(Membership),
})
/** A list's share. */
export type Share = typeof Share.Type

/** One list of reminders, the fields Reminders V3 stores for it. */
export const ReminderList = S.Struct({
  listId: ListId,
  title: S.String,
  color: ListColor,
  maybeCoverFileId: S.Option(S.String),
  position: S.Number,
  createdAtMs: S.Number,
  ownerId: MemberId,
  readerIds: S.Array(MemberId),
  writerIds: S.Array(MemberId),
  maybeShare: S.Option(Share),
})
/** One list of reminders. */
export type ReminderList = typeof ReminderList.Type

/**
 * Everything the signed-in person can see: who they are, every list they
 * own or were invited to, those lists' reminders and tags, and the people
 * the lists name.
 */
export const Board = S.Struct({
  member: Member,
  lists: S.Array(ReminderList),
  reminders: S.Array(Reminder),
  tags: S.Array(Tag),
  people: S.Array(Member),
})
/** Everything the signed-in person can see. */
export type Board = typeof Board.Type

// IDENTITY

const nonEmptyOf = (maybeText: Option.Option<string>): Option.Option<string> =>
  Option.filter(Option.map(maybeText, String.trim), String.isNonEmpty)

/**
 * How a person reads on screen, as Reminders V3 names them: their display
 * name, else `@username`, else their email, else `Guest account`.
 *
 * @example
 * ```typescript
 * identityTitleOf(member) // 'Ada Quill'
 * ```
 */
export const identityTitleOf = (member: Member): string =>
  pipe(
    nonEmptyOf(member.maybeDisplayName),
    Option.orElse(() =>
      Option.map(nonEmptyOf(member.maybeUsername), username => `@${username}`),
    ),
    Option.orElse(() => nonEmptyOf(member.maybeEmail)),
    Option.getOrElse(() => 'Guest account'),
  )

/** The person `memberId` names, from the board's people. */
export const personOf = (
  board: Board,
  memberId: MemberId,
): Option.Option<Member> =>
  memberId === board.member.memberId
    ? Option.some(board.member)
    : Array.findFirst(board.people, person => person.memberId === memberId)

// LISTS

const byPositionThenId = <A extends Readonly<{ position: number }>>(
  idOf: (row: A) => string,
): Order.Order<A> =>
  Order.combine(
    Order.mapInput(Order.Number, (row: A) => row.position),
    Order.mapInput(Order.String, idOf),
  )

/** The lists in the order their owner arranged them. */
export const listsInOrder = (board: Board): ReadonlyArray<ReminderList> =>
  Array.sort(
    board.lists,
    byPositionThenId((list: ReminderList) => list.listId),
  )

/** The list `listId` names, while the person can see it. */
export const listIn = (
  board: Board,
  listId: ListId,
): Option.Option<ReminderList> =>
  Array.findFirst(board.lists, list => list.listId === listId)

/**
 * What the signed-in person may do with a list: Owner, Writer, or
 * Reader, read from its owner and writers the way Reminders V3 does.
 */
export const roleIn = (board: Board, list: ReminderList): Role => {
  if (list.ownerId === board.member.memberId) {
    return 'Owner'
  } else if (Array.contains(list.writerIds, board.member.memberId)) {
    return 'Writer'
  } else {
    return 'Reader'
  }
}

/** True when the signed-in person may change the list's reminders. */
export const canWriteIn = (board: Board, list: ReminderList): boolean =>
  roleIn(board, list) !== 'Reader'

/** The lists whose reminders the signed-in person may change. */
export const writableListsIn = (board: Board): ReadonlyArray<ReminderList> =>
  Array.filter(listsInOrder(board), list => canWriteIn(board, list))

/** The people a list is shared with now, its revoked places left out. */
export const sharedWithOf = (list: ReminderList): ReadonlyArray<Membership> =>
  Option.match(list.maybeShare, {
    onNone: () => [],
    onSome: share =>
      Array.filter(
        share.memberships,
        membership =>
          membership.role !== 'Owner' &&
          Option.isNone(membership.maybeRevokedAtMs),
      ),
  })

// REMINDERS

/** The reminder `reminderId` names, while the person can see it. */
export const reminderIn = (
  board: Board,
  reminderId: ReminderId,
): Option.Option<Reminder> =>
  Array.findFirst(
    board.reminders,
    reminder => reminder.reminderId === reminderId,
  )

/** Every reminder in one list, in no particular order. */
export const remindersInList = (
  board: Board,
  listId: ListId,
): ReadonlyArray<Reminder> =>
  Array.filter(board.reminders, reminder => reminder.listId === listId)

/** The reminders still to do. */
export const openOf = (
  reminders: ReadonlyArray<Reminder>,
): ReadonlyArray<Reminder> =>
  Array.filter(reminders, reminder => !reminder.isCompleted)

/** The reminders already done. */
export const completedOf = (
  reminders: ReadonlyArray<Reminder>,
): ReadonlyArray<Reminder> =>
  Array.filter(reminders, reminder => reminder.isCompleted)

/** True for an open reminder whose day has passed. */
export const isOverdue = (reminder: Reminder, today: LocalDay): boolean =>
  !reminder.isCompleted &&
  Option.exists(reminder.maybeDue, due => due.day < today)

/**
 * True when a smart list shows the reminder. Today shows the open ones due
 * today or earlier, as Apple Reminders does, and nothing until the clock
 * reports today; Scheduled the open ones with any due date; All every open
 * one; Flagged the open flagged ones; and Completed the done ones.
 */
export const isInSmartList =
  (smartList: SmartList, maybeToday: Option.Option<LocalDay>) =>
  (reminder: Reminder): boolean =>
    M.value(smartList).pipe(
      M.withReturnType<boolean>(),
      M.when('Today', () =>
        Option.exists(maybeToday, today =>
          Option.exists(
            reminder.maybeDue,
            due => !reminder.isCompleted && due.day <= today,
          ),
        ),
      ),
      M.when(
        'Scheduled',
        () => !reminder.isCompleted && Option.isSome(reminder.maybeDue),
      ),
      M.when('All', () => !reminder.isCompleted),
      M.when('Flagged', () => !reminder.isCompleted && reminder.isFlagged),
      M.when('Completed', () => reminder.isCompleted),
      M.exhaustive,
    )

/** The reminders a smart list shows. */
export const remindersInSmartList = (
  board: Board,
  smartList: SmartList,
  maybeToday: Option.Option<LocalDay>,
): ReadonlyArray<Reminder> =>
  Array.filter(board.reminders, isInSmartList(smartList, maybeToday))

const priorityRank = (reminder: Reminder): number =>
  Option.match(reminder.maybePriority, {
    onNone: () => 0,
    onSome: priority =>
      M.value(priority).pipe(
        M.withReturnType<number>(),
        M.when('Low', () => 1),
        M.when('Medium', () => 2),
        M.when('High', () => 3),
        M.exhaustive,
      ),
  })

const byManual = byPositionThenId((reminder: Reminder) => reminder.reminderId)

const byDueDatedFirst: Order.Order<Reminder> = Order.make((self, that) =>
  Option.match(self.maybeDue, {
    onNone: () => (Option.isSome(that.maybeDue) ? 1 : 0),
    onSome: selfDue =>
      Option.match(that.maybeDue, {
        onNone: () => -1,
        onSome: thatDue => Order.Number(selfDue.atMs, thatDue.atMs),
      }),
  }),
)

const byDueThenManual: Order.Order<Reminder> = Order.combine(
  byDueDatedFirst,
  byManual,
)

const byPriorityThenFlag: Order.Order<Reminder> = Order.combine(
  Order.mapInput(Order.flip(Order.Number), priorityRank),
  Order.combine(
    Order.mapInput(
      Order.flip(Order.Boolean),
      (reminder: Reminder) => reminder.isFlagged,
    ),
    byManual,
  ),
)

const byTitle: Order.Order<Reminder> = Order.combine(
  Order.mapInput(Order.String, (reminder: Reminder) =>
    reminder.title.toLowerCase(),
  ),
  Order.mapInput(Order.String, (reminder: Reminder) => reminder.reminderId),
)

const orderOf = (ordering: Ordering): Order.Order<Reminder> =>
  M.value(ordering).pipe(
    M.withReturnType<Order.Order<Reminder>>(),
    M.when('Manual', () => byManual),
    M.when('DueDate', () => byDueThenManual),
    M.when('Priority', () => byPriorityThenFlag),
    M.when('Title', () => byTitle),
    M.exhaustive,
  )

/**
 * Reminders in an order, open ones first, as Reminders V3 sorts them:
 * by position, by due date with undated ones last, by priority then flag,
 * or by title.
 */
export const sortedBy = (
  reminders: ReadonlyArray<Reminder>,
  ordering: Ordering,
): ReadonlyArray<Reminder> =>
  Array.sort(
    reminders,
    Order.combine(
      Order.mapInput(
        Order.Boolean,
        (reminder: Reminder) => reminder.isCompleted,
      ),
      orderOf(ordering),
    ),
  )

// TAGS

/** The tag `tagTitle` names, while a reminder the person can see has it. */
export const tagNamed = (
  board: Board,
  tagTitle: TagTitle,
): Option.Option<Tag> =>
  Array.findFirst(board.tags, tag => tag.title === tagTitle)

/** A reminder's tags, by title. */
export const tagsOf = (board: Board, reminder: Reminder): ReadonlyArray<Tag> =>
  Array.sort(
    Array.filter(board.tags, tag => Array.contains(reminder.tagIds, tag.tagId)),
    Order.mapInput(Order.String, (tag: Tag) => tag.title),
  )

/** The reminders with a tag. */
export const remindersTagged = (
  board: Board,
  tag: Tag,
): ReadonlyArray<Reminder> =>
  Array.filter(board.reminders, reminder =>
    Array.contains(reminder.tagIds, tag.tagId),
  )

/** The tags at least one reminder has, by title, as Reminders V3 lists them. */
export const tagsInUse = (board: Board): ReadonlyArray<Tag> =>
  Array.sort(
    Array.filter(board.tags, tag =>
      Array.isReadonlyArrayNonEmpty(remindersTagged(board, tag)),
    ),
    Order.mapInput(Order.String, (tag: Tag) => tag.title),
  )

/**
 * True when the signed-in person may delete a tag: Reminders V3 lets them
 * only when every list with a reminder that has it is theirs.
 */
export const canDeleteTagIn = (board: Board, tag: Tag): boolean => {
  const listIds = Array.dedupe(
    Array.map(remindersTagged(board, tag), reminder => reminder.listId),
  )
  return (
    Array.isReadonlyArrayNonEmpty(listIds) &&
    Array.every(listIds, listId =>
      Option.exists(
        listIn(board, listId),
        list => roleIn(board, list) === 'Owner',
      ),
    )
  )
}

// SEARCH

/** How well a reminder matches a search, and the words that show why. */
export type SearchMatch = Readonly<{ score: number; summary: string }>

const snippetBefore = 32

const snippetAfter = 64

const snippetOf = (text: string, term: string): string =>
  Option.match(String.indexOf(term)(text.toLowerCase()), {
    onNone: () => text,
    onSome: at => {
      const start = Math.max(0, at - snippetBefore)
      const end = Math.min(text.length, at + term.length + snippetAfter)
      const prefix = start > 0 ? '…' : ''
      const suffix = end < text.length ? '…' : ''
      return `${prefix}${text.slice(start, end)}${suffix}`
    },
  })

const tagScore = 80

const exactTitleScore = 140

const titleScore = 100

const partialTagScore = 70

const notesScore = 40

type TermMatch = Readonly<{ score: number; summary: string }>

const termMatchOf = (
  reminder: Reminder,
  titles: ReadonlyArray<string>,
  term: string,
): Option.Option<TermMatch> => {
  const title = reminder.title.toLowerCase()
  const notes = reminder.notes.toLowerCase()
  if (term.startsWith('#')) {
    const tagTerm = term.slice(1)
    return Array.contains(titles, tagTerm)
      ? Option.some({ score: tagScore, summary: `#${tagTerm}` })
      : Option.none()
  } else if (title.includes(term)) {
    return Option.some({
      score: title === term ? exactTitleScore : titleScore,
      summary: `Title: ${snippetOf(reminder.title, term)}`,
    })
  } else {
    return Option.orElse(
      Option.map(
        Array.findFirst(titles, tagTitle => tagTitle.includes(term)),
        tagTitle => ({ score: partialTagScore, summary: `#${tagTitle}` }),
      ),
      () =>
        notes.includes(term)
          ? Option.some({
              score: notesScore,
              summary: `Notes: ${snippetOf(reminder.notes, term)}`,
            })
          : Option.none(),
    )
  }
}

/**
 * How a reminder matches a search, scored as Reminders V3 scores it: every
 * word must match, a `#tag` word only that tag, and a title match counts
 * most. None when any word misses.
 *
 * @example
 * ```typescript
 * searchMatchOf(board, milk, 'milk') // Some({ score: 140, summary: 'Title: Milk' })
 * searchMatchOf(board, milk, '#errands bread') // None, unless both match
 * ```
 */
export const searchMatchOf = (
  board: Board,
  reminder: Reminder,
  query: string,
): Option.Option<SearchMatch> => {
  const terms = Array.filter(
    String.split(query.toLowerCase(), /\s+/),
    String.isNonEmpty,
  )
  const titles = Array.map(tagsOf(board, reminder), tag => tag.title)
  const matches = Array.map(terms, term => termMatchOf(reminder, titles, term))
  return Array.match(terms, {
    onEmpty: () => Option.none(),
    onNonEmpty: () =>
      Array.every(matches, Option.isSome)
        ? Option.some({
            score: Array.reduce(
              Array.getSomes(matches),
              0,
              (total, match) => total + match.score,
            ),
            summary: Option.getOrElse(
              Option.map(
                Array.head(Array.getSomes(matches)),
                match => match.summary,
              ),
              () => reminder.title,
            ),
          })
        : Option.none(),
  })
}

/** One reminder a search found, with its score and the words that show why. */
export type SearchResult = Readonly<{ reminder: Reminder; match: SearchMatch }>

/**
 * Every reminder a search finds, the best match first, open ones before
 * done ones at the same score.
 */
export const searchResultsOf = (
  board: Board,
  query: string,
): ReadonlyArray<SearchResult> =>
  pipe(
    board.reminders,
    Array.map(reminder =>
      Option.map(searchMatchOf(board, reminder, query), match => ({
        reminder,
        match,
      })),
    ),
    Array.getSomes,
    Array.sort(
      Order.combine(
        Order.mapInput(
          Order.flip(Order.Number),
          (result: SearchResult) => result.match.score,
        ),
        Order.mapInput(
          Order.combine(
            Order.mapInput(
              Order.Boolean,
              (reminder: Reminder) => reminder.isCompleted,
            ),
            byDueThenManual,
          ),
          (result: SearchResult) => result.reminder,
        ),
      ),
    ),
  )
