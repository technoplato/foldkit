import {
  Array,
  Cause,
  Effect,
  Match as M,
  Option,
  Predicate,
  Queue,
  Ref,
  Schema as S,
  Stream,
} from 'effect'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'
import { id } from '@instantdb/core'

import {
  type Board,
  type Due,
  ListColor,
  type Member,
  type Membership,
  type Priority,
  type Reminder,
  type ReminderList,
  Role,
  type Share,
  type Tag,
  defaultListColor,
} from './board.js'
import { type DeviceCalendar, hostCalendar } from './calendar.js'
import {
  ListId,
  MemberId,
  MembershipId,
  ReminderId,
  ShareId,
  TagId,
  TagTitleFromText,
} from './ids.js'
import {
  RemindersStore,
  RemindersStoreError,
  type RemindersWrite,
  type SharedRole,
} from './store.js'

// ROWS

const LinkOf = <A extends S.Top>(row: A) =>
  S.optionalKey(S.Union([S.Array(row), row, S.Null]))

const linkedOf = <A>(
  link: A | ReadonlyArray<A> | null | undefined,
): ReadonlyArray<A> =>
  link === undefined || link === null ? [] : Array.ensure(link)

const OptionalText = S.optionalKey(S.NullOr(S.String))

const DateValue = S.Union([S.String, S.Number])

const OptionalDate = S.optionalKey(S.NullOr(DateValue))

const UserRow = S.Struct({
  id: S.String,
  email: OptionalText,
  displayName: OptionalText,
  username: OptionalText,
  imageURL: OptionalText,
})

const TagRow = S.Struct({ id: S.String, title: S.String })

const ReminderRow = S.Struct({
  id: S.String,
  title: S.String,
  notes: OptionalText,
  isCompleted: S.optionalKey(S.NullOr(S.Boolean)),
  isFlagged: S.optionalKey(S.NullOr(S.Boolean)),
  dueDate: OptionalDate,
  priority: S.optionalKey(S.NullOr(S.Number)),
  position: S.optionalKey(S.NullOr(S.Number)),
  createdAt: OptionalDate,
  tags: LinkOf(S.Unknown),
})

const MembershipRow = S.Struct({
  id: S.String,
  role: S.String,
  acceptedAt: OptionalDate,
  revokedAt: OptionalDate,
  user: LinkOf(UserRow),
})

const ShareRow = S.Struct({
  id: S.String,
  token: S.String,
  createdAt: OptionalDate,
  updatedAt: OptionalDate,
  revokedAt: OptionalDate,
  owner: LinkOf(UserRow),
  memberships: LinkOf(S.Unknown),
})

const ListRow = S.Struct({
  id: S.String,
  title: S.String,
  color: OptionalText,
  coverFileID: OptionalText,
  position: S.optionalKey(S.NullOr(S.Number)),
  createdAt: OptionalDate,
  owner: LinkOf(UserRow),
  readers: LinkOf(UserRow),
  writers: LinkOf(UserRow),
  reminders: LinkOf(S.Unknown),
  share: LinkOf(S.Unknown),
})

const RemindersData = S.Struct({
  remindersLists: S.optionalKey(S.Array(S.Unknown)),
})

const listsLimit = 500

/**
 * The one bounded query the store reads with, the graph Reminders V3's
 * `RemindersV3List.visible(to:)` reads: every list the rules let the
 * person see, with its owner, writers, readers, reminders and their tags,
 * and its share and the share's members.
 */
export const remindersQuery = {
  remindersLists: {
    $: { limit: listsLimit },
    owner: {},
    readers: {},
    writers: {},
    reminders: { tags: {} },
    share: { owner: {}, memberships: { user: {} } },
  },
}

const decodeOne = <A>(schema: S.Decoder<A>, row: unknown): Option.Option<A> =>
  S.decodeUnknownOption(schema)(row)

const msOf = (value: string | number): Option.Option<number> =>
  Predicate.isNumber(value)
    ? Option.some(value)
    : Option.filter(Option.some(Date.parse(value)), Number.isFinite)

const maybeMsOf = (
  value: string | number | null | undefined,
): Option.Option<number> => Option.flatMap(Option.fromNullishOr(value), msOf)

const msOrZero = (value: string | number | null | undefined): number =>
  Option.getOrElse(maybeMsOf(value), () => 0)

const textOf = (value: string | null | undefined): Option.Option<string> =>
  Option.fromNullishOr(value)

