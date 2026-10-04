import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type ProgramLogDatabase,
  makeInstantCoreProgramLogTransport,
} from './core.js'

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
})
