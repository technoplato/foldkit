import {
  Array,
  Effect,
  Layer,
  Match as M,
  Option,
  Stream,
  SubscriptionRef,
} from 'effect'

import {
  type Board,
  type Due,
  ListColor,
  type Member,
  type Priority,
  type Reminder,
  type ReminderList,
  type Role,
  type Tag,
} from './board.js'
import {
  type DeviceCalendar,
  type DueAt,
  type LocalDay,
  LocalTime,
  addDays,
  utcCalendar,
} from './calendar.js'
import {
  ListId,
  MemberId,
  MembershipId,
  ReminderId,
  ShareId,
  TagId,
  TagTitle,
} from './ids.js'
import {
  RemindersStore,
  RemindersStoreError,
  type RemindersWrite,
} from './store.js'

// SAMPLE

const uuidOf = (group: number, index: number): string =>
  `00000000-0000-4000-8${group.toString(16).padStart(3, '0')}-${index.toString(16).padStart(12, '0')}`

const memberIdOf = (index: number) => MemberId.make(uuidOf(1, index))

const listIdOf = (index: number) => ListId.make(uuidOf(2, index))

const reminderIdOf = (index: number) => ReminderId.make(uuidOf(3, index))

const tagIdOf = (index: number) => TagId.make(uuidOf(4, index))

const personOf = (
  index: number,
  displayName: string,
  email: string,
): Member => ({
  memberId: memberIdOf(index),
  maybeEmail: Option.some(email),
  maybeDisplayName: Option.some(displayName),
  maybeUsername: Option.none(),
  maybeImageUrl: Option.none(),
})

/** The made-up person signed in to the sample board. */
export const sampleMember = personOf(1, 'Ada Quill', 'ada@example.com')

const sam = personOf(2, 'Sam Reed', 'sam@example.com')

const noor = personOf(3, 'Noor Vale', 'noor@example.com')

/** The made-up people the sample lists are shared with. */
export const samplePeople: ReadonlyArray<Member> = [sam, noor]

/** The sample lists' ids, so tests can name them. */
export const sampleListIds = {
  groceries: listIdOf(1),
  home: listIdOf(2),
  work: listIdOf(3),
  reading: listIdOf(4),
}

/** The sample tags. */
export const sampleTags: ReadonlyArray<Tag> = [
  { tagId: tagIdOf(1), title: TagTitle.make('errands') },
  { tagId: tagIdOf(2), title: TagTitle.make('chores') },
  { tagId: tagIdOf(3), title: TagTitle.make('slides') },
]

const tagNamed = (title: string): ReadonlyArray<TagId> =>
  Array.map(
    Array.filter(sampleTags, tag => tag.title === title),
    tag => tag.tagId,
  )

const sampleZone = utcCalendar(0)

const dueOn = (day: LocalDay, time: string): Option.Option<Due> => {
  const dueAt: DueAt = { day, time: LocalTime.make(time) }
  return Option.some({ ...dueAt, atMs: sampleZone.instantOf(dueAt) })
}

type SampleReminder = Readonly<{
  title: string
  notes?: string
  isCompleted?: boolean
  isFlagged?: boolean
  maybeDue?: Option.Option<Due>
  maybePriority?: Option.Option<Priority>
  tagIds?: ReadonlyArray<TagId>
}>

const remindersIn = (
  listId: ListId,
  firstIndex: number,
  rows: ReadonlyArray<SampleReminder>,
): ReadonlyArray<Reminder> =>
  Array.map(rows, (row, position) => ({
    reminderId: reminderIdOf(firstIndex + position),
    listId,
    title: row.title,
    notes: row.notes ?? '',
    isCompleted: row.isCompleted ?? false,
    isFlagged: row.isFlagged ?? false,
    maybeDue: row.maybeDue ?? Option.none(),
    maybePriority: row.maybePriority ?? Option.none(),
    position,
    createdAtMs: 0,
    tagIds: row.tagIds ?? [],
  }))