const memberOfRow = (row: typeof UserRow.Type): Option.Option<Member> =>
  Option.map(S.decodeUnknownOption(MemberId)(row.id), memberId => ({
    memberId,
    maybeEmail: textOf(row.email),
    maybeDisplayName: textOf(row.displayName),
    maybeUsername: textOf(row.username),
    maybeImageUrl: textOf(row.imageURL),
  }))

const membersOf = (
  link:
    | ReadonlyArray<typeof UserRow.Type>
    | typeof UserRow.Type
    | null
    | undefined,
): ReadonlyArray<Member> =>
  Array.getSomes(Array.map(linkedOf(link), memberOfRow))

const priorityOfNumber = (value: number): Option.Option<Priority> =>
  M.value(value).pipe(
    M.withReturnType<Option.Option<Priority>>(),
    M.when(1, () => Option.some('Low')),
    M.when(2, () => Option.some('Medium')),
    M.when(3, () => Option.some('High')),
    M.orElse(() => Option.none()),
  )

/** The number Reminders V3 stores for a priority: 1, 2, or 3. */
export const numberOfPriority = (priority: Priority): number =>
  M.value(priority).pipe(
    M.withReturnType<number>(),
    M.when('Low', () => 1),
    M.when('Medium', () => 2),
    M.when('High', () => 3),
    M.exhaustive,
  )

const roleOfText = (text: string): Option.Option<Role> =>
  M.value(text.toLowerCase()).pipe(
    M.withReturnType<Option.Option<Role>>(),
    M.when('owner', () => Option.some('Owner')),
    M.when('writer', () => Option.some('Writer')),
    M.when('reader', () => Option.some('Reader')),
    M.orElse(() => Option.none()),
  )

/** The word Reminders V3 stores for a role: `owner`, `writer`, or `reader`. */
export const textOfRole = (role: Role): string =>
  M.value(role).pipe(
    M.withReturnType<string>(),
    M.when('Owner', () => 'owner'),
    M.when('Writer', () => 'writer'),
    M.when('Reader', () => 'reader'),
    M.exhaustive,
  )

const colorOf = (maybeColor: string | null | undefined): ListColor =>
  Option.getOrElse(
    Option.flatMap(textOf(maybeColor), color =>
      S.decodeUnknownOption(ListColor)(color.toLowerCase()),
    ),
    () => defaultListColor,
  )

const tagOfRow = (row: unknown): Option.Option<Tag> =>
  Option.flatMap(decodeOne(TagRow, row), tag =>
    Option.flatMap(S.decodeUnknownOption(TagId)(tag.id), tagId =>
      Option.map(S.decodeUnknownOption(TagTitleFromText)(tag.title), title => ({
        tagId,
        title,
      })),
    ),
  )

const dueOf = (
  calendar: DeviceCalendar,
  value: string | number | null | undefined,
): Option.Option<Due> =>
  Option.map(maybeMsOf(value), atMs => ({ ...calendar.localOf(atMs), atMs }))

const reminderOfRow =
  (calendar: DeviceCalendar, listId: ListId) =>
  (
    row: unknown,
  ): Option.Option<
    Readonly<{ reminder: Reminder; tags: ReadonlyArray<Tag> }>
  > =>
    Option.flatMap(decodeOne(ReminderRow, row), reminder =>
      Option.map(S.decodeUnknownOption(ReminderId)(reminder.id), reminderId => {
        const tags = Array.getSomes(
          Array.map(linkedOf(reminder.tags), tagOfRow),
        )
        return {
          reminder: {
            reminderId,
            listId,
            title: reminder.title,
            notes: reminder.notes ?? '',
            isCompleted: reminder.isCompleted ?? false,
            isFlagged: reminder.isFlagged ?? false,
            maybeDue: dueOf(calendar, reminder.dueDate),
            maybePriority: Option.flatMap(
              Option.fromNullishOr(reminder.priority),
              priorityOfNumber,
            ),
            position: reminder.position ?? 0,
            createdAtMs: msOrZero(reminder.createdAt),
            tagIds: Array.map(tags, tag => tag.tagId),
          },
          tags,
        }
      }),
    )

const membershipOfRow = (
  row: unknown,
): Option.Option<
  Readonly<{ membership: Membership; people: ReadonlyArray<Member> }>
