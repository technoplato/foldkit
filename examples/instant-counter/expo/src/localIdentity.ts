import { Data, Effect, Option, Record as Record_, Schema as S, Semaphore } from 'effect'

import type { MultipleCountersV3LocalIdentityStore } from 'instant-counter-example/v3-client'

const identityKey = 'foldkit.instant-multiple-counters-v3.native.identity.v1'

const IdentityState = S.Struct({
  secrets: S.Record(S.String, S.String),
  sequences: S.Record(S.String, S.Int),
  version: S.Literal(1),
})
const IdentityStateJson = S.fromJsonString(IdentityState)
type IdentityState = typeof IdentityState.Type

/** A native Client could not preserve its origin secrets or actor sequences. */
export class MultipleCountersV3NativeIdentityError extends Data.TaggedError(
  'MultipleCountersV3NativeIdentityError',
)<Readonly<{ cause: unknown }>> {}

/** The asynchronous key-value subset required from AsyncStorage. */
export type AsyncKeyValueStorage = Readonly<{
  getItem: (key: string) => Promise<string | null>
  removeItem: (key: string) => Promise<void>
  setItem: (key: string, value: string) => Promise<void>
}>

const emptyState = (): IdentityState =>
  IdentityState.make({
    secrets: {},
    sequences: {},
    version: 1,
  })

const readState = async (
  storage: AsyncKeyValueStorage,
): Promise<IdentityState> => {
  const encoded = await storage.getItem(identityKey)
  if (encoded === null) {
    return emptyState()
  }
  try {
    return S.decodeUnknownSync(IdentityStateJson)(encoded)
  } catch {
    await storage.removeItem(identityKey)
    return emptyState()
  }
}

const writeState = async (
  storage: AsyncKeyValueStorage,
  state: IdentityState,
): Promise<void> => {
  await storage.setItem(identityKey, S.encodeSync(IdentityStateJson)(state))
}

/** AsyncStorage vault with serialized sequence and secret allocation. */
export const makeNativeMultipleCountersV3LocalIdentityStore = (
  storage: AsyncKeyValueStorage,
): MultipleCountersV3LocalIdentityStore => {
  const semaphore = Semaphore.makeUnsafe(1)
  return {
    nextActorSequence: positionKey =>
      semaphore.withPermit(
        Effect.tryPromise({
          try: async () => {
            const current = await readState(storage)
            const nextSequence =
              Option.getOrElse(
                Record_.get(current.sequences, positionKey),
                () => 0,
              ) + 1
            await writeState(
              storage,
              IdentityState.make({
                ...current,
                sequences: Record_.set(
                  current.sequences,
                  positionKey,
                  nextSequence,
                ),
              }),
            )
            return nextSequence
          },
          catch: cause => new MultipleCountersV3NativeIdentityError({ cause }),
        }),
      ),
    readOrCreateValue: (name, create) =>
      create.pipe(
        Effect.flatMap(candidate =>
          semaphore.withPermit(
            Effect.tryPromise({
              try: async () => {
                const current = await readState(storage)
                const existing = Record_.get(current.secrets, name)
                if (Option.isSome(existing)) {
                  return existing.value
                }
                await writeState(
                  storage,
                  IdentityState.make({
                    ...current,
                    secrets: Record_.set(current.secrets, name, candidate),
                  }),
                )
                return candidate
              },
              catch: cause =>
                new MultipleCountersV3NativeIdentityError({ cause }),
            }),
          ),
        ),
      ),
  }
}
