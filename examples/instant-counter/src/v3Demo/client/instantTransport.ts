import {
  Array,
  Cause,
  Data,
  Effect,
  Function,
  Option,
  Predicate,
  Queue,
  Record as Record_,
  Schema as S,
  SchemaAST,
  Stream,
} from 'effect'

import { stringifyInstantV3CanonicalJson } from '@foldkit/instant'

import type { InstantCounterDatabase } from '../../../instant.schema.js'
import { logMultipleCountersV3Debug } from '../shared/debugLog.js'
import {
  makeMultipleCountersV3EntityId,
  makeMultipleCountersV3SessionIdentity,
} from '../shared/identity.js'
import {
  type MultipleCountersV3PolicyRequestRecord,
  MultipleCountersV3PolicyResolutionRecord,
  type MultipleCountersV3PolicyResolutionRecord as MultipleCountersV3PolicyResolutionRecordType,
  makeMultipleCountersV3PolicyResolutionPositionKey,
} from '../shared/policyRequest.js'
import {
  type MultipleCountersV3LocalIdentityEnvironment,
  type MultipleCountersV3LocalIdentityStore,
  loadMultipleCountersV3EnrollmentClaimTimestamp,
  loadMultipleCountersV3OriginSecrets,
  makeMultipleCountersV3IdentitySources,
  makeMultipleCountersV3ProcessorSecret,
} from './localIdentity.js'
import { deriveMultipleCountersV3OriginIdentity } from './originLifecycle.js'
import type { MultipleCountersV3ProcessorConfig } from './processor.js'

const strictDecodeOptions: SchemaAST.ParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
}

/** An authenticated policy-resolution observation failed or decoded invalid data. */
export class MultipleCountersV3PolicyResolutionError extends Data.TaggedError(
  'MultipleCountersV3PolicyResolutionError',
)<Readonly<{ cause: unknown }>> {}

const policyResolutionRows = (response: unknown): ReadonlyArray<unknown> => {
  if (!Predicate.isObject(response)) {
    throw new Error('Expected an Instant policy-resolution response.')
  }
  const maybeError = Record_.get(response, 'error')
  if (Option.isSome(maybeError) && maybeError.value !== undefined) {
    throw maybeError.value
  }
  const maybeData = Record_.get(response, 'data')
  const data = Option.isSome(maybeData) ? maybeData.value : response
  if (!Predicate.isObject(data)) {
    throw new Error('Expected Instant policy-resolution query data.')
  }
  const maybeRows = Record_.get(
    data,
    'multipleCountersV3PolicyRequestResolutions',
  )
  if (Option.isNone(maybeRows)) {
    throw new Error('Instant omitted policy-resolution rows.')
  }
  return S.decodeUnknownSync(
    S.Array(S.Unknown),
    strictDecodeOptions,
  )(maybeRows.value)
}

type MultipleCountersV3PolicyResolutionSubscription = (
  listener: (response: unknown) => void,
) => () => void

const resolutionMatchesRequest = (
  resolution: MultipleCountersV3PolicyResolutionRecordType,
  request: MultipleCountersV3PolicyRequestRecord,
): boolean =>
  resolution.appSubjectDigest === request.appSubjectDigest &&
  resolution.expectedLifecycleGeneration ===
    request.expectedLifecycleGeneration &&
  resolution.expectedPolicyGeneration === request.expectedPolicyGeneration &&
  resolution.id ===
    makeMultipleCountersV3EntityId(
      'PolicyResolution',
      resolution.policyResolutionPositionKey,
    ) &&
  resolution.instantAppId === request.instantAppId &&
  resolution.policyRequestId === request.policyRequestId &&
  resolution.policyRequestPositionKey === request.policyRequestPositionKey &&
  resolution.programId === request.programId &&
  resolution.programVersion === request.programVersion &&
  resolution.protocolVersion === request.protocolVersion &&
  resolution.requestedAtMs === request.requestedAtMs &&
  stringifyInstantV3CanonicalJson(resolution.requestedMode) ===
    stringifyInstantV3CanonicalJson(request.requestedMode) &&
  resolution.requestedModeTag === request.requestedModeTag &&
  resolution.requesterId === request.requesterId &&
  resolution.sessionEpochId === request.sessionEpochId &&
  resolution.sessionId === request.sessionId &&
  resolution.subjectId === request.subjectId

/** Waits on one scoped subscription for an exact policy-request outcome. */
export const resolveMultipleCountersV3PolicyRequestSubscription = (
  subscribe: MultipleCountersV3PolicyResolutionSubscription,
  request: MultipleCountersV3PolicyRequestRecord,
): Effect.Effect<
  MultipleCountersV3PolicyResolutionRecordType,
  MultipleCountersV3PolicyResolutionError