> =>
  Option.flatMap(decodeOne(MembershipRow, row), membership => {
    const people = membersOf(membership.user)
    return Option.flatMap(
      S.decodeUnknownOption(MembershipId)(membership.id),
      membershipId =>
        Option.flatMap(roleOfText(membership.role), role =>
          Option.map(Array.head(people), person => ({
            membership: {
              membershipId,
              memberId: person.memberId,
              role,
              acceptedAtMs: msOrZero(membership.acceptedAt),
              maybeRevokedAtMs: maybeMsOf(membership.revokedAt),
            },
            people,
          })),
        ),
    )
  })

const shareOfRow = (
  row: unknown,
): Option.Option<Readonly<{ share: Share; people: ReadonlyArray<Member> }>> =>
  Option.flatMap(decodeOne(ShareRow, row), share => {
    const owners = membersOf(share.owner)
    const memberships = Array.getSomes(
      Array.map(linkedOf(share.memberships), membershipOfRow),
    )
    return Option.flatMap(S.decodeUnknownOption(ShareId)(share.id), shareId =>
      Option.map(Array.head(owners), owner => ({
        share: {
          shareId,
          token: share.token,
          ownerId: owner.memberId,
          createdAtMs: msOrZero(share.createdAt),
          updatedAtMs: msOrZero(share.updatedAt),
          maybeRevokedAtMs: maybeMsOf(share.revokedAt),
          memberships: Array.map(memberships, ({ membership }) => membership),
        },
        people: [
          ...owners,
          ...Array.flatMap(memberships, ({ people }) => people),
        ],
      })),
    )
  })

type DecodedList = Readonly<{
  list: ReminderList
  reminders: ReadonlyArray<Reminder>
  tags: ReadonlyArray<Tag>
  people: ReadonlyArray<Member>
}>

const listOfRow =
  (calendar: DeviceCalendar) =>
  (row: unknown): Option.Option<DecodedList> =>
    Option.flatMap(decodeOne(ListRow, row), list =>
      Option.flatMap(S.decodeUnknownOption(ListId)(list.id), listId => {
        const owners = membersOf(list.owner)
        const readers = membersOf(list.readers)
        const writers = membersOf(list.writers)
        const reminders = Array.getSomes(
          Array.map(linkedOf(list.reminders), reminderOfRow(calendar, listId)),
        )
        const maybeShare = Option.flatMap(
          Array.head(linkedOf(list.share)),
          shareOfRow,
        )
        return Option.map(Array.head(owners), owner => ({
          list: {
            listId,
            title: list.title,
            color: colorOf(list.color),
            maybeCoverFileId: textOf(list.coverFileID),
            position: list.position ?? 0,
            createdAtMs: msOrZero(list.createdAt),
            ownerId: owner.memberId,
            readerIds: Array.map(readers, reader => reader.memberId),
            writerIds: Array.map(writers, writer => writer.memberId),
            maybeShare: Option.map(maybeShare, ({ share }) => share),
          },
          reminders: Array.map(reminders, ({ reminder }) => reminder),
          tags: Array.flatMap(reminders, ({ tags }) => tags),
          people: [
            ...owners,
            ...readers,
            ...writers,
            ...Option.match(maybeShare, {
              onNone: () => [],
              onSome: ({ people }) => people,
            }),
          ],
        }))
      }),
    )

/** Who the store's database says is signed in: their id, and their email. */
export type SignedInUser = Readonly<{
  id: string
  email?: string | null | undefined
}>

/**
 * The board one store query gives, for the person `user` names: every
 * list with an owner, its reminders with their tags and their due dates on
 * the person's calendar, and everyone the lists name. A row that does not
 * decode is left out instead of breaking the board, the way Reminders V3
 * skips what it cannot read.
 *
 * @example
 * ```typescript
 * decodeBoard({ remindersLists: [listRow] }, { id: memberId, email: 'ada@example.com' }, utcCalendar(0))
 * ```
 */
