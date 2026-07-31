import { Effect, Option, Record, Schema as S } from 'effect'

import type {
  ActorSequenceRegistry,
  AttemptedEffectRegistry,
  ClientIdentity,
} from '../processorClient/index.js'
import { randomId } from '../transport/session.js'

export type {
  ActorSequenceRegistry,
  AttemptedEffectRegistry,
  ClientIdentity,
} from '../processorClient/index.js'

const StoredClientIdentity = S.Struct({
  clientId: S.String,
  deviceId: S.String,
})

const clientIdKey = 'foldkit.instant-counter.client-id.v1'
const deviceIdKey = 'foldkit.instant-counter.device-id.v1'
const attemptedEffectsKey = 'foldkit.instant-counter.attempted-effects.v1'
const actorSequencesKey = 'foldkit.instant-counter.actor-sequences.v1'

const EffectRequestIdsJson = S.fromJsonString(S.Array(S.String))
const ActorSequences = S.Record(S.String, S.Int)
type ActorSequences = typeof ActorSequences.Type
const ActorSequencesJson = S.fromJsonString(ActorSequences)

const loadIdentifier = (storage: Storage, key: string): string => {
  const existing = storage.getItem(key)
  if (existing !== null && existing.length > 0) {
    return existing
  }
  const identifier = randomId()
  storage.setItem(key, identifier)
  return identifier
}

/** Loads or creates stable non-secret Client and device identifiers. */
export const loadClientIdentity = (
  clientStorage: Storage = localStorage,
  deviceStorage: Storage = localStorage,
): ClientIdentity => {
  return StoredClientIdentity.make({
    clientId: loadIdentifier(clientStorage, clientIdKey),
    deviceId: loadIdentifier(deviceStorage, deviceIdKey),
  })
}

const readAttemptedEffectIds = (storage: Storage): ReadonlyArray<string> => {
  const encoded = storage.getItem(attemptedEffectsKey)
  if (encoded === null) {
    return []
  }
  try {
    return S.decodeUnknownSync(EffectRequestIdsJson)(encoded)
  } catch {
    storage.removeItem(attemptedEffectsKey)
    return []
  }
}

/** Creates a local registry that claims an effect before touching the device. */
export const makeAttemptedEffectRegistry = (
  storage: Storage = localStorage,
): AttemptedEffectRegistry => ({
  claim: idempotencyKey => {
    const attempted = new Set(readAttemptedEffectIds(storage))
    if (attempted.has(idempotencyKey)) {
      return false
    }
    attempted.add(idempotencyKey)
    storage.setItem(
      attemptedEffectsKey,
      S.encodeSync(EffectRequestIdsJson)(Array.from(attempted)),
    )
    return true
  },
})

const readActorSequences = (storage: Storage): ActorSequences => {
  const encoded = storage.getItem(actorSequencesKey)
  if (encoded === null) {
    return {}
  }
  try {
    return S.decodeUnknownSync(ActorSequencesJson)(encoded)
  } catch {
    storage.removeItem(actorSequencesKey)
    return {}
  }
}

/** Creates the actor sequence registry for one browser Client. */
export const makeActorSequenceRegistry = (
  storage: Storage = localStorage,
): ActorSequenceRegistry => ({
  next: sessionId =>
    Effect.sync(() => {
      const sequences = readActorSequences(storage)
      const nextSequence =
        Option.getOrElse(Record.get(sequences, sessionId), () => 0) + 1
      storage.setItem(
        actorSequencesKey,
        S.encodeSync(ActorSequencesJson)(
          Record.set(sequences, sessionId, nextSequence),
        ),
      )
      return nextSequence
    }),
})
