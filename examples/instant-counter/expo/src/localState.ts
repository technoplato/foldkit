import {
  Effect,
  Option,
  Record as Record_,
  Schema as S,
  Semaphore,
} from 'effect'

const clientIdentityKey = 'foldkit.instant-counter.native.identity.v1'
const actorSequencesKey = 'foldkit.instant-counter.native.actor-sequences.v1'

const Identifier = S.String.check(S.isLengthBetween(1, 256))
const ClientIdentity = S.Struct({
  clientId: Identifier,
  deviceId: Identifier,
})
const ClientIdentityJson = S.fromJsonString(ClientIdentity)
const NonNegativeInteger = S.Int.check(S.isGreaterThanOrEqualTo(0))
const ActorSequences = S.Record(S.String, NonNegativeInteger)
const ActorSequencesJson = S.fromJsonString(ActorSequences)

/** Stable, non-secret identifiers for one native installation. */
export type ClientIdentity = typeof ClientIdentity.Type

/** The asynchronous key-value subset required from AsyncStorage. */
export type AsyncKeyValueStorage = Readonly<{
  getItem: (key: string) => Promise<string | null>
  removeItem: (key: string) => Promise<void>
  setItem: (key: string, value: string) => Promise<void>
}>

/** Loads or creates the installation's stable Client and device identity. */
export type ClientIdentityRegistry = Readonly<{
  load: () => Effect.Effect<ClientIdentity>
}>

/** Allocates serialized, durable actor sequence numbers per Program session. */
export type ActorSequenceRegistry = Readonly<{
  next: (sessionId: string) => Effect.Effect<number>
}>

const decodeClientIdentity = (encoded: string): ClientIdentity =>
  S.decodeUnknownSync(ClientIdentityJson)(encoded)

const decodeActorSequences = (encoded: string): typeof ActorSequences.Type =>
  S.decodeUnknownSync(ActorSequencesJson)(encoded)

/** Creates an AsyncStorage-backed stable native Client identity registry. */
export const makeClientIdentityRegistry = (
  storage: AsyncKeyValueStorage,
  makeIdentifier: () => string,
): ClientIdentityRegistry => {
  const semaphore = Semaphore.makeUnsafe(1)
  return {
    load: () =>
      semaphore.withPermit(
        Effect.tryPromise({
          try: async () => {
            const encoded = await storage.getItem(clientIdentityKey)
            if (encoded !== null) {
              try {
                return decodeClientIdentity(encoded)
              } catch {
                await storage.removeItem(clientIdentityKey)
              }
            }
            const identity = ClientIdentity.make({
              clientId: makeIdentifier(),
              deviceId: makeIdentifier(),
            })
            await storage.setItem(
              clientIdentityKey,
              S.encodeSync(ClientIdentityJson)(identity),
            )
            return identity
          },
          catch: cause => cause,
        }).pipe(Effect.orDie),
      ),
  }
}

const readActorSequences = async (
  storage: AsyncKeyValueStorage,
): Promise<typeof ActorSequences.Type> => {
  const encoded = await storage.getItem(actorSequencesKey)
  if (encoded === null) {
    return {}
  }
  try {
    return decodeActorSequences(encoded)
  } catch {
    await storage.removeItem(actorSequencesKey)
    return {}
  }
}

/** Creates an AsyncStorage-backed serialized actor sequence registry. */
export const makeActorSequenceRegistry = (
  storage: AsyncKeyValueStorage,
): ActorSequenceRegistry => {
  const semaphore = Semaphore.makeUnsafe(1)
  return {
    next: sessionId =>
      semaphore.withPermit(
        Effect.tryPromise({
          try: async () => {
            const sequences = await readActorSequences(storage)
            const nextSequence =
              Option.getOrElse(Record_.get(sequences, sessionId), () => 0) + 1
            await storage.setItem(
              actorSequencesKey,
              S.encodeSync(ActorSequencesJson)(
                Record_.set(sequences, sessionId, nextSequence),
              ),
            )
            return nextSequence
          },
          catch: cause => cause,
        }).pipe(Effect.orDie),
      ),
  }
}