export const decodeBoard = (
  data: unknown,
  user: SignedInUser,
  calendar: DeviceCalendar,
): Option.Option<Board> => {
  const tables = Option.getOrElse(
    decodeOne(RemindersData, data),
    (): typeof RemindersData.Type => ({}),
  )
  const decoded = Array.getSomes(
    Array.map(tables.remindersLists ?? [], listOfRow(calendar)),
  )
  const people = Array.dedupeWith(
    Array.flatMap(decoded, list => list.people),
    (self: Member, that: Member) => self.memberId === that.memberId,
  )
  return Option.map(S.decodeUnknownOption(MemberId)(user.id), memberId => {
    const known = Array.findFirst(
      people,
      person => person.memberId === memberId,
    )
    return {
      member: Option.getOrElse(known, () => ({
        memberId,
        maybeEmail: Option.fromNullishOr(user.email),
        maybeDisplayName: Option.none(),
        maybeUsername: Option.none(),
        maybeImageUrl: Option.none(),
      })),
      lists: Array.map(decoded, ({ list }) => list),
      reminders: Array.flatMap(decoded, ({ reminders }) => reminders),
      tags: Array.dedupeWith(
        Array.flatMap(decoded, ({ tags }) => tags),
        (self: Tag, that: Tag) => self.tagId === that.tagId,
      ),
      people: Array.filter(people, person => person.memberId !== memberId),
    }
  })
}

// WRITE

type TransactionStep = Parameters<ProgramLogDatabase['transact']>[0]

type TransactionSteps = Extract<TransactionStep, ReadonlyArray<unknown>>

type Chunk = TransactionSteps[number]

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : 'the reminders store refused it'

const refused = (reason: string) =>
  Effect.fail(new RemindersStoreError({ reason }))

const entityOf = (database: ProgramLogDatabase, table: string, rowId: string) =>
  Option.match(Option.fromNullishOr(database.tx[table]?.[rowId]), {
    onNone: () => refused(`the reminders store has no ${table} table`),
    onSome: entity => Effect.succeed(entity),
  })

const isoOf = (ms: number): string => new Date(ms).toISOString()

const roleLink = (role: Role): string =>
  M.value(role).pipe(
    M.withReturnType<string>(),
    M.when('Owner', () => 'owner'),
    M.when('Writer', () => 'writers'),
    M.when('Reader', () => 'readers'),
    M.exhaustive,
  )

const sharedRoleText = (role: SharedRole): string => textOfRole(role)

const memberIdOf = (database: ProgramLogDatabase) =>
  Effect.flatMap(
    Effect.tryPromise({
      try: () => database.getAuth(),
      catch: cause => new RemindersStoreError({ reason: reasonOf(cause) }),
    }),
    maybeUser =>
      Option.match(Option.fromNullishOr(maybeUser), {
        onNone: () => refused('sign in to change your reminders'),
        onSome: user => Effect.succeed(user.id),
      }),
  )

const EmailLookup = S.Struct({
  $users: S.optionalKey(S.Array(S.Struct({ id: S.String }))),
})

const userWithEmail = (database: ProgramLogDatabase, email: string) =>
  Effect.flatMap(
    Effect.tryPromise({
      try: () =>
        database.queryOnce({ $users: { $: { where: { email }, limit: 1 } } }),
      catch: cause => new RemindersStoreError({ reason: reasonOf(cause) }),
    }),
    response =>
      Option.match(
        Option.flatMap(decodeOne(EmailLookup, response.data), found =>
          Array.head(found.$users ?? []),
        ),
        {
          onNone: () => refused(`nobody has signed in as ${email} yet`),
          onSome: user => Effect.succeed(user.id),
        },
      ),
  )

/**
 * The transaction steps one write makes, the same rows and links the
 * Reminders V3 Message for it writes: `UpdateCompletion` updates
 * `reminders.isCompleted` as `SetRemindersV3Completion` does, and
 * `InsertList` makes a `remindersLists` row linked to its owner as
 * `CreateRemindersV3List` does. Dates are ISO strings, as the Swift client
 * sends them.
 */
