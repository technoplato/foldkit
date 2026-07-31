import { Array, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  loadClientIdentity,
  makeActorSequenceRegistry,
  makeAttemptedEffectRegistry,
} from './localState.js'

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>()

  get length(): number {
    return this.#values.size
  }

  clear(): void {
    this.#values.clear()
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null
  }

  key(index: number): string | null {
    return Option.getOrNull(
      Array.get(Array.fromIterable(this.#values.keys()), index),
    )
  }

  removeItem(key: string): void {
    this.#values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value)
  }
}

describe('browser local protocol state', () => {
  it('keeps one Client identity across reloads and isolates browser profiles', () => {
    const deviceStorage = new MemoryStorage()
    const firstProfile = new MemoryStorage()
    const secondProfile = new MemoryStorage()

    const firstClient = loadClientIdentity(firstProfile, deviceStorage)
    const reloadedClient = loadClientIdentity(firstProfile, deviceStorage)
    const secondClient = loadClientIdentity(secondProfile, deviceStorage)

    expect(reloadedClient).toStrictEqual(firstClient)
    expect(secondClient.deviceId).toBe(firstClient.deviceId)
    expect(secondClient.clientId).not.toBe(firstClient.clientId)
  })

  it('advances actor sequences across reloads of the same Client', async () => {
    const clientStorage = new MemoryStorage()
    const beforeReload = makeActorSequenceRegistry(clientStorage)

    expect(await Effect.runPromise(beforeReload.next('session-1'))).toBe(1)
    expect(await Effect.runPromise(beforeReload.next('session-1'))).toBe(2)

    const afterReload = makeActorSequenceRegistry(clientStorage)
    expect(await Effect.runPromise(afterReload.next('session-1'))).toBe(3)
    expect(await Effect.runPromise(afterReload.next('session-2'))).toBe(1)
  })

  it('claims an idempotency key before executing a device effect', () => {
    const storage = new MemoryStorage()
    const firstClient = makeAttemptedEffectRegistry(storage)

    expect(firstClient.claim('session-1:effect-1')).toBe(true)
    expect(firstClient.claim('session-1:effect-1')).toBe(false)

    const reloadedClient = makeAttemptedEffectRegistry(storage)
    expect(reloadedClient.claim('session-1:effect-1')).toBe(false)
    expect(reloadedClient.claim('session-2:effect-1')).toBe(true)
  })
})
