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
import {
  type MultipleCountersV3ProcessorConfig,
  deriveMultipleCountersV3OriginIdentity,
  loadMultipleCountersV3EnrollmentClaimTimestamp,
} from '../client/index.js'
import {
  loadMultipleCountersV3OriginSecrets,
  makeMultipleCountersV3IdentitySources,
  makeMultipleCountersV3ProcessorSecret,
} from '../client/localIdentity.js'
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
  browserMultipleCountersV3LocalIdentityEnvironment,
  makeBrowserMultipleCountersV3LocalIdentityStore,
} from './localIdentity.js'

const strictDecodeOptions: SchemaAST.ParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
}

/** An authenticated policy-resolution observation failed or decoded invalid data. */
export class MultipleCountersV3BrowserPolicyResolutionError extends Data.TaggedError(
  'MultipleCountersV3BrowserPolicyResolutionError',
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
export const resolveBrowserMultipleCountersV3PolicyRequestSubscription = (
  subscribe: MultipleCountersV3PolicyResolutionSubscription,
  request: MultipleCountersV3PolicyRequestRecord,
): Effect.Effect<
  MultipleCountersV3PolicyResolutionRecordType,
  MultipleCountersV3BrowserPolicyResolutionError
> => {
  const resolutions = Stream.callback<
    MultipleCountersV3PolicyResolutionRecordType,
    MultipleCountersV3BrowserPolicyResolutionError
  >(
    queue =>
      Effect.acquireRelease(
        Effect.try({
          try: () =>
            subscribe(response => {
              try {
                const decoded = S.decodeUnknownSync(
                  S.Array(MultipleCountersV3PolicyResolutionRecord),
                  strictDecodeOptions,
                )(policyResolutionRows(response))
                if (Array.isEmptyArray(decoded)) {
                  return
                }
                if (Array.isNonEmptyArray(Array.drop(decoded, 1))) {
                  throw new Error(
                    'Instant returned duplicate policy-resolution rows.',
                  )
                }
                const maybeResolution = Array.head(decoded)
                if (
                  Option.isNone(maybeResolution) ||
                  !resolutionMatchesRequest(maybeResolution.value, request)
                ) {
                  throw new Error(
                    'Instant returned a policy resolution for a different immutable request.',
                  )
                }
                Queue.offerUnsafe(queue, maybeResolution.value)
              } catch (cause) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new MultipleCountersV3BrowserPolicyResolutionError({
                      cause,
                    }),
                  ),
                )
              }
            }),
          catch: cause =>
            new MultipleCountersV3BrowserPolicyResolutionError({ cause }),
        }),
        unsubscribe =>
          Effect.try({
            try: unsubscribe,
            catch: cause =>
              new MultipleCountersV3BrowserPolicyResolutionError({ cause }),
          }),
      ).pipe(Effect.flatMap(() => Effect.never)),
    { bufferSize: 1, strategy: 'sliding' },
  )
  return Stream.runHead(resolutions).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new MultipleCountersV3BrowserPolicyResolutionError({
              cause: new Error('Policy-resolution observation ended early.'),
            }),
          ),
        onSome: Effect.succeed,
      }),
    ),
  )
}

/** Waits for the unique terminal authority outcome of one policy request. */
export const resolveBrowserMultipleCountersV3PolicyRequest = (
  database: InstantCounterDatabase,
  request: MultipleCountersV3PolicyRequestRecord,
): Effect.Effect<
  MultipleCountersV3PolicyResolutionRecordType,
  MultipleCountersV3BrowserPolicyResolutionError
> => {
  const policyResolutionPositionKey =
    makeMultipleCountersV3PolicyResolutionPositionKey(
      request.sessionId,
      request.policyRequestId,
    )
  return resolveBrowserMultipleCountersV3PolicyRequestSubscription(
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

/** Creates one browser Processor config from IndexedDB-held keys and sequences. */
export const makeBrowserMultipleCountersV3ProcessorConfig = (
  input: Readonly<{
    database: InstantCounterDatabase
    instantAppId: string
    sessionEpochSeed: string
    subjectId: string
  }>,
): Effect.Effect<MultipleCountersV3ProcessorConfig, unknown> =>
  Effect.gen(function* () {
    const environment = browserMultipleCountersV3LocalIdentityEnvironment()
    const store = makeBrowserMultipleCountersV3LocalIdentityStore()
    const secrets = yield* loadMultipleCountersV3OriginSecrets(
      store,
      environment,
    )
    const identity = yield* deriveMultipleCountersV3OriginIdentity(secrets)
    const processor = yield* makeMultipleCountersV3ProcessorSecret(environment)
    const claimedAtMs = yield* loadMultipleCountersV3EnrollmentClaimTimestamp(
      store,
      environment,
      input,
    )
    const session = makeMultipleCountersV3SessionIdentity({
      instantAppId: input.instantAppId,
      sessionEpochSeed: input.sessionEpochSeed,
      subjectId: input.subjectId,
    })
    return {
      claimedAtMs,
      database: input.database,
      identities: makeMultipleCountersV3IdentitySources({
        actorId: input.subjectId,
        clientId: identity.clientId,
        environment,
        sessionId: session.sessionId,
        store,
      }),
      instantAppId: input.instantAppId,
      processor,
      secrets,
      sessionEpochSeed: input.sessionEpochSeed,
      subjectId: input.subjectId,
    }
  })

/** Persists one immutable policy request through the authenticated browser DB. */
export const appendBrowserMultipleCountersV3PolicyRequest = (
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