const listOf = (
  listId: ListId,
  title: string,
  color: string,
  position: number,
  ownerId: MemberId,
  shared: Readonly<{
    readers: ReadonlyArray<Member>
    writers: ReadonlyArray<Member>
  }>,
): ReminderList => ({
  listId,
  title,
  color: ListColor.make(color),
  maybeCoverFileId: Option.none(),
  position,
  createdAtMs: 0,
  ownerId,
  readerIds: Array.map(shared.readers, reader => reader.memberId),
  writerIds: Array.map(shared.writers, writer => writer.memberId),
  maybeShare: Option.none(),
})

const notShared = { readers: [], writers: [] }

const shareOf = (
  list: ReminderList,
  shareIndex: number,
  members: ReadonlyArray<Readonly<{ member: Member; role: Role }>>,
): ReminderList => ({
  ...list,
  maybeShare: Option.some({
    shareId: ShareId.make(uuidOf(5, shareIndex)),
    token: uuidOf(6, shareIndex),
    ownerId: list.ownerId,
    createdAtMs: 0,
    updatedAtMs: 0,
    maybeRevokedAtMs: Option.none(),
    memberships: Array.map(members, ({ member, role }, index) => ({
      membershipId: MembershipId.make(uuidOf(7, shareIndex * 100 + index)),
      memberId: member.memberId,
      role,
      acceptedAtMs: 0,
      maybeRevokedAtMs: Option.none(),
    })),
  }),
})

/**
 * A made-up board for tests and for looking at the screens: Ada Quill's
 * Groceries, shared with Sam Reed, her Home and Work lists, and Noor
 * Vale's Reading list, which Noor shares with Ada to view. Due dates fall
 * around `today`, so Today, Scheduled, and an overdue reminder always
 * show. Everyone in it is made up.
 *
 * @example
 * ```typescript
 * sampleBoard(LocalDay.make('2026-10-07')).lists.length // 4
 * ```
 */
export const sampleBoard = (today: LocalDay): Board => {
  const { groceries, home, work, reading } = sampleListIds
  const lists = [
    shareOf(
      listOf(groceries, 'Groceries', '#34c759', 0, sampleMember.memberId, {
        readers: [],
        writers: [sam],
      }),
      1,
      [
        { member: sampleMember, role: 'Owner' },
        { member: sam, role: 'Writer' },
      ],
    ),
    listOf(home, 'Home', '#ff9500', 1, sampleMember.memberId, notShared),
    listOf(work, 'Work', '#4a99ef', 2, sampleMember.memberId, notShared),
    shareOf(
      listOf(reading, 'Reading', '#af52de', 3, noor.memberId, {
        readers: [sampleMember],
        writers: [],
      }),
      2,
      [
        { member: noor, role: 'Owner' },
        { member: sampleMember, role: 'Reader' },
      ],
    ),
  ]
  const reminders = [
    ...remindersIn(groceries, 1, [
      {
        title: 'Oat milk',
        maybeDue: dueOn(today, '09:00'),
        tagIds: tagNamed('errands'),
      },
      { title: 'Sourdough loaf' },
      { title: 'Six lemons', notes: 'For the lemon tart on Sunday' },
      {
        title: 'Coffee beans',
        isFlagged: true,
        maybePriority: Option.some('Medium'),
      },
      { title: 'Olive oil', isCompleted: true },
    ]),
    ...remindersIn(home, 11, [
      {
        title: 'Call the plumber about the kitchen tap',
        isFlagged: true,
        maybePriority: Option.some('High'),
        maybeDue: dueOn(addDays(today, 1), '10:00'),
      },
      {
        title: 'Water the plants',
        maybeDue: dueOn(today, '18:00'),
        tagIds: tagNamed('chores'),
      },
      { title: 'Replace the hallway bulb', tagIds: tagNamed('chores') },
      {
        title: 'Book the chimney sweep',
        maybeDue: dueOn(addDays(today, 6), '09:00'),
      },
      { title: 'Take out the recycling', isCompleted: true },
    ]),
    ...remindersIn(work, 21, [
      {
        title: 'Send the expense report',
        maybePriority: Option.some('High'),
        maybeDue: dueOn(addDays(today, -1), '17:00'),
      },
      {
        title: 'Draft the Q4 roadmap',
        notes: 'Start from last quarter’s goals and the customer interviews',
        maybeDue: dueOn(today, '15:00'),
      },
      {
        title: 'Prepare slides for Thursday',
        maybeDue: dueOn(addDays(today, 2), '11:00'),
        tagIds: tagNamed('slides'),
      },
      {
        title: 'Review Noor’s pull request',
        maybePriority: Option.some('Medium'),
      },
    ]),
    ...remindersIn(reading, 31, [
      { title: 'The Lantern Keeper' },
      { title: 'Small Hours', isFlagged: true },
      { title: 'A Field Guide to Weather' },
    ]),
  ]
  return {
    member: sampleMember,
    lists,
    reminders,
    tags: sampleTags,
    people: samplePeople,
  }
}