> => {
  const resolutions = Stream.callback<
    MultipleCountersV3PolicyResolutionRecordType,
    MultipleCountersV3PolicyResolutionError
  >(
    queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          try {
            return subscribe(response => {
              try {
                const decoded = S.decodeUnknownSync(
                  S.Array(MultipleCountersV3PolicyResolutionRecord),
                  strictDecodeOptions,
                )(policyResolutionRows(response))
                const maybeResolution = Array.head(decoded)
                if (Option.isNone(maybeResolution)) {
                  return
                }
                if (Option.isSome(Array.get(decoded, 1))) {
                  throw new Error(
                    'Instant returned duplicate policy-resolution rows.',
                  )
                }
                if (!resolutionMatchesRequest(maybeResolution.value, request)) {
                  throw new Error(
                    'Instant returned a policy resolution for a different immutable request.',
                  )
                }
                Queue.offerUnsafe(queue, maybeResolution.value)
              } catch (cause) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new MultipleCountersV3PolicyResolutionError({
                      cause,
                    }),
                  ),
                )
              }
            })
          } catch (cause) {
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new MultipleCountersV3PolicyResolutionError({
                  cause,
                }),
              ),
            )
            return () => undefined
          }
        }),
        unsubscribe =>
          Effect.sync(() => {
            try {
              unsubscribe()
            } catch {
              // Ignore teardown errors
            }
          }),
      ),
    { bufferSize: 1, strategy: 'sliding' },
  )
  return Stream.runHead(resolutions).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new MultipleCountersV3PolicyResolutionError({
              cause: new Error('Policy-resolution observation ended early.'),
            }),
          ),
        onSome: Effect.succeed,
      }),
    ),
  )
}

/** Waits for the unique terminal authority outcome of one policy request. */
export const resolveMultipleCountersV3PolicyRequest = (
  database: InstantCounterDatabase,
  request: MultipleCountersV3PolicyRequestRecord,
): Effect.Effect<
  MultipleCountersV3PolicyResolutionRecordType,
  MultipleCountersV3PolicyResolutionError
> => {
  const policyResolutionPositionKey =
    makeMultipleCountersV3PolicyResolutionPositionKey(
      request.sessionId,
      request.policyRequestId,
    )
  return resolveMultipleCountersV3PolicyRequestSubscription(
    listener =>
      database.subscribeQuery(
        {
          multipleCountersV3PolicyRequestResolutions: {
            $: { where: { policyResolutionPositionKey } },
          },
        },
        listener,
      ),
    request,
  )
}

/** Host-owned identity vault and Instant database for one Processor config. */
export type MultipleCountersV3ProcessorConfigInput = Readonly<{
  database: InstantCounterDatabase
  environment: MultipleCountersV3LocalIdentityEnvironment
  instantAppId: string
  sessionEpochSeed: string
  store: MultipleCountersV3LocalIdentityStore
  subjectId: string
}>

/** Creates one Processor config from a host identity vault and Instant database. */
export const makeMultipleCountersV3ProcessorConfig = (
  input: MultipleCountersV3ProcessorConfigInput,
): Effect.Effect<MultipleCountersV3ProcessorConfig, unknown> =>
  Effect.gen(function* () {
    const secrets = yield* loadMultipleCountersV3OriginSecrets(
      input.store,
      input.environment,
    )
    const identity = yield* deriveMultipleCountersV3OriginIdentity(secrets)
    const processor = yield* makeMultipleCountersV3ProcessorSecret(
      input.environment,
    )
    const claimedAtMs = yield* loadMultipleCountersV3EnrollmentClaimTimestamp(
      input.store,
      input.environment,
      input,
    )
    const session = makeMultipleCountersV3SessionIdentity({
      instantAppId: input.instantAppId,
      sessionEpochSeed: input.sessionEpochSeed,
      subjectId: input.subjectId,
    })
    logMultipleCountersV3Debug('processor-config', {
      clientId: identity.clientId,
      clientIdLength: identity.clientId.length,
      originDeviceIdLength: identity.originDeviceId.length,
      sessionId: session.sessionId,
      sessionIdLength: session.sessionId.length,
      subjectId: input.subjectId,
      subjectIdLength: input.subjectId.length,
    })
    return {
      claimedAtMs,
      database: input.database,
      identities: makeMultipleCountersV3IdentitySources({
        actorId: input.subjectId,
        clientId: identity.clientId,
        environment: input.environment,
        sessionId: session.sessionId,
        store: input.store,
      }),
      instantAppId: input.instantAppId,
      processor,
      secrets,
      sessionEpochSeed: input.sessionEpochSeed,
      subjectId: input.subjectId,
    }
  })

/** Persists one immutable policy request through the authenticated Instant DB. */
export const appendMultipleCountersV3PolicyRequest = (
  database: InstantCounterDatabase,
  request: MultipleCountersV3PolicyRequestRecord,
): Effect.Effect<void, unknown> =>
  Effect.tryPromise({
    try: () => {
      const entity = database.tx.multipleCountersV3PolicyRequests[request.id]
      if (entity === undefined) {
        throw new Error('Expected the v3 policy request transaction entity.')
      }
      const { id: _id, ...fields } = request
      return database.transact(entity.create(fields)).then(Function.constVoid)
    },
    catch: cause => cause,
  })
