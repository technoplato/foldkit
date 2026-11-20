import { Cause, Effect, Exit } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { SignedInUserProgramSnapshotPermissions } from '../snapshotLog/snapshotLog.js'
import { Instant } from '../sync/instant.js'
import {
  type ProgramLogDatabase,
  makePinnedOwnerController,
} from './core.js'
import {
  hasOwnProgramMessageQuery,
  makeInstantSharedSnapshotHooks,
  programSnapshotRingQuery,
  sharedSnapshotSlotId,
} from './sharedSnapshot.js'

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('sharedSnapshotSlotId', () => {
  it('derives deterministic RFC 4122 v4 UUIDs unique across scope, revision, and slot', () => {
    const base = {
      app: 'books',
      room: 'public',
      ownerUserID: 'member-1',
      programVersion: 1,
      foldRevision: 'fold-v1',
      slot: 0,
    }
    const id0 = sharedSnapshotSlotId(base)
    const id0Again = sharedSnapshotSlotId(base)
    const id1 = sharedSnapshotSlotId({ ...base, slot: 1 })
    const otherOwner = sharedSnapshotSlotId({ ...base, ownerUserID: 'member-2' })
    const otherRevision = sharedSnapshotSlotId({
      ...base,
      foldRevision: 'fold-v2',
    })

    expect(id0).toBe(id0Again)
    expect(id0).toMatch(uuidV4Pattern)
    expect(id1).toMatch(uuidV4Pattern)
    expect(new Set([id0, id1, otherOwner, otherRevision]).size).toBe(4)
  })
})

