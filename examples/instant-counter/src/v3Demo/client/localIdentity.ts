import { Data, Effect, Encoding, Result } from 'effect'

import {
  InstantV3EntityId,
  InstantV3Identity,
  InstantV3MessageIdempotencyKey,
  InstantV3TimestampMs,
  type V3SharedProgramIdentitySources,
  deriveOriginClientKeyPair,
  deriveOriginDeviceKeyPair,
} from '@foldkit/instant'

import {
  type MultipleCountersV3OriginSecrets,
  type MultipleCountersV3ProcessorSecret,
} from './originLifecycle.js'

const deviceSecretName = 'multiple-counters-v3-device-secret'
const clientSecretName = 'multiple-counters-v3-client-secret'
const maximumSecretGenerationAttempts = 32

/** Atomic durable primitives required by every host's local identity vault. */
export type MultipleCountersV3LocalIdentityStore = Readonly<{
  nextActorSequence: (positionKey: string) => Effect.Effect<number, unknown>
  readOrCreateValue: (
    name: string,
    create: Effect.Effect<string, unknown>,
  ) => Effect.Effect<string, unknown>
}>

/** Host entropy and clock sources kept outside Program state. */
export type MultipleCountersV3LocalIdentityEnvironment = Readonly<{
  now: () => number
  randomBytes: () => Uint8Array
  randomUuid: () => string
}>

/** A persisted secret was malformed or did not derive a valid P-256 identity. */
export class MultipleCountersV3LocalIdentityError extends Data.TaggedError(
  'MultipleCountersV3LocalIdentityError',
)<
  Readonly<{
    cause: unknown
    operation: 'DecodeSecret' | 'GenerateSecret' | 'Identity' | 'Timestamp'
  }>
> {}

const decodeSecret = (
  value: string,
): Effect.Effect<Uint8Array, MultipleCountersV3LocalIdentityError> => {
  const decoded = Encoding.decodeBase64Url(value)
  if (Result.isFailure(decoded)) {
    return Effect.fail(
      new MultipleCountersV3LocalIdentityError({
        cause: decoded.failure,
        operation: 'DecodeSecret',
      }),
    )
  }
  return Effect.succeed(decoded.success)
}

const generateSecret = (
  environment: MultipleCountersV3LocalIdentityEnvironment,
  attempt = 1,
): Effect.Effect<string, MultipleCountersV3LocalIdentityError> =>
  Effect.try({
    try: environment.randomBytes,
    catch: cause =>
      new MultipleCountersV3LocalIdentityError({
        cause,
        operation: 'GenerateSecret',
      }),
  }).pipe(
    Effect.flatMap(secretKey =>
      deriveOriginDeviceKeyPair(secretKey).pipe(
        Effect.matchEffect({
          onFailure: cause => {
            if (attempt >= maximumSecretGenerationAttempts) {
              return Effect.fail(
                new MultipleCountersV3LocalIdentityError({
                  cause,
                  operation: 'GenerateSecret',
                }),
              )
            }
            return generateSecret(environment, attempt + 1)
          },
          onSuccess: () => Effect.succeed(Encoding.encodeBase64Url(secretKey)),
        }),
      ),
    ),
  )

const loadSecret = (
  store: MultipleCountersV3LocalIdentityStore,
  environment: MultipleCountersV3LocalIdentityEnvironment,
  name: string,
) =>
  store
    .readOrCreateValue(name, generateSecret(environment))
    .pipe(Effect.flatMap(decodeSecret))

const enrollmentClaimTimestampName = (
  instantAppId: string,
  subjectId: string,
): string =>
  JSON.stringify([
    'MultipleCountersV3EnrollmentClaimTimestamp',
    instantAppId,
    subjectId,
  ])

