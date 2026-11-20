import { Cause, Deferred, Effect, Exit, Fiber, Option, Stream } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  ProgramLogAuthChangedError,
  type ProgramLogDatabase,
  makeInstantCoreProgramLogTransport,
  makePinnedOwnerController,
} from './core.js'
import { Instant } from '../sync/instant.js'
import {
  programLogPageQuery,
  programLogQuery,
  programLogRecentQuery,
} from './programLog.js'

type Written = Readonly<Record<string, unknown>>

const fakeDatabase = (maybeUserId: string | undefined) => {
  const written: Array<Written> = []
  const database = {
    getAuth: () =>
      Promise.resolve(maybeUserId === undefined ? null : { id: maybeUserId }),
    tx: {
      programMessage: new Proxy(
        {},
        {
          get: (_target, id) => ({
            update: (fields: Written) => ({ id, fields }),
          }),
        },
      ),
    },
    transact: (chunks: ReadonlyArray<Readonly<{ fields: Written }>>) => {
      chunks.forEach(chunk => {
        written.push(chunk.fields)
      })
      return Promise.resolve({ status: 'synced', clientId: 'c1' })
    },
  }
  return {
    written,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    database: database as unknown as ProgramLogDatabase,
  }
}

const write = {
  message: {
    id: 'row-1',
    tag: 'Play:{"slug":"the-lantern-keeper"}',
    programVersion: 1,
    from: 'react-4f2a9c1e',
    createdAtMs: 1,
  },
  snapshot: { id: 'books', value: 0, asOf: '', at: 0 },
}