// MEMORY

const firstNewIndex = 1000

const idsPerWrite = 4

/**
 * The ids one write may make, from the write's place in the store's order,
 * so the same writes always make the same ids: `next(0)` and `next(1)` for
 * the share and its first member.
 */
type NewIds = Readonly<{ next: (offset: number) => number }>

const newIdsFor = (sequence: number): NewIds => ({
  next: offset => firstNewIndex + sequence * idsPerWrite + offset,
})

const withReminders = (
  board: Board,
  reminderIds: ReadonlyArray<ReminderId>,
  change: (reminder: Reminder) => Reminder,
): Board => ({
  ...board,
  reminders: Array.map(board.reminders, reminder =>
    Array.contains(reminderIds, reminder.reminderId)
      ? change(reminder)
      : reminder,
  ),
})

const withList = (
  board: Board,
  listId: ListId,
  change: (list: ReminderList) => ReminderList,
): Board => ({
  ...board,
  lists: Array.map(board.lists, list =>
    list.listId === listId ? change(list) : list,
  ),
})

const dueOfAt = (calendar: DeviceCalendar, dueAt: DueAt): Due => ({
  ...dueAt,
  atMs: calendar.instantOf(dueAt),
})

const withRoleIds = (
  list: ReminderList,
  role: Role,
  change: (ids: ReadonlyArray<MemberId>) => ReadonlyArray<MemberId>,
): ReminderList =>
  M.value(role).pipe(
    M.withReturnType<ReminderList>(),
    M.when('Writer', () => ({ ...list, writerIds: change(list.writerIds) })),
    M.when('Reader', () => ({ ...list, readerIds: change(list.readerIds) })),
    M.when('Owner', () => list),
    M.exhaustive,
  )

const withoutId =
  (memberId: MemberId) =>
  (ids: ReadonlyArray<MemberId>): ReadonlyArray<MemberId> =>
    Array.filter(ids, id => id !== memberId)

const withId =
  (memberId: MemberId) =>
  (ids: ReadonlyArray<MemberId>): ReadonlyArray<MemberId> =>
    Array.append(
      Array.filter(ids, id => id !== memberId),
      memberId,
    )

/**
 * One write applied to a board the way the Instant store applies it, or
 * the store's refusal: a share with an email nobody signed in with.
 */
