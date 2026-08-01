import { Effect, Encoding, Ref } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type MultipleCountersV3LocalIdentityStore,
  loadMultipleCountersV3EnrollmentClaimTimestamp,
  loadMultipleCountersV3OriginSecrets,
  makeMultipleCountersV3IdentitySources,
  makeMultipleCountersV3ProcessorSecret,
} from './localIdentity.js'

const secret = (lastByte: number): Uint8Array => {
  const bytes = new Uint8Array(32)
  bytes[31] = lastByte
  return bytes
}

const makeStore = () =>
  Effect.gen(function* () {
    const secrets = yield* Ref.make(new Map<string, string>())
    const sequences = yield* Ref.make(new Map<string, number>())
    const store: MultipleCountersV3LocalIdentityStore = {
      nextActorSequence: positionKey =>
        Ref.modify(sequences, current => {
          const nextSequence = (current.get(positionKey) ?? 0) + 1
          const next = new Map(current)
          next.set(positionKey, nextSequence)
          return [nextSequence, next]
        }),
      readOrCreateValue: (name, create) =>
        Ref.get(secrets).pipe(
          Effect.flatMap(current => {
            const existing = current.get(name)
            if (existing !== undefined) {
              return Effect.succeed(existing)
            }
            return create.pipe(
              Effect.tap(value =>
                Ref.update(secrets, latest => {
                  const next = new Map(latest)
                  if (!next.has(name)) {
                    next.set(name, value)
                  }
                  return next
                }),
              ),
              Effect.flatMap(() => Ref.get(secrets)),
              Effect.map(latest => latest.get(name) ?? ''),
            )
          }),
        ),
    }
    return { secrets, store }
  })

describe('Multiple Counters v3 local identity', () => {
  it('loads stable Device and Client secrets and keeps Processor secrets fresh', async () => {
    let randomIndex = 1
    const environment = {
      now: () => 1_750_000_000_000,
      randomBytes: () => secret(randomIndex++),
      randomUuid: () => crypto.randomUUID(),
    }
    const { store } = await Effect.runPromise(makeStore())
    const first = await Effect.runPromise(
      loadMultipleCountersV3OriginSecrets(store, environment),
    )
    const second = await Effect.runPromise(
      loadMultipleCountersV3OriginSecrets(store, environment),
    )
    const processor = await Effect.runPromise(
      makeMultipleCountersV3ProcessorSecret(environment),
    )

    expect(Encoding.encodeBase64Url(first.deviceSecretKey)).toBe(
      Encoding.encodeBase64Url(second.deviceSecretKey),
    )
    expect(Encoding.encodeBase64Url(first.clientSecretKey)).toBe(
      Encoding.encodeBase64Url(second.clientSecretKey),
    )
    expect(Encoding.encodeBase64Url(processor.processorSecretKey)).not.toBe(
      Encoding.encodeBase64Url(first.clientSecretKey),
    )
  })

  it('allocates actor sequence by exact session, actor, and Client identity', async () => {
    let uuid = 0
    const environment = {
      now: () => 1_750_000_000_000,
      randomBytes: () => secret(1),
      randomUuid: () => {
        uuid += 1
        return `00000000-0000-4000-8000-${uuid.toString().padStart(12, '0')}`
      },
    }
    const { store } = await Effect.runPromise(makeStore())
    const first = makeMultipleCountersV3IdentitySources({
      actorId: 'actor-a',
      clientId: 'client-a',
      environment,
      sessionId: 'session-a',
      store,
    })
    const second = makeMultipleCountersV3IdentitySources({
      actorId: 'actor-a',
      clientId: 'client-b',
      environment,
      sessionId: 'session-a',
      store,
    })

    expect(await Effect.runPromise(first.nextActorSequence)).toBe(1)
    expect(await Effect.runPromise(first.nextActorSequence)).toBe(2)
    expect(await Effect.runPromise(second.nextActorSequence)).toBe(1)
    expect(await Effect.runPromise(first.nextOccurrenceId)).toContain(
      'occurrence:',
    )
    expect(await Effect.runPromise(first.nextEntityId)).toMatch(
      /^[0-9a-f-]{36}$/u,
    )
  })

  it('reuses the first enrollment timestamp across later Processor allocations', async () => {
    let now = 1_750_000_000_000
    const environment = {
      now: () => now,
      randomBytes: () => secret(1),
      randomUuid: () => crypto.randomUUID(),
    }
    const { store } = await Effect.runPromise(makeStore())
    const input = {
      instantAppId: 'instant-v3-demo-app',
      subjectId: 'authenticated-subject',
    }
    const first = await Effect.runPromise(
      loadMultipleCountersV3EnrollmentClaimTimestamp(store, environment, input),
    )
    now += 60_000
    const second = await Effect.runPromise(
      loadMultipleCountersV3EnrollmentClaimTimestamp(store, environment, input),
    )

    expect(second).toBe(first)
    expect(second).toBe(1_750_000_000_000)
  })
})