export const stepsOf = (
  database: ProgramLogDatabase,
  calendar: DeviceCalendar,
  memberId: string,
  write: RemindersWrite,
): Effect.Effect<ReadonlyArray<Chunk>, RemindersStoreError> => {
  const nowIso = isoOf(calendar.nowMs())
  const row = (table: string, rowId: string) => entityOf(database, table, rowId)
  return M.value(write).pipe(
    M.withReturnType<
      Effect.Effect<ReadonlyArray<Chunk>, RemindersStoreError>
    >(),
    M.tagsExhaustive({
      InsertList: ({ title, color, position }) =>
        Effect.map(row('remindersLists', id()), list => [
          list
            .update({ title, color, position, createdAt: nowIso })
            .link({ owner: memberId }),
        ]),
      UpdateListTitle: ({ listId, title }) =>
        Effect.map(row('remindersLists', listId), list => [
          list.update({ title }),
        ]),
      UpdateListColor: ({ listId, color }) =>
        Effect.map(row('remindersLists', listId), list => [
          list.update({ color }),
        ]),
      RemoveList: ({ listId }) =>
        Effect.map(row('remindersLists', listId), list => [list.delete()]),
      InsertReminder: ({ listId, title, position, isFlagged, maybeDue }) =>
        Effect.map(row('reminders', id()), reminder => [
          reminder
            .update({
              title,
              notes: '',
              isCompleted: false,
              isFlagged,
              position,
              createdAt: nowIso,
              ...Option.match(maybeDue, {
                onNone: () => ({}),
                onSome: due => ({ dueDate: isoOf(calendar.instantOf(due)) }),
              }),
            })
            .link({ list: listId }),
        ]),
      UpdateReminderTitle: ({ reminderId, title }) =>
        Effect.map(row('reminders', reminderId), reminder => [
          reminder.update({ title }),
        ]),
      UpdateReminderNotes: ({ reminderId, notes }) =>
        Effect.map(row('reminders', reminderId), reminder => [
          reminder.update({ notes }),
        ]),
      UpdateCompletion: ({ reminderId, isCompleted }) =>
        Effect.map(row('reminders', reminderId), reminder => [
          reminder.update({ isCompleted }),
        ]),
      UpdateFlag: ({ reminderId, isFlagged }) =>
        Effect.map(row('reminders', reminderId), reminder => [
          reminder.update({ isFlagged }),
        ]),
      UpdateDue: ({ reminderId, maybeDue }) =>
        Effect.map(row('reminders', reminderId), reminder => [
          reminder.update({
            dueDate: Option.match(maybeDue, {
              onNone: () => null,
              onSome: due => isoOf(calendar.instantOf(due)),
            }),
          }),
        ]),
      UpdatePriority: ({ reminderId, maybePriority }) =>
        Effect.map(row('reminders', reminderId), reminder => [
          reminder.update({
            priority: Option.match(maybePriority, {
              onNone: () => null,
              onSome: numberOfPriority,
            }),
          }),
        ]),
      RelinkReminder: ({ reminderId, fromListId, toListId, position }) =>
        Effect.map(row('reminders', reminderId), reminder => [
          reminder
            .update({ position })
            .unlink({ list: fromListId })
            .link({ list: toListId }),
        ]),
      RemoveReminders: ({ reminderIds }) =>
        Effect.forEach(reminderIds, reminderId =>
          Effect.map(row('reminders', reminderId), reminder =>
            reminder.delete(),
          ),
        ),
      LinkTag: ({ reminderId, title, maybeTagId }) =>
        Option.match(maybeTagId, {
          onSome: tagId =>
            Effect.map(row('reminders', reminderId), reminder => [
              reminder.link({ tags: tagId }),
            ]),
          onNone: () => {
            const tagId = id()
            return Effect.flatMap(row('tags', tagId), tag =>
              Effect.map(row('reminders', reminderId), reminder => [
                tag.update({ title }),
                reminder.link({ tags: tagId }),
              ]),
            )
          },
        }),
      UnlinkTag: ({ reminderId, tagId }) =>
        Effect.map(row('reminders', reminderId), reminder => [
          reminder.unlink({ tags: tagId }),
        ]),
      RemoveTag: ({ tagId }) =>
        Effect.map(row('tags', tagId), tag => [tag.delete()]),
      InsertShare: ({ listId }) => {
        const shareId = id()
        const membershipId = id()
        return Effect.flatMap(row('v3_shares', shareId), share =>
          Effect.map(row('v3_share_memberships', membershipId), membership => [
            share
              .update({
                token: id(),
                rootNamespace: 'remindersLists',
                rootID: listId,
                createdAt: nowIso,
                updatedAt: nowIso,
              })
              .link({ owner: memberId, root: listId }),
            membership
              .update({ role: textOfRole('Owner'), acceptedAt: nowIso })
              .link({ share: shareId, user: memberId }),
          ]),
        )
      },
      InsertMembership: ({ listId, shareId, email, role }) =>
        Effect.flatMap(userWithEmail(database, email), userId => {
          const membershipId = id()
          return Effect.all([
            row('v3_share_memberships', membershipId),
            row('remindersLists', listId),
            row('v3_shares', shareId),
          ]).pipe(
            Effect.map(([membership, list, share]) => [
              membership
                .update({ role: sharedRoleText(role), acceptedAt: nowIso })
                .link({ share: shareId, user: userId }),
              list.link({ [roleLink(role)]: userId }),
              share.update({ updatedAt: nowIso }),
            ]),
          )
        }),
      UpdateMembershipRole: ({
        listId,
        shareId,
        membershipId,
        memberId: sharedWith,
        from,
        to,
      }) =>
        Effect.all([
          row('remindersLists', listId),
          row('v3_share_memberships', membershipId),
          row('v3_shares', shareId),
        ]).pipe(
          Effect.map(([list, membership, share]) => [
            list
              .unlink({ [roleLink(from)]: sharedWith })
              .link({ [roleLink(to)]: sharedWith }),
            membership.update({ role: sharedRoleText(to), revokedAt: null }),
            share.update({ updatedAt: nowIso }),
          ]),
        ),
      RevokeMembership: ({
        listId,
        shareId,
        membershipId,
        memberId: sharedWith,
        role,
      }) =>
        Effect.all([
          row('remindersLists', listId),
          row('v3_share_memberships', membershipId),
          row('v3_shares', shareId),
        ]).pipe(
          Effect.map(([list, membership, share]) => [
            list.unlink({ [roleLink(role)]: sharedWith }),
            membership.update({ revokedAt: nowIso }),
            share.update({ updatedAt: nowIso }),
          ]),
        ),
    }),
  )
}

