import { Effect, Encoding } from 'effect'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { makeMultipleCountersV3FileStoreClass } from './fileStore.js'
import {
  makeNodeMultipleCountersV3LocalIdentityStore,
  nodeMultipleCountersV3LocalIdentityEnvironment,
} from './localIdentity.js'

describe('Multiple Counters v3 Node Instant store', () => {
  it('persists Instant kv writes across Store instances', async () => {
    const root = mkdtempSync(join(tmpdir(), 'foldkit-instant-v3-store-'))
    const Store = makeMultipleCountersV3FileStoreClass(root)
    const first = new Store('app-id', 'kv')
    await first.multiSet([
      ['auth', { refreshToken: 'token-1' }],
      ['subject', 'alice'],
    ])
    const second = new Store('app-id', 'kv')

    expect(await second.getItem('auth')).toEqual({ refreshToken: 'token-1' })
    expect(await second.getAllKeys()).toEqual(['auth', 'subject'])
    await second.removeItem('subject')
    expect(await second.getItem('subject')).toBeUndefined()
    expect(readFileSync(join(root, 'instant', 'app-id', 'kv.json'), 'utf8')).toContain(
      'token-1',
    )
  })
})

describe('Multiple Counters v3 Node identity vault', () => {
  it('keeps origin secrets stable and advances actor sequences', async () => {
    const root = mkdtempSync(join(tmpdir(), 'foldkit-instant-v3-identity-'))
    const store = makeNodeMultipleCountersV3LocalIdentityStore(root)
    const environment = nodeMultipleCountersV3LocalIdentityEnvironment()
    const first = await Effect.runPromise(
      store.readOrCreateValue('device', Effect.succeed('secret-a')),
    )
    const second = await Effect.runPromise(
      store.readOrCreateValue('device', Effect.succeed('secret-b')),
    )
    const sequence = await Effect.runPromise(store.nextActorSequence('actor-1'))
    const nextSequence = await Effect.runPromise(
      store.nextActorSequence('actor-1'),
    )

    expect(first).toBe('secret-a')
    expect(second).toBe('secret-a')
    expect(sequence).toBe(1)
    expect(nextSequence).toBe(2)
    expect(environment.randomBytes()).toBeInstanceOf(Uint8Array)
    expect(Encoding.encodeBase64Url(environment.randomBytes()).length).toBeGreaterThan(
      0,
    )
  })
})