describe('makeInstantSharedSnapshotHooks', () => {
  it('omits shared snapshot hooks for open Anyone rooms and enables them for SignedInUser rooms', () => {
    const fakeDb = {
      getAuth: () => Promise.resolve({ id: 'member-1' }),
      queryOnce: () => Promise.resolve({ data: {} }),
      subscribeQuery: () => () => {},
      subscribeConnectionStatus: () => () => {},
      tx: {},
      transact: () => Promise.resolve({ status: 'synced', clientId: 'c1' }),
    } as unknown as ProgramLogDatabase

    const openEngine = Instant({
      app: { id: 'app-1' },
      processor: Processor.Host.React(),
      instance: 'abc',
      database: fakeDb,
      programLog: 'multiple-counters',
      owner: 'Anyone',
    })
    expect(openEngine.readSharedSnapshots).toBeUndefined()
    expect(openEngine.writeSharedSnapshot).toBeUndefined()
    expect(openEngine.hasOwnRows).toBeUndefined()

    const ownedEngine = Instant({
      app: { id: 'app-1' },
      processor: Processor.Host.React(),
      instance: 'abc',
      database: fakeDb,
      programLog: 'books',
      owner: 'SignedInUser',
    })
    expect(ownedEngine.readSharedSnapshots).toBeDefined()
    expect(ownedEngine.writeSharedSnapshot).toBeDefined()
    expect(ownedEngine.hasOwnRows).toBeDefined()
  })

  it('queries hasOwnRows and programSnapshot ring scoped by ownerUserID, writes deterministic slot UUIDs, and fails terminally on auth switch', async () => {
    let currentUser: { id: string } | null = { id: 'member-7' }
    const queries: Array<unknown> = []
    const written: Array<Readonly<{ id: string; fields: Record<string, unknown> }>> = []

    const fakeDb = {
      getAuth: () => Promise.resolve(currentUser),
      queryOnce: (query: unknown) => {
        queries.push(query)
        const q = query as Record<string, unknown>
        if ('programMessage' in q) {
          return Promise.resolve({ data: { programMessage: [] } })
        }
        return Promise.resolve({
          data: {
            programSnapshot: [
              {
                slot: 2,
                programVersion: 1,
                foldRevision: 'fold-v1',
                count: 100,
                writtenBy: 'peer-1',
                writtenAtMs: 5000,
                payload: '{"mock":true}',
              },
            ],
          },
        })
      },
      tx: {
        programSnapshot: new Proxy(
          {},
          {
            get: (_target, id) => ({
              update: (fields: Record<string, unknown>) => ({
                id: String(id),
                fields,
              }),
            }),
          },
        ),
      },
      transact: (
        chunks: ReadonlyArray<Readonly<{ id: string; fields: Record<string, unknown> }>>,
      ) => {
        written.push(...chunks)
        return Promise.resolve({ status: 'synced', clientId: 'c1' })
      },
    } as unknown as ProgramLogDatabase

    const pinned = makePinnedOwnerController(fakeDb, 'SignedInUser')
    const hooks = makeInstantSharedSnapshotHooks(
      fakeDb,
      'books',
      'public',
      'react-abc',
      'SignedInUser',
      pinned,
    )

    const hasOwn = await Effect.runPromise(hooks.hasOwnRows!)
    expect(hasOwn).toBe(false)
    expect(queries[0]).toEqual(
      hasOwnProgramMessageQuery('books', 'react-abc', 'member-7'),
    )

    const ring = await Effect.runPromise(
      hooks.readSharedSnapshots!({ programVersion: 1, foldRevision: 'fold-v1' }),
    )
    expect(queries[1]).toEqual(
      programSnapshotRingQuery('books', 'public', 1, 'fold-v1', 'member-7'),
    )
    expect(ring).toEqual([
      {
        slot: 2,
        programVersion: 1,
        foldRevision: 'fold-v1',
        count: 100,
        writtenBy: 'peer-1',
        writtenAtMs: 5000,
        payload: '{"mock":true}',
      },
    ])

    await Effect.runPromise(
      hooks.writeSharedSnapshot!({
        slot: 3,
        programVersion: 1,
        foldRevision: 'fold-v1',
        count: 150,
        writtenBy: 'react-abc',
        writtenAtMs: 6000,
        payload: '{"ok":1}',
      }),
    )
    const expectedSlotId = sharedSnapshotSlotId({
      app: 'books',
      room: 'public',
      ownerUserID: 'member-7',
      programVersion: 1,
      foldRevision: 'fold-v1',
      slot: 3,
    })
    expect(written).toEqual([
      {
        id: expectedSlotId,
        fields: {
          app: 'books',
          room: 'public',
          programVersion: 1,
          foldRevision: 'fold-v1',
          ownerUserID: 'member-7',
          slot: 3,
          count: 150,
          writtenBy: 'react-abc',
          writtenAtMs: 6000,
          payload: '{"ok":1}',
        },
      },
    ])

    // Switch user -> writeSharedSnapshot fails terminally with AuthChanged.
    currentUser = { id: 'member-8' }
    const exit = await Effect.runPromiseExit(
      hooks.writeSharedSnapshot!({
        slot: 0,
        programVersion: 1,
        foldRevision: 'fold-v1',
        count: 200,
        writtenBy: 'react-abc',
        writtenAtMs: 7000,
        payload: '{"ok":2}',
      }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause)
      expect(error).toBeInstanceOf(Runtime.SyncTransportError)
      if (error instanceof Runtime.SyncTransportError) {
        expect(error.operation).toBe('AuthChanged')
        expect(error.isTerminal).toBe(true)
      }
    }
  })

  it('defines SignedInUser monotonic non-deletable permission rules for programSnapshot', () => {
    expect(SignedInUserProgramSnapshotPermissions.allow.delete).toBe('false')
    expect(SignedInUserProgramSnapshotPermissions.allow.view).toContain(
      'auth.id == data.ownerUserID',
    )
    expect(SignedInUserProgramSnapshotPermissions.allow.update).toContain(
      'newData.count >= data.count',
    )
    expect(SignedInUserProgramSnapshotPermissions.allow.update).toContain(
      'auth.id == newData.ownerUserID',
    )
  })
})
