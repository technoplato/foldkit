import { Array, Effect } from 'effect'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeBrowserMultipleCountersV3LocalIdentityStore } from './localIdentity.js'

describe('browser Multiple Counters v3 local identity store', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serializes actor sequences across independent browser adapters', async () => {
    const firstStore = makeBrowserMultipleCountersV3LocalIdentityStore()
    const secondStore = makeBrowserMultipleCountersV3LocalIdentityStore()
    const sequences = await Promise.all(
      Array.map(Array.range(0, 99), index => {
        const store = index % 2 === 0 ? firstStore : secondStore
        return Effect.runPromise(store.nextActorSequence('shared-actor'))
      }),
    )

    expect(new Set(sequences).size).toBe(100)
    expect(sequences.toSorted((first, second) => first - second)).toStrictEqual(
      Array.range(1, 100),
    )
  })

  it('chooses one durable value across concurrent creators', async () => {
    const firstStore = makeBrowserMultipleCountersV3LocalIdentityStore()
    const secondStore = makeBrowserMultipleCountersV3LocalIdentityStore()
    const values = await Promise.all(
      Array.map(Array.range(0, 49), index => {
        const store = index % 2 === 0 ? firstStore : secondStore
        return Effect.runPromise(
          store.readOrCreateValue(
            'shared-secret',
            Effect.succeed(`candidate-${index.toString()}`),
          ),
        )
      }),
    )

    expect(new Set(values).size).toBe(1)
    const durableValue = await Effect.runPromise(
      secondStore.readOrCreateValue(
        'shared-secret',
        Effect.succeed('late-candidate'),
      ),
    )
    expect(values).toContain(durableValue)
  })
})