/** Loads the first durable enrollment timestamp for one authenticated subject. */
export const loadMultipleCountersV3EnrollmentClaimTimestamp = (
  store: MultipleCountersV3LocalIdentityStore,
  environment: MultipleCountersV3LocalIdentityEnvironment,
  input: Readonly<{ instantAppId: string; subjectId: string }>,
): Effect.Effect<InstantV3TimestampMs, MultipleCountersV3LocalIdentityError> =>
  store
    .readOrCreateValue(
      enrollmentClaimTimestampName(input.instantAppId, input.subjectId),
      Effect.try({
        try: () => environment.now().toString(),
        catch: cause =>
          new MultipleCountersV3LocalIdentityError({
            cause,
            operation: 'Timestamp',
          }),
      }),
    )
    .pipe(
      Effect.mapError(
        cause =>
          new MultipleCountersV3LocalIdentityError({
            cause,
            operation: 'Timestamp',
          }),
      ),
      Effect.flatMap(value =>
        Effect.try({
          try: () => InstantV3TimestampMs.make(Number(value)),
          catch: cause =>
            new MultipleCountersV3LocalIdentityError({
              cause,
              operation: 'Timestamp',
            }),
        }),
      ),
    )

/** Loads or atomically creates stable Device and Client origin secrets. */
export const loadMultipleCountersV3OriginSecrets = (
  store: MultipleCountersV3LocalIdentityStore,
  environment: MultipleCountersV3LocalIdentityEnvironment,
): Effect.Effect<MultipleCountersV3OriginSecrets, unknown> =>
  Effect.gen(function* () {
    const deviceSecretKey = yield* loadSecret(
      store,
      environment,
      deviceSecretName,
    )
    const clientSecretKey = yield* loadSecret(
      store,
      environment,
      clientSecretName,
    )
    yield* deriveOriginDeviceKeyPair(deviceSecretKey).pipe(
      Effect.mapError(
        cause =>
          new MultipleCountersV3LocalIdentityError({
            cause,
            operation: 'Identity',
          }),
      ),
    )
    yield* deriveOriginClientKeyPair(clientSecretKey).pipe(
      Effect.mapError(
        cause =>
          new MultipleCountersV3LocalIdentityError({
            cause,
            operation: 'Identity',
          }),
      ),
    )
    return { clientSecretKey, deviceSecretKey }
  })

/** Allocates one fresh Processor secret that is never persisted. */
export const makeMultipleCountersV3ProcessorSecret = (
  environment: MultipleCountersV3LocalIdentityEnvironment,
): Effect.Effect<MultipleCountersV3ProcessorSecret, unknown> =>
  generateSecret(environment).pipe(
    Effect.flatMap(decodeSecret),
    Effect.map(processorSecretKey => ({ processorSecretKey })),
  )

const identityEffect = (
  environment: MultipleCountersV3LocalIdentityEnvironment,
  prefix: string,
): Effect.Effect<string, MultipleCountersV3LocalIdentityError> =>
  Effect.try({
    try: () => `${prefix}:${environment.randomUuid()}`,
    catch: cause =>
      new MultipleCountersV3LocalIdentityError({
        cause,
        operation: 'Identity',
      }),
  })

const actorSequencePositionKey = (
  sessionId: string,
  actorId: string,
  clientId: string,
): string => JSON.stringify(['ActorSequence', sessionId, actorId, clientId])

/** Adapts one host vault to the monotonic and unique sources used by the Processor. */
export const makeMultipleCountersV3IdentitySources = (
  input: Readonly<{
    actorId: string
    clientId: string
    environment: MultipleCountersV3LocalIdentityEnvironment
    sessionId: string
    store: MultipleCountersV3LocalIdentityStore
  }>,
): V3SharedProgramIdentitySources => ({
  nextActorSequence: input.store.nextActorSequence(
    actorSequencePositionKey(input.sessionId, input.actorId, input.clientId),
  ),
  nextEntityId: Effect.try({
    try: () => InstantV3EntityId.make(input.environment.randomUuid()),
    catch: cause =>
      new MultipleCountersV3LocalIdentityError({
        cause,
        operation: 'Identity',
      }),
  }),
  nextMessageIdempotencyKey: identityEffect(input.environment, 'message').pipe(
    Effect.map(InstantV3MessageIdempotencyKey.make),
  ),
  nextOccurrenceId: identityEffect(input.environment, 'occurrence').pipe(
    Effect.map(InstantV3Identity.make),
  ),
  nextProposalId: identityEffect(input.environment, 'proposal').pipe(
    Effect.map(InstantV3Identity.make),
  ),
  now: Effect.try({
    try: input.environment.now,
    catch: cause =>
      new MultipleCountersV3LocalIdentityError({
        cause,
        operation: 'Timestamp',
      }),
  }),
})
