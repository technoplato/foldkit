import { Array, Effect, Exit, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import type { ProgramLogDatabase } from '@foldkit/instant/browser'
import { getOps, tx } from '@instantdb/core'

import { ListColor } from './board.js'
import { LocalDay, LocalTime, utcCalendar } from './calendar.js'
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
import {
  decodeBoard,
  makeInstantRemindersStore,
  stepsOf,
} from './instantStore.js'
import {
  InsertList,
  InsertMembership,
  InsertReminder,
  InsertShare,
  LinkTag,
  RelinkReminder,
  RemindersStore,
  RevokeMembership,
  UpdateCompletion,
  UpdateDue,
  UpdateMembershipRole,
  UpdatePriority,
} from './store.js'

const owner = '00000000-0000-4000-8001-000000000001'
const reader = '00000000-0000-4000-8001-000000000002'
const listId = '00000000-0000-4000-8000-000000000401'
const reminderId = '00000000-0000-4000-8000-000000000402'
const shareId = '00000000-0000-4000-8000-000000000403'
const ownerMembershipId = '00000000-0000-4000-8000-000000000404'
const readerMembershipId = '00000000-0000-4000-8000-000000000405'
const swiftTagId = '00000000-0000-4000-8000-000000000407'

const swiftList = {
  id: listId,
  title: 'Family',
  color: '#4A99EF',
  position: 0,
  createdAt: '2023-11-14T22:13:20.000Z',
  owner: [
    { id: owner, email: 'owner@example.com', displayName: 'Swift Owner' },
  ],
  readers: [{ id: reader, email: 'reader@example.com' }],
  writers: [],
  reminders: [
    {
      id: reminderId,
      title: 'Pack lunch',
      notes: 'Fruit and water',
      isCompleted: false,
      isFlagged: true,
      dueDate: '2023-11-15T22:13:20.000Z',
      priority: 3,
      position: 0,
      createdAt: '2023-11-14T22:13:21.000Z',
      tags: [{ id: swiftTagId, title: 'swift' }],
    },
    { id: 'not-a-uuid', title: 'Skipped' },
  ],
  share: [
    {
      id: shareId,
      token: 'reminders-v3-token',
      rootNamespace: 'remindersLists',
      rootID: listId,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      owner: { id: owner },
      memberships: [
        {
          id: ownerMembershipId,
          role: 'owner',
          acceptedAt: '2023-11-14T22:13:20.000Z',
          user: [{ id: owner }],
        },
        {
          id: readerMembershipId,
          role: 'reader',
          acceptedAt: '2023-11-14T22:13:20.000Z',
          revokedAt: null,
          user: [{ id: reader, email: 'reader@example.com' }],
        },
      ],
    },
  ],
}

const calendar = utcCalendar(Date.parse('2023-11-15T08:00:00.000Z'))

describe('decodeBoard', () => {
  it('reads the graph the Swift app writes: list, roles, reminder, tags, and share', () => {
    const maybeBoard = decodeBoard(
      { remindersLists: [swiftList, { id: 'broken' }] },
      { id: owner, email: 'owner@example.com' },
      calendar,
    )
    const board = Option.getOrThrow(maybeBoard)
    expect(board.member.maybeDisplayName).toEqual(Option.some('Swift Owner'))
    expect(Array.map(board.lists, list => list.listId)).toEqual([listId])
    const [list] = board.lists
    expect(list?.color).toBe('#4a99ef')
    expect(list?.readerIds).toEqual([reader])
    expect(
      Option.map(list?.maybeShare ?? Option.none(), share =>
        Array.map(share.memberships, membership => membership.role),
      ),
    ).toEqual(Option.some(['Owner', 'Reader']))
    expect(Array.map(board.reminders, reminder => reminder.title)).toEqual([
      'Pack lunch',
    ])
    const [reminder] = board.reminders
    expect(reminder?.maybePriority).toEqual(Option.some('High'))
    expect(reminder?.maybeDue).toEqual(
      Option.some({
        day: '2023-11-15',
        time: '22:13',
        atMs: Date.parse('2023-11-15T22:13:20.000Z'),
      }),
    )
    expect(Array.map(board.tags, tag => tag.title)).toEqual(['swift'])
    expect(Array.map(board.people, person => person.memberId)).toEqual([reader])
  })

  it('takes a has-one link as one object or a list, and missing fields as their V3 defaults', () => {
    const board = Option.getOrThrow(
      decodeBoard(
        {
          remindersLists: [
            {
              id: listId,
              title: 'Bare',
              owner: { id: owner },
              reminders: [{ id: reminderId, title: 'Only a title' }],
            },
          ],
        },
        { id: owner },
        calendar,
      ),
    )
    expect(board.lists[0]?.color).toBe('#4a99ef')
    expect(board.reminders[0]).toEqual(
      expect.objectContaining({
        notes: '',
        isCompleted: false,
        isFlagged: false,
        maybeDue: Option.none(),
        maybePriority: Option.none(),
      }),
    )
  })

  it('reads nobody signed in as no board', () => {
    expect(decodeBoard({}, { id: '' }, calendar)).toEqual(Option.none())
  })
})

type Query = Readonly<Record<string, unknown>>

type Chunk = Parameters<typeof getOps>[0]

const fakeDatabase = (usersByEmail: Readonly<Record<string, string>> = {}) => {
  const transacted: Array<ReadonlyArray<Chunk>> = []
  const database = {
    tx,
    getAuth: () => Promise.resolve({ id: owner, email: 'owner@example.com' }),
    queryOnce: (query: Query) => {
      const where = JSON.stringify(query)
      const email = Option.getOrElse(
        Array.findFirst(Object.keys(usersByEmail), candidate =>
          where.includes(candidate),
        ),
        () => '',
      )
      const userId = usersByEmail[email]
      return Promise.resolve({
        data: { $users: userId === undefined ? [] : [{ id: userId }] },
      })
    },
    transact: (chunks: ReadonlyArray<Chunk>) => {
      transacted.push(chunks)
      return Promise.resolve({ status: 'synced', clientId: 'test' })
    },
    subscribeAuth: () => () => {},
    subscribeQuery: () => () => {},
  }
  return {
    transacted,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    database: database as unknown as ProgramLogDatabase,
  }
}

const opsOf = (
  write: Parameters<typeof stepsOf>[3],
  usersByEmail: Readonly<Record<string, string>> = {},
) =>
  Effect.runPromise(
    Effect.map(
      stepsOf(fakeDatabase(usersByEmail).database, calendar, owner, write),
      chunks => Array.flatMap(chunks, chunk => getOps(chunk)),
    ),
  )

const anyId = expect.stringMatching(/^[0-9a-f-]{36}$/)

describe('stepsOf', () => {
  it('inserts a list the way CreateRemindersV3List does: fields, ISO date, and owner link', async () => {
    expect(
      await opsOf(
        InsertList({
          title: ListTitle.make('Groceries'),
          color: ListColor.make('#34c759'),
          position: 2,
        }),
      ),
    ).toEqual([
      [
        'update',
        'remindersLists',
        anyId,
        {
          title: 'Groceries',
          color: '#34c759',
          position: 2,
          createdAt: '2023-11-15T08:00:00.000Z',
        },
      ],
      ['link', 'remindersLists', anyId, { owner }],
    ])
  })

  it('inserts a reminder the way CreateRemindersV3Reminder does, linked to its list', async () => {
    expect(
      await opsOf(
        InsertReminder({
          listId: ListId.make(listId),
          title: ReminderTitle.make('Oat milk'),
          position: 4,
          isFlagged: true,
          maybeDue: Option.some({
            day: LocalDay.make('2023-11-16'),
            time: LocalTime.make('09:00'),
          }),
        }),
      ),
    ).toEqual([
      [
        'update',
        'reminders',
        anyId,
        {
          title: 'Oat milk',
          notes: '',
          isCompleted: false,
          isFlagged: true,
          position: 4,
          createdAt: '2023-11-15T08:00:00.000Z',
          dueDate: '2023-11-16T09:00:00.000Z',
        },
      ],
      ['link', 'reminders', anyId, { list: listId }],
    ])
  })

  it('writes completion, due date, and priority as the V3 attributes and values', async () => {
    const id = ReminderId.make(reminderId)
    expect(
      await opsOf(UpdateCompletion({ reminderId: id, isCompleted: true })),
    ).toEqual([['update', 'reminders', reminderId, { isCompleted: true }]])
    expect(
      await opsOf(UpdateDue({ reminderId: id, maybeDue: Option.none() })),
    ).toEqual([['update', 'reminders', reminderId, { dueDate: null }]])
    expect(
      await opsOf(
        UpdatePriority({
          reminderId: id,
          maybePriority: Option.some('Medium'),
        }),
      ),
    ).toEqual([['update', 'reminders', reminderId, { priority: 2 }]])
  })

  it('moves a reminder by unlinking its old list and linking the new one', async () => {
    const toListId = '00000000-0000-4000-8000-000000000499'
    expect(
      await opsOf(
        RelinkReminder({
          reminderId: ReminderId.make(reminderId),
          fromListId: ListId.make(listId),
          toListId: ListId.make(toListId),
          position: 0,
        }),
      ),
    ).toEqual([
      ['update', 'reminders', reminderId, { position: 0 }],
      ['unlink', 'reminders', reminderId, { list: listId }],
      ['link', 'reminders', reminderId, { list: toListId }],
    ])
  })

  it('links a tag the person can see, or makes a new one first', async () => {
    const id = ReminderId.make(reminderId)
    expect(
      await opsOf(
        LinkTag({
          reminderId: id,
          title: TagTitle.make('swift'),
          maybeTagId: Option.some(TagId.make(swiftTagId)),
        }),
      ),
    ).toEqual([['link', 'reminders', reminderId, { tags: swiftTagId }]])
    expect(
      await opsOf(
        LinkTag({
          reminderId: id,
          title: TagTitle.make('errands'),
          maybeTagId: Option.none(),
        }),
      ),
    ).toEqual([
      ['update', 'tags', anyId, { title: 'errands' }],
      ['link', 'reminders', reminderId, { tags: anyId }],
    ])
  })

  it('shares a list the way CreateRemindersV3Share and AcceptRemindersV3Share do', async () => {
    expect(await opsOf(InsertShare({ listId: ListId.make(listId) }))).toEqual([
      [
        'update',
        'v3_shares',
        anyId,
        {
          token: anyId,
          rootNamespace: 'remindersLists',
          rootID: listId,
          createdAt: '2023-11-15T08:00:00.000Z',
          updatedAt: '2023-11-15T08:00:00.000Z',
        },
      ],
      ['link', 'v3_shares', anyId, { owner, root: listId }],
      [
        'update',
        'v3_share_memberships',
        anyId,
        { role: 'owner', acceptedAt: '2023-11-15T08:00:00.000Z' },
      ],
      ['link', 'v3_share_memberships', anyId, { share: anyId, user: owner }],
    ])
    expect(
      await opsOf(
        InsertMembership({
          listId: ListId.make(listId),
          shareId: ShareId.make(shareId),
          email: EmailAddress.make('reader@example.com'),
          role: 'Reader',
        }),
        { 'reader@example.com': reader },
      ),
    ).toEqual([
      [
        'update',
        'v3_share_memberships',
        anyId,
        { role: 'reader', acceptedAt: '2023-11-15T08:00:00.000Z' },
      ],
      ['link', 'v3_share_memberships', anyId, { share: shareId, user: reader }],
      ['link', 'remindersLists', listId, { readers: reader }],
      [
        'update',
        'v3_shares',
        shareId,
        { updatedAt: '2023-11-15T08:00:00.000Z' },
      ],
    ])
  })

  it('changes and revokes a role the way ChangeRemindersV3ShareRole and RevokeRemindersV3Share do', async () => {
    const shared = {
      listId: ListId.make(listId),
      shareId: ShareId.make(shareId),
      membershipId: MembershipId.make(readerMembershipId),
      memberId: MemberId.make(reader),
    }
    expect(
      await opsOf(
        UpdateMembershipRole({ ...shared, from: 'Reader', to: 'Writer' }),
      ),
    ).toEqual([
      ['unlink', 'remindersLists', listId, { readers: reader }],
      ['link', 'remindersLists', listId, { writers: reader }],
      [
        'update',
        'v3_share_memberships',
        readerMembershipId,
        { role: 'writer', revokedAt: null },
      ],
      [
        'update',
        'v3_shares',
        shareId,
        { updatedAt: '2023-11-15T08:00:00.000Z' },
      ],
    ])
    expect(
      await opsOf(RevokeMembership({ ...shared, role: 'Writer' })),
    ).toEqual([
      ['unlink', 'remindersLists', listId, { writers: reader }],
      [
        'update',
        'v3_share_memberships',
        readerMembershipId,
        { revokedAt: '2023-11-15T08:00:00.000Z' },
      ],
      [
        'update',
        'v3_shares',
        shareId,
        { updatedAt: '2023-11-15T08:00:00.000Z' },
      ],
    ])
  })

  it('refuses to share with an email nobody signed in with', async () => {
    const exit = await Effect.runPromiseExit(
      stepsOf(
        fakeDatabase().database,
        calendar,
        owner,
        InsertMembership({
          listId: ListId.make(listId),
          shareId: ShareId.make(shareId),
          email: EmailAddress.make('nobody@example.com'),
          role: 'Reader',
        }),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

describe('makeInstantRemindersStore', () => {
  it('writes one transaction per change, as the signed-in member', async () => {
    const { database, transacted } = fakeDatabase()
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeInstantRemindersStore(database, calendar)
        yield* store.write(
          UpdateCompletion({
            reminderId: ReminderId.make(reminderId),
            isCompleted: true,
          }),
        )
        return RemindersStore.of(store)
      }),
    )
    expect(
      Array.map(transacted, chunks =>
        Array.flatMap(chunks, chunk => getOps(chunk)),
      ),
    ).toEqual([[['update', 'reminders', reminderId, { isCompleted: true }]]])
  })
})
