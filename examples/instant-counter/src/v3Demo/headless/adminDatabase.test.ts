import { Effect, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import { init } from '@instantdb/admin'

import schema from '../../../instant.schema.js'
import { acquireMultipleCountersV3HeadlessDatabase } from './adminDatabase.js'

const makeDatabase = () =>
  init({
    adminToken: 'not-used-by-this-test',
    appId: 'not-used-by-this-test',
    schema,
  })

describe('protocol-v3 headless admin database', () => {
  it('carries the explicit authority capability under one process-local lease', async () => {
    const database = makeDatabase()
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const first = yield* acquireMultipleCountersV3HeadlessDatabase(
            database,
            {
              processId: 'headless-authority-1',
              writeIsolation: 'ExclusiveSerializedWriter',
            },
          )
          const second = yield* Effect.result(
            acquireMultipleCountersV3HeadlessDatabase(database, {
              processId: 'headless-authority-2',
              writeIsolation: 'ExclusiveSerializedWriter',
            }),
          )
          return { first, second }
        }),
      ),
    )

    expect(result.first.authority.authorityCapability).toEqual({
      _tag: 'ServerConfirmedInstantV3AuthorityDatabase',
      protocolVersion: 3,
      writeIsolation: 'ExclusiveSerializedWriter',
    })
    expect(Result.isFailure(result.second)).toBe(true)
    if (Result.isFailure(result.second)) {
      expect(result.second.failure).toMatchObject({
        activeProcessId: 'headless-authority-1',
        reason: 'AlreadyRunning',
        requestedProcessId: 'headless-authority-2',
      })
    }
  })

  it('releases the process-local lease with its Effect Scope', async () => {
    const database = makeDatabase()
    await Effect.runPromise(
      Effect.scoped(
        acquireMultipleCountersV3HeadlessDatabase(database, {
          processId: 'headless-authority-1',
          writeIsolation: 'ExclusiveSerializedWriter',
        }),
      ),
    )

    const next = await Effect.runPromise(
      Effect.scoped(
        acquireMultipleCountersV3HeadlessDatabase(database, {
          processId: 'headless-authority-2',
          writeIsolation: 'ExclusiveSerializedWriter',
        }),
      ),
    )
    expect(next.authority.authorityCapability.writeIsolation).toBe(
      'ExclusiveSerializedWriter',
    )
  })
})