// STORE

type QueryResponse = Readonly<{ error?: unknown; data?: unknown }>

type AuthResponse = Readonly<{
  user?: SignedInUser | null | undefined
  error?: unknown
}>

/**
 * The reminders store on an Instant app with the Reminders V3 schema: the
 * board is one bounded query, sent again on every change from any device
 * and from the Swift app, and each write is one transaction as the
 * signed-in person. The app's rules decide what they see: their own lists
 * and the ones shared with them.
 *
 * @example
 * ```typescript
 * Layer.effect(RemindersStore, makeInstantRemindersStore(database))
 * ```
 */
export const makeInstantRemindersStore = (
  database: ProgramLogDatabase,
  calendar: DeviceCalendar = hostCalendar,
) =>
  Effect.map(
    Effect.all([
      Ref.make(Option.none<SignedInUser>()),
      Ref.make(Option.none<unknown>()),
    ]),
    ([signedIn, latestData]) => {
      const board = Stream.callback<Option.Option<Board>, RemindersStoreError>(
        queue =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const offerLatest = (): void => {
                const maybeUser = Effect.runSync(Ref.get(signedIn))
                const maybeData = Effect.runSync(Ref.get(latestData))
                if (Option.isNone(maybeUser)) {
                  Queue.offerUnsafe(queue, Option.none())
                } else if (Option.isSome(maybeData)) {
                  Queue.offerUnsafe(
                    queue,
                    decodeBoard(maybeData.value, maybeUser.value, calendar),
                  )
                }
              }
              const unsubscribeAuth = database.subscribeAuth(
                (auth: AuthResponse) => {
                  Effect.runSync(
                    Ref.set(signedIn, Option.fromNullishOr(auth.user)),
                  )
                  offerLatest()
                },
              )
              const unsubscribeQuery = database.subscribeQuery(
                remindersQuery,
                (response: QueryResponse) => {
                  if (response.error === undefined) {
                    Effect.runSync(
                      Ref.set(latestData, Option.some(response.data)),
                    )
                    offerLatest()
                  } else {
                    Queue.failCauseUnsafe(
                      queue,
                      Cause.fail(
                        new RemindersStoreError({
                          reason: 'your reminders could not be read',
                        }),
                      ),
                    )
                  }
                },
              )
              return () => {
                unsubscribeQuery()
                unsubscribeAuth()
              }
            }),
            unsubscribe => Effect.sync(unsubscribe),
          ),
      )

      const write = (remindersWrite: RemindersWrite) =>
        Effect.gen(function* () {
          const memberId = yield* memberIdOf(database)
          const steps = yield* stepsOf(
            database,
            calendar,
            memberId,
            remindersWrite,
          )
          yield* Effect.tryPromise({
            try: () => database.transact([...steps]),
            catch: cause =>
              new RemindersStoreError({ reason: reasonOf(cause) }),
          })
        })

      return RemindersStore.of({ board, write })
    },
  )