export const appliedWrite = (
  board: Board,
  write: RemindersWrite,
  calendar: DeviceCalendar,
  newIds: NewIds,
): Effect.Effect<Board, RemindersStoreError> =>
  M.value(write).pipe(
    M.withReturnType<Effect.Effect<Board, RemindersStoreError>>(),
    M.tagsExhaustive({
      InsertList: ({ title, color, position }) =>
        Effect.succeed({
          ...board,
          lists: Array.append(board.lists, {
            listId: listIdOf(newIds.next(0)),
            title,
            color,
            maybeCoverFileId: Option.none(),
            position,
            createdAtMs: calendar.nowMs(),
            ownerId: board.member.memberId,
            readerIds: [],
            writerIds: [],
            maybeShare: Option.none(),
          }),
        }),
      UpdateListTitle: ({ listId, title }) =>
        Effect.succeed(withList(board, listId, list => ({ ...list, title }))),
      UpdateListColor: ({ listId, color }) =>
        Effect.succeed(withList(board, listId, list => ({ ...list, color }))),
      RemoveList: ({ listId }) =>
        Effect.succeed({
          ...board,
          lists: Array.filter(board.lists, list => list.listId !== listId),
          reminders: Array.filter(
            board.reminders,
            reminder => reminder.listId !== listId,
          ),
        }),
      InsertReminder: ({ listId, title, position, isFlagged, maybeDue }) =>
        Effect.succeed({
          ...board,
          reminders: Array.append(board.reminders, {
            reminderId: reminderIdOf(newIds.next(0)),
            listId,
            title,
            notes: '',
            isCompleted: false,
            isFlagged,
            maybeDue: Option.map(maybeDue, due => dueOfAt(calendar, due)),
            maybePriority: Option.none(),
            position,
            createdAtMs: calendar.nowMs(),
            tagIds: [],
          }),
        }),
      UpdateReminderTitle: ({ reminderId, title }) =>
        Effect.succeed(
          withReminders(board, [reminderId], reminder => ({
            ...reminder,
            title,
          })),
        ),
      UpdateReminderNotes: ({ reminderId, notes }) =>
        Effect.succeed(
          withReminders(board, [reminderId], reminder => ({
            ...reminder,
            notes,
          })),
        ),
      UpdateCompletion: ({ reminderId, isCompleted }) =>
        Effect.succeed(
          withReminders(board, [reminderId], reminder => ({
            ...reminder,
            isCompleted,
          })),
        ),
      UpdateFlag: ({ reminderId, isFlagged }) =>
        Effect.succeed(
          withReminders(board, [reminderId], reminder => ({
            ...reminder,
            isFlagged,
          })),
        ),
      UpdateDue: ({ reminderId, maybeDue }) =>
        Effect.succeed(
          withReminders(board, [reminderId], reminder => ({
            ...reminder,
            maybeDue: Option.map(maybeDue, due => dueOfAt(calendar, due)),
          })),
        ),
      UpdatePriority: ({ reminderId, maybePriority }) =>
        Effect.succeed(
          withReminders(board, [reminderId], reminder => ({
            ...reminder,
            maybePriority,
          })),
        ),
      RelinkReminder: ({ reminderId, toListId, position }) =>
        Effect.succeed(
          withReminders(board, [reminderId], reminder => ({
            ...reminder,
            listId: toListId,
            position,
          })),
        ),
      RemoveReminders: ({ reminderIds }) =>
        Effect.succeed({
          ...board,
          reminders: Array.filter(
            board.reminders,
            reminder => !Array.contains(reminderIds, reminder.reminderId),
          ),
        }),
      LinkTag: ({ reminderId, title, maybeTagId }) => {
        const tag = Option.match(maybeTagId, {
          onNone: () => ({ tagId: tagIdOf(newIds.next(0)), title }),
          onSome: tagId => ({ tagId, title }),
        })
        return Effect.succeed({
          ...withReminders(board, [reminderId], reminder => ({
            ...reminder,
            tagIds: Array.append(
              Array.filter(reminder.tagIds, tagId => tagId !== tag.tagId),
              tag.tagId,
            ),
          })),
          tags: Array.append(
            Array.filter(board.tags, known => known.tagId !== tag.tagId),
            tag,
          ),
        })
      },
      UnlinkTag: ({ reminderId, tagId }) =>
        Effect.succeed(
          withReminders(board, [reminderId], reminder => ({
            ...reminder,
            tagIds: Array.filter(reminder.tagIds, known => known !== tagId),
          })),
        ),
      RemoveTag: ({ tagId }) =>
        Effect.succeed({
          ...withReminders(
            board,
            Array.map(board.reminders, reminder => reminder.reminderId),
            reminder => ({
              ...reminder,
              tagIds: Array.filter(reminder.tagIds, known => known !== tagId),
            }),
          ),
          tags: Array.filter(board.tags, tag => tag.tagId !== tagId),
        }),
      InsertShare: ({ listId }) => {
        const shareIndex = newIds.next(0)
        return Effect.succeed(
          withList(board, listId, list => ({
            ...list,
            maybeShare: Option.some({
              shareId: ShareId.make(uuidOf(5, shareIndex)),
              token: uuidOf(6, shareIndex),
              ownerId: board.member.memberId,
              createdAtMs: calendar.nowMs(),
              updatedAtMs: calendar.nowMs(),
              maybeRevokedAtMs: Option.none(),
              memberships: [
                {
                  membershipId: MembershipId.make(uuidOf(7, newIds.next(1))),
                  memberId: board.member.memberId,
                  role: 'Owner',
                  acceptedAtMs: calendar.nowMs(),
                  maybeRevokedAtMs: Option.none(),
                },
              ],
            }),
          })),
        )
      },
      InsertMembership: ({ listId, email, role }) =>
        Option.match(
          Array.findFirst(board.people, person =>
            Option.contains(person.maybeEmail, email),
          ),
          {
            onNone: () =>
              Effect.fail(
                new RemindersStoreError({
                  reason: `nobody has signed in as ${email} yet`,
                }),
              ),
            onSome: person =>
              Effect.succeed(
                withList(board, listId, list => ({
                  ...withRoleIds(list, role, withId(person.memberId)),
                  maybeShare: Option.map(list.maybeShare, share => ({
                    ...share,
                    updatedAtMs: calendar.nowMs(),
                    memberships: Array.append(share.memberships, {
                      membershipId: MembershipId.make(
                        uuidOf(7, newIds.next(0)),
                      ),
                      memberId: person.memberId,
                      role,
                      acceptedAtMs: calendar.nowMs(),
                      maybeRevokedAtMs: Option.none(),
                    }),
                  })),
                })),
              ),
          },
        ),
      UpdateMembershipRole: ({ listId, membershipId, memberId, from, to }) =>
        Effect.succeed(
          withList(board, listId, list => ({
            ...withRoleIds(
              withRoleIds(list, from, withoutId(memberId)),
              to,
              withId(memberId),
            ),
            maybeShare: Option.map(list.maybeShare, share => ({
              ...share,
              updatedAtMs: calendar.nowMs(),
              memberships: Array.map(share.memberships, membership =>
                membership.membershipId === membershipId
                  ? { ...membership, role: to, maybeRevokedAtMs: Option.none() }
                  : membership,
              ),
            })),
          })),
        ),
      RevokeMembership: ({ listId, membershipId, memberId, role }) =>
        Effect.succeed(
          withList(board, listId, list => ({
            ...withRoleIds(list, role, withoutId(memberId)),
            maybeShare: Option.map(list.maybeShare, share => ({
              ...share,
              updatedAtMs: calendar.nowMs(),
              memberships: Array.map(share.memberships, membership =>
                membership.membershipId === membershipId
                  ? {
                      ...membership,
                      maybeRevokedAtMs: Option.some(calendar.nowMs()),
                    }
                  : membership,
              ),
            })),
          })),
        ),
    }),
  )