describe('makeInstantCoreProgramLogTransport', () => {
  it('names the signed-in member as each row owner when asked', async () => {
    const { database, written } = fakeDatabase('member-7')
    const transport = makeInstantCoreProgramLogTransport(database, 'books', {
      owner: 'SignedInUser',
    })
    await Effect.runPromise(transport.write(write))
    expect(written).toEqual([
      expect.objectContaining({
        app: 'books',
        tag: 'Play',
        payload: { slug: 'the-lantern-keeper' },
        ownerUserID: 'member-7',
      }),
    ])
  })

  it('writes no owner for an open log, and refuses an owned one with no sign-in', async () => {
    const open = fakeDatabase(undefined)
    await Effect.runPromise(
      makeInstantCoreProgramLogTransport(open.database, 'books').write(write),
    )
    expect(Object.keys(open.written[0] ?? {})).not.toContain('ownerUserID')
    const owned = fakeDatabase(undefined)
    const exit = await Effect.runPromiseExit(
      makeInstantCoreProgramLogTransport(owned.database, 'books', {
        owner: 'SignedInUser',
      }).write(write),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(owned.written).toEqual([])
  })

  it('reaches an owned log through Instant options, with no transport to build', async () => {
    const { database, written } = fakeDatabase('member-7')
    const engine = Instant({
      app: { id: 'app' },
      processor: Processor.Host.Foldkit(),
      instance: 'one',
      database,
      programLog: 'books',
      owner: 'SignedInUser',
    })
    await Effect.runPromise(engine.write(write))
    expect(written).toEqual([
      expect.objectContaining({ app: 'books', ownerUserID: 'member-7' }),
    ])
  })

  it('pins the signed-in owner, includes ownerUserID in queries, and fails terminally when auth switches or signs out', async () => {
    let currentUser: { id: string } | null = { id: 'member-7' }
    let shouldThrowAuth = false
    const authListeners = new Set<(state: { user?: { id: string } | null }) => void>()
    const queries: Array<unknown> = []

    const database = {
      getAuth: () =>
        shouldThrowAuth
          ? Promise.reject(new Error('transient storage read error'))
          : Promise.resolve(currentUser),
      subscribeAuth: (
        listener: (state: { user?: { id: string } | null }) => void,
      ) => {
        authListeners.add(listener)
        return () => {
          authListeners.delete(listener)
        }
      },
      queryOnce: (query: unknown) => {
        queries.push(query)
        return Promise.resolve({ data: { programMessage: [] } })
      },
      subscribeQuery: () => () => {},
      tx: {
        programMessage: new Proxy(
          {},
          {
            get: (_target, id) => ({
              update: (fields: Written) => ({ id, fields }),
            }),
          },
        ),
      },
      transact: () => Promise.resolve({ status: 'synced', clientId: 'c1' }),
    } as unknown as ProgramLogDatabase

    const pinned = makePinnedOwnerController(database, 'SignedInUser')
    const transport = makeInstantCoreProgramLogTransport(database, 'books', {
      owner: 'SignedInUser',
      pinnedOwner: pinned,
    })

    // First read pins member-7 and filters the Instant query by ownerUserID.
    await Effect.runPromise(transport.readSince(Option.none()))
    expect(queries[0]).toEqual(programLogPageQuery('books', 0, 'member-7'))
    expect(programLogQuery('books', 'member-7')).toEqual({
      programMessage: {
        $: {
          where: { app: 'books', ownerUserID: 'member-7' },
        },
      },
    })
    expect(programLogRecentQuery('books', 'member-7')).toEqual({
      programMessage: {
        $: {
          where: { app: 'books', ownerUserID: 'member-7' },
          order: { serverCreatedAt: 'desc' },
          limit: 100,
        },
      },
    })

    // Transient getAuth() throw does NOT mark owner revoked.
    shouldThrowAuth = true
    expect(await pinned.isPinnedForSave()).toBe(true)
    shouldThrowAuth = false
    expect(await pinned.isPinnedForSave()).toBe(true)

    // Watch auth changes: switching to member-8 fires the revocation callback.
    const reasons: Array<string> = []
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* pinned.watchAuthChanged(reason => {
            reasons.push(reason)
          })
          currentUser = { id: 'member-8' }
          for (const listener of authListeners) {
            listener({ user: currentUser })
          }
        }),
      ),
    )
    expect(reasons.length).toBe(1)
    expect(await pinned.isPinnedForSave()).toBe(false)

    // Subsequent write fails terminally with ProgramLogAuthChangedError (and maps to terminal SyncTransportError).
    const writeExit = await Effect.runPromiseExit(transport.write(write))
    expect(Exit.isFailure(writeExit)).toBe(true)
    if (Exit.isFailure(writeExit)) {
      const error = Cause.squash(writeExit.cause) as { cause?: unknown }
      expect(error.cause).toBeInstanceOf(ProgramLogAuthChangedError)
    }

    const engine = Instant({
      app: { id: 'app' },
      processor: Processor.Host.Foldkit(),
      instance: 'one',
      database,
      programLog: 'books',
      owner: 'SignedInUser',
    })
    // Pin member-8 on a fresh engine, then sign out (null).
    await Effect.runPromise(engine.readSince(Option.none()))
    currentUser = null
    const engineExit = await Effect.runPromiseExit(engine.write(write))
    expect(Exit.isFailure(engineExit)).toBe(true)
    if (Exit.isFailure(engineExit)) {
      const error = Cause.squash(engineExit.cause)
      expect(error).toBeInstanceOf(Runtime.SyncTransportError)
      if (error instanceof Runtime.SyncTransportError) {
        expect(error.operation).toBe('AuthChanged')
        expect(error.isTerminal).toBe(true)
      }
    }
  })

  it('filters in-flight pending writes out of readSince cursor offsets and live observe echoes', async () => {
    const releaseTransact = await Effect.runPromise(Deferred.make<void>())
    const observed: Array<string> = []
    let queryListener:
      | ((result: {
          data?: { programMessage?: ReadonlyArray<Record<string, unknown>> }
        }) => void)
      | undefined

    const confirmedRow = {
      id: 'confirmed-1',
      app: 'books',
      tag: 'Play',
      payload: { slug: 'a' },
      programVersion: 1,
      from: 'peer-1',
      createdAtMs: 1,
    }
    const optimisticRow = {
      id: 'pending-2',
      app: 'books',
      tag: 'Play',
      payload: { slug: 'b' },
      programVersion: 1,
      from: 'react-1',
      createdAtMs: 2,
    }

    const database = {
      getAuth: () => Promise.resolve(null),
      queryOnce: () =>
        Promise.resolve({
          data: { programMessage: [confirmedRow, optimisticRow] },
        }),
      subscribeQuery: (
        _query: unknown,
        listener: (result: {
          data?: { programMessage?: ReadonlyArray<Record<string, unknown>> }
        }) => void,
      ) => {
        queryListener = listener
        return () => {
          queryListener = undefined
        }
      },
      tx: {
        programMessage: new Proxy(
          {},
          {
            get: (_target, id) => ({
              update: (fields: Written) => ({ id, fields }),
            }),
          },
        ),
      },
      transact: () =>
        Effect.runPromise(Deferred.await(releaseTransact)).then(() => ({
          status: 'synced',
          clientId: 'c1',
        })),
    } as unknown as ProgramLogDatabase

    const transport = makeInstantCoreProgramLogTransport(database, 'books')

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* transport.subscribe.pipe(
            Stream.runForEach(snapshot =>
              Effect.sync(() => {
                for (const message of snapshot.messages) {
                  observed.push(message.id)
                }
              }),
            ),
            Effect.forkScoped,
          )
          yield* Effect.sleep('10 millis')

          // Start a write that has not been acknowledged by the server yet.
          const pendingFiber = yield* Effect.forkScoped(
            transport.write({
              ...write,
              message: { ...write.message, id: 'pending-2' },
            }),
          )
          yield* Effect.sleep('10 millis')

          // Instant optimistically includes pending-2 in both queryOnce and subscribeQuery.
          const page = yield* transport.readSince(Option.none())
          expect(page.messages.map(message => message.id)).toEqual([
            'confirmed-1',
          ])
          expect(page.cursor).toBe('1')

          queryListener?.({
            data: { programMessage: [confirmedRow, optimisticRow] },
          })
          yield* Effect.sleep('10 millis')
          expect(observed).toEqual(['confirmed-1'])

          // Once transact settles, pending-2 is no longer filtered out.
          yield* Deferred.succeed(releaseTransact, undefined)
          yield* Fiber.await(pendingFiber)

          const pageAfter = yield* transport.readSince(Option.none())
          expect(pageAfter.messages.map(message => message.id)).toEqual([
            'confirmed-1',
            'pending-2',
          ])
          expect(pageAfter.cursor).toBe('2')
        }),
      ),
    )
  })
})
