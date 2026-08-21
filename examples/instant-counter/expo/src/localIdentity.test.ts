import { Array as Array_, Effect, Option, Order } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type AsyncKeyValueStorage,
  makeNativeMultipleCountersV3LocalIdentityStore,
} from './localIdentity.js'

const identityKey = 'foldkit.instant-multiple-counters-v3.native.identity.v1'

const makeTestStorage = (): Readonly<{
  records: Map<string, string>
  storage: AsyncKeyValueStorage
}> => {
  const records = new Map<string, string>()
  return {
    records,
    storage: {
      getItem: key => Promise.resolve(records.get(key) ?? null),
      removeItem: key => {
        records.delete(key)
        return Promise.resolve()
      },
      setItem: async (key, value) => {
        await Promise.resolve()
        records.set(key, value)
      },
    },
  }
}

describe('native Multiple Counters v3 identity vault', () => {
  it('keeps origin secrets stable and advances actor sequences', async () => {
    const testStorage = makeTestStorage()
    const store = makeNativeMultipleCountersV3LocalIdentityStore(
      testStorage.storage,
    )
    const first = await Effect.runPromise(
      store.readOrCreateValue('device', Effect.succeed('secret-a')),
    )
    const second = await Effect.runPromise(
      store.readOrCreateValue('device', Effect.succeed('secret-b')),
    )
    const sequences = await Effect.runPromise(
      Effect.all(
        Array_.makeBy(8, () => store.nextActorSequence('session-a')),
        { concurrency: 'unbounded' },
      ),
    )
    const nextAfterRestart = await Effect.runPromise(
      makeNativeMultipleCountersV3LocalIdentityStore(
        testStorage.storage,
      ).nextActorSequence('session-a'),
    )

    expect(first).toBe('secret-a')
    expect(second).toBe('secret-a')
    expect(Array_.sort(sequences, Order.Number)).toEqual(Array_.range(1, 8))
    expect(nextAfterRestart).toBe(9)
  })

  it('replaces corrupt identity state without surfacing its contents', async () => {
    const testStorage = makeTestStorage()
    testStorage.records.set(identityKey, 'secret-corrupt-identity')
    const store = makeNativeMultipleCountersV3LocalIdentityStore(
      testStorage.storage,
    )

    const secret = await Effect.runPromise(
      store.readOrCreateValue('device', Effect.succeed('secret-recovered')),
    )

    expect(secret).toBe('secret-recovered')
    expect(testStorage.records.get(identityKey)).not.toContain(
      'secret-corrupt-identity',
    )
  })

  it('serializes concurrent first-time secret creation to one winner', async () => {
    const testStorage = makeTestStorage()
    const store = makeNativeMultipleCountersV3LocalIdentityStore(
      testStorage.storage,
    )
    let created = 0
    const secrets = await Effect.runPromise(
      Effect.all(
        Array_.makeBy(12, () =>
          store.readOrCreateValue(
            'client',
            Effect.sync(() => {
              created += 1
              return `secret-${created.toString()}`
            }),
          ),
        ),
        { concurrency: 'unbounded' },
      ),
    )
    const maybeFirst = Array_.head(secrets)

    expect(Option.isSome(maybeFirst)).toBe(true)
    if (Option.isSome(maybeFirst)) {
      expect(Array_.every(secrets, secret => secret === maybeFirst.value)).toBe(
        true,
      )
    }
  })
})