/**
 * A reminders store held in memory, for tests only: it starts from
 * `board`, applies each write the way the Instant store does, sends every
 * new board, and records the writes in order. Every example ships on the
 * Instant store.
 *
 * @example
 * ```typescript
 * const store = yield* makeTestRemindersStore(sampleBoard(today))
 * Runtime.startHandle({ program: SyncedReminders, sync, resources: store.layer })
 * ```
 */
export const makeTestRemindersStore = (
  board: Board,
  calendar: DeviceCalendar = utcCalendar(0),
) =>
  Effect.gen(function* () {
    const current = yield* SubscriptionRef.make(board)
    const writes = yield* SubscriptionRef.make<ReadonlyArray<RemindersWrite>>(
      [],
    )
    const layer = Layer.succeed(RemindersStore, {
      board: Stream.map(SubscriptionRef.changes(current), Option.some),
      write: write =>
        Effect.gen(function* () {
          const written = yield* SubscriptionRef.get(writes)
          yield* SubscriptionRef.set(writes, Array.append(written, write))
          const before = yield* SubscriptionRef.get(current)
          const after = yield* appliedWrite(
            before,
            write,
            calendar,
            newIdsFor(written.length),
          )
          yield* SubscriptionRef.set(current, after)
        }),
    })
    return {
      layer,
      writes: SubscriptionRef.get(writes),
      board: SubscriptionRef.get(current),
    }
  })
