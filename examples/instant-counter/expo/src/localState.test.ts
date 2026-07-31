import { Array as Array_, Effect, Option, Order } from 'effect'
import { describe, expect, it, vi } from 'vitest'

import {
  type AsyncKeyValueStorage,
  makeActorSequenceRegistry,
  makeClientIdentityRegistry,
} from './localState'

const identityKey = 'foldkit.instant-counter.native.identity.v1'
const actorSequencesKey = 'foldkit.instant-counter.native.actor-sequences.v1'

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

describe('native local state', () => {
  it('persists one stable Client and device identity', async () => {
    const testStorage = makeTestStorage()
    const makeIdentifier = vi
      .fn<() => string>()
      .mockReturnValueOnce('client-1')
      .mockReturnValueOnce('device-1')
    const firstRegistry = makeClientIdentityRegistry(
      testStorage.storage,
      makeIdentifier,
    )
    const first = await Effect.runPromise(firstRegistry.load())
    const reconstructed = await Effect.runPromise(
      makeClientIdentityRegistry(testStorage.storage, makeIdentifier).load(),
    )

    expect(first).toStrictEqual({
      clientId: 'client-1',
      deviceId: 'device-1',
    })
    expect(reconstructed).toStrictEqual(first)
    expect(makeIdentifier).toHaveBeenCalledTimes(2)
  })

  it('serializes concurrent identity creation', async () => {
    const testStorage = makeTestStorage()
    const makeIdentifier = vi
      .fn<() => string>()
      .mockReturnValueOnce('client-1')
      .mockReturnValueOnce('device-1')
    const registry = makeClientIdentityRegistry(
      testStorage.storage,
      makeIdentifier,
    )

    const identities = await Effect.runPromise(
      Effect.all(
        Array_.makeBy(12, () => registry.load()),
        { concurrency: 'unbounded' },
      ),
    )
    const maybeFirstIdentity = Array_.head(identities)

    expect(Option.isSome(maybeFirstIdentity)).toBe(true)
    if (Option.isSome(maybeFirstIdentity)) {
      expect(
        Array_.every(
          identities,
          identity =>
            identity.clientId === maybeFirstIdentity.value.clientId &&
            identity.deviceId === maybeFirstIdentity.value.deviceId,
        ),
      ).toBe(true)
    }
    expect(makeIdentifier).toHaveBeenCalledTimes(2)
  })

  it('replaces corrupt identity state without surfacing its contents', async () => {
    const testStorage = makeTestStorage()
    testStorage.records.set(identityKey, 'secret-corrupt-identity')
    const registry = makeClientIdentityRegistry(
      testStorage.storage,
      vi
        .fn<() => string>()
        .mockReturnValueOnce('client-recovered')
        .mockReturnValueOnce('device-recovered'),
    )

    const identity = await Effect.runPromise(registry.load())

    expect(identity).toStrictEqual({
      clientId: 'client-recovered',
      deviceId: 'device-recovered',
    })
    expect(testStorage.records.get(identityKey)).not.toContain(
      'secret-corrupt-identity',
    )
  })

  it('persists and serializes per-session actor sequences', async () => {
    const testStorage = makeTestStorage()
    const registry = makeActorSequenceRegistry(testStorage.storage)

    const allocated = await Effect.runPromise(
      Effect.all(
        Array_.makeBy(24, () => registry.next('session-a')),
        { concurrency: 'unbounded' },
      ),
    )
    const nextAfterRestart = await Effect.runPromise(
      makeActorSequenceRegistry(testStorage.storage).next('session-a'),
    )
    const otherSession = await Effect.runPromise(
      makeActorSequenceRegistry(testStorage.storage).next('session-b'),
    )

    expect(Array_.sort(allocated, Order.Number)).toStrictEqual(
      Array_.range(1, 24),
    )
    expect(nextAfterRestart).toBe(25)
    expect(otherSession).toBe(1)
  })

  it('recovers corrupt actor sequences at the first durable allocation', async () => {
    const testStorage = makeTestStorage()
    testStorage.records.set(actorSequencesKey, '{"session-a":-1}')

    const nextSequence = await Effect.runPromise(
      makeActorSequenceRegistry(testStorage.storage).next('session-a'),
    )

    expect(nextSequence).toBe(1)
    expect(testStorage.records.get(actorSequencesKey)).toBe('{"session-a":1}')
  })
})
