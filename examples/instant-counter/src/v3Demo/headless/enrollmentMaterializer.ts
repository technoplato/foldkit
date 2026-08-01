import { MultipleCountersProgram } from 'counters-core-example'
import {
  Array,
  Data,
  Effect,
  Option,
  Order,
  Schema as S,
  SchemaAST,
  Stream,
} from 'effect'
import { Synchronization } from 'foldkit'

import {
  InstantV3ActiveOriginPolicyDecision,
  InstantV3OriginEnrollmentClaimRecord,
  type InstantV3OriginEnrollmentClaimRecord as InstantV3OriginEnrollmentClaimRecordType,
  InstantV3OriginPolicyDecisionRecord,
  type InstantV3OriginPolicyDecisionRecord as InstantV3OriginPolicyDecisionRecordType,
  InstantV3ProgramSessionRecord,
  type InstantV3ProgramSessionRecord as InstantV3ProgramSessionRecordType,
  InstantV3TimestampMs,
  type V3ProgramAuthorityStoreService,
  type V3ProgramStoreAppendError,
  type V3ProgramStoreScope,
  type V3ProgramStoreWriteDisposition,
  instantV3OriginPolicyProtocolVersion,
  instantV3ProgramProtocolVersion,
  makeInstantV3OriginPolicyDecisionPositionKey,
  makeInstantV3ProgramSessionLifecyclePositionKey,
  verifyOriginEnrollmentClaim,
} from '@foldkit/instant'

import {
  makeMultipleCountersV3EntityId,
  makeMultipleCountersV3OriginPolicyId,
  makeMultipleCountersV3SessionIdentity,
} from '../shared/identity.js'

/** A claim failed strict decoding or cryptographic enrollment verification. */
export class MultipleCountersV3EnrollmentClaimError extends Data.TaggedError(
  'MultipleCountersV3EnrollmentClaimError',
)<{
  readonly cause: unknown
  readonly stage:
    | 'AuthorityTime'
    | 'Decode'
    | 'PolicyState'
    | 'SessionState'
    | 'Verify'
}> {}

/** Every typed failure surfaced while materializing one verified enrollment. */
export type MultipleCountersV3EnrollmentMaterializationError =
  | MultipleCountersV3EnrollmentClaimError
  | V3ProgramStoreAppendError

/** Inputs fixed for one trusted Multiple Counters authority deployment. */
export type MultipleCountersV3EnrollmentMaterializerConfig = Readonly<{
  authorityProcessorId: string
  onRejectedClaim?: (
    error: MultipleCountersV3EnrollmentClaimError,
    input: unknown,
  ) => void
  now: () => InstantV3TimestampMs
  sessionEpochSeed: string
  store: V3ProgramAuthorityStoreService
}>

/** Server-confirmed writes produced for one verified enrollment claim. */
export type MultipleCountersV3EnrollmentMaterialization = Readonly<{
  originPolicyDecision: InstantV3OriginPolicyDecisionRecordType
  originPolicyDisposition: V3ProgramStoreWriteDisposition
  programSession: InstantV3ProgramSessionRecordType
  programSessionDisposition: V3ProgramStoreWriteDisposition | 'Existing'
}>

const strictDecodeOptions: SchemaAST.ParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
}

/** Builds the exact Multiple Counters store scope for one authenticated subject. */
export const makeMultipleCountersV3ProgramScope = (
  input: Readonly<{
    instantAppId: string
    sessionEpochSeed: string
    subjectId: string
  }>,
): V3ProgramStoreScope => {
  const identity = makeMultipleCountersV3SessionIdentity(input)
  return {
    appSubjectDigest: identity.appSubjectDigest,
    instantAppId: input.instantAppId,
    programId: MultipleCountersProgram.id,
    programVersion: MultipleCountersProgram.version,
    protocolVersion: instantV3ProgramProtocolVersion,
    sessionEpochId: identity.sessionEpochId,
    sessionId: identity.sessionId,
    subjectId: input.subjectId,
  }
}

/** Constructs the deterministic generation-one Active origin-policy decision. */
export const makeMultipleCountersV3ActiveOriginPolicy = (
  claim: InstantV3OriginEnrollmentClaimRecordType,
  authorityProcessorId: string,
  decidedAtMs: InstantV3TimestampMs,
): InstantV3OriginPolicyDecisionRecordType => {
  const originPolicyId = makeMultipleCountersV3OriginPolicyId(
    claim.enrollmentClaimId,
  )
  const positionKey = makeInstantV3OriginPolicyDecisionPositionKey(
    claim.instantAppId,
    claim.subjectId,
    instantV3ProgramProtocolVersion,
    originPolicyId,
    1,
  )
  return InstantV3OriginPolicyDecisionRecord.make({
    decidedAtMs,
    decidingProcessorId: authorityProcessorId,
    decision: InstantV3ActiveOriginPolicyDecision.make({}),
    decisionId: positionKey,
    decisionState: 'Active',
    enrollmentClaimId: claim.enrollmentClaimId,
    enrollmentClaimPositionKey: claim.enrollmentClaimPositionKey,
    generation: 1,
    id: makeMultipleCountersV3EntityId('OriginPolicyDecision', positionKey),
    instantAppId: claim.instantAppId,
    originDeviceId: claim.originDeviceId,
    originPolicyId,
    positionKey,
    previousDecisionId: null,
    protocolVersion: instantV3ProgramProtocolVersion,
    subjectId: claim.subjectId,
  })
}

/** Constructs the deterministic generation-one Mirror Program session. */
export const makeMultipleCountersV3MirrorSession = (
  claim: InstantV3OriginEnrollmentClaimRecordType,
  config: Readonly<{
    authorityProcessorId: string
    createdAtMs: InstantV3TimestampMs
    sessionEpochSeed: string
  }>,
): InstantV3ProgramSessionRecordType => {
  const identity = makeMultipleCountersV3SessionIdentity({
    instantAppId: claim.instantAppId,
    sessionEpochSeed: config.sessionEpochSeed,
    subjectId: claim.subjectId,
  })
  const lifecyclePositionKey = makeInstantV3ProgramSessionLifecyclePositionKey(
    identity.sessionId,
    1,
  )
  return InstantV3ProgramSessionRecord.make({
    appSubjectDigest: identity.appSubjectDigest,
    authorityProcessorId: config.authorityProcessorId,
    createdAtMs: config.createdAtMs,
    id: makeMultipleCountersV3EntityId('ProgramSession', lifecyclePositionKey),
    instantAppId: claim.instantAppId,
    lifecycleGeneration: 1,
    lifecyclePositionKey,
    lifecycleState: 'Active',
    originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
    previousLifecyclePositionKey: null,
    processorRoomId: identity.processorRoomId,
    programId: MultipleCountersProgram.id,
    programVersion: MultipleCountersProgram.version,
    protocolVersion: instantV3ProgramProtocolVersion,
    sessionEpochId: identity.sessionEpochId,
    sessionId: identity.sessionId,
    sessionPolicy: Synchronization.SessionPolicy.make({
      generation: 1,
      mode: Synchronization.Mirror.make({}),
    }),
    subjectId: claim.subjectId,
  })
}

const currentProgramSession = (
  sessions: ReadonlyArray<InstantV3ProgramSessionRecordType>,
): Option.Option<InstantV3ProgramSessionRecordType> =>
  Array.head(
    Array.sort(
      sessions,
      Order.mapInput(
        Order.flip(Order.Number),
        (session: InstantV3ProgramSessionRecordType) =>
          session.lifecycleGeneration,
      ),
    ),
  )

const readCurrentProgramSession = (
  store: V3ProgramAuthorityStoreService,
  scope: V3ProgramStoreScope,
) =>
  Stream.runHead(store.serverConfirmed.observeProgramSessions(scope)).pipe(
    Effect.map(Option.flatMap(sessions => currentProgramSession(sessions))),
  )

const currentOriginPolicy = (
  decisions: ReadonlyArray<InstantV3OriginPolicyDecisionRecordType>,
  originPolicyId: string,
): Option.Option<InstantV3OriginPolicyDecisionRecordType> =>
  Array.head(
    Array.sort(
      Array.filter(
        decisions,
        decision => decision.originPolicyId === originPolicyId,
      ),
      Order.mapInput(
        Order.flip(Order.Number),
        (decision: InstantV3OriginPolicyDecisionRecordType) =>
          decision.generation,
      ),
    ),
  )

const readCurrentOriginPolicy = (
  store: V3ProgramAuthorityStoreService,
  claim: InstantV3OriginEnrollmentClaimRecordType,
  originPolicyId: string,
) =>
  Stream.runHead(
    store.serverConfirmed.observeOriginPolicyDecisions({
      instantAppId: claim.instantAppId,
      protocolVersion: claim.protocolVersion,
      subjectId: claim.subjectId,
    }),
  ).pipe(
    Effect.map(
      Option.flatMap(decisions =>
        currentOriginPolicy(decisions, originPolicyId),
      ),
    ),
  )

const originPolicyMatchesClaim = (
  decision: InstantV3OriginPolicyDecisionRecordType,
  claim: InstantV3OriginEnrollmentClaimRecordType,
  authorityProcessorId: string,
): boolean =>
  decision.decidingProcessorId === authorityProcessorId &&
  decision.enrollmentClaimId === claim.enrollmentClaimId &&
  decision.enrollmentClaimPositionKey === claim.enrollmentClaimPositionKey &&
  decision.instantAppId === claim.instantAppId &&
  decision.originDeviceId === claim.originDeviceId &&
  decision.protocolVersion === claim.protocolVersion &&
  decision.subjectId === claim.subjectId

const sessionMatchesCandidate = (
  session: InstantV3ProgramSessionRecordType,
  candidate: InstantV3ProgramSessionRecordType,
): boolean =>
  session.appSubjectDigest === candidate.appSubjectDigest &&
  session.authorityProcessorId === candidate.authorityProcessorId &&
  session.instantAppId === candidate.instantAppId &&
  session.originPolicyProtocolVersion ===
    candidate.originPolicyProtocolVersion &&
  session.processorRoomId === candidate.processorRoomId &&
  session.programId === candidate.programId &&
  session.programVersion === candidate.programVersion &&
  session.protocolVersion === candidate.protocolVersion &&
  session.sessionEpochId === candidate.sessionEpochId &&
  session.sessionId === candidate.sessionId &&
  session.subjectId === candidate.subjectId

/** Verifies one claim, activates its origin, and ensures one shared Mirror session. */
export const materializeMultipleCountersV3Enrollment = (
  input: unknown,
  config: MultipleCountersV3EnrollmentMaterializerConfig,
): Effect.Effect<
  MultipleCountersV3EnrollmentMaterialization,
  MultipleCountersV3EnrollmentMaterializationError
> =>
  Effect.gen(function* () {
    const decodedClaim = yield* S.decodeUnknownEffect(
      InstantV3OriginEnrollmentClaimRecord,
      strictDecodeOptions,
    )(input).pipe(
      Effect.mapError(
        cause =>
          new MultipleCountersV3EnrollmentClaimError({
            cause,
            stage: 'Decode',
          }),
      ),
    )
    const claim = yield* verifyOriginEnrollmentClaim(decodedClaim, {
      instantAppId: decodedClaim.instantAppId,
      subjectId: decodedClaim.subjectId,
    }).pipe(
      Effect.mapError(
        cause =>
          new MultipleCountersV3EnrollmentClaimError({
            cause,
            stage: 'Verify',
          }),
      ),
    )
    const authorityTime = yield* Effect.try({
      try: () => InstantV3TimestampMs.make(config.now()),
      catch: cause =>
        new MultipleCountersV3EnrollmentClaimError({
          cause,
          stage: 'AuthorityTime',
        }),
    })
    const originPolicyId = makeMultipleCountersV3OriginPolicyId(
      claim.enrollmentClaimId,
    )
    const maybeExistingOriginPolicy = yield* readCurrentOriginPolicy(
      config.store,
      claim,
      originPolicyId,
    )
    const originPolicyDecision = Option.getOrElse(
      maybeExistingOriginPolicy,
      () =>
        makeMultipleCountersV3ActiveOriginPolicy(
          claim,
          config.authorityProcessorId,
          authorityTime,
        ),
    )
    if (
      originPolicyDecision.decisionState !== 'Active' ||
      !originPolicyMatchesClaim(
        originPolicyDecision,
        claim,
        config.authorityProcessorId,
      )
    ) {
      return yield* new MultipleCountersV3EnrollmentClaimError({
        cause: new Error(
          'The existing enrollment policy is non-active or belongs to different immutable provenance.',
        ),
        stage: 'PolicyState',
      })
    }
    const originPolicyOutcome =
      yield* config.store.appendServerConfirmedOriginPolicyDecision(
        originPolicyDecision,
      )
    const candidateSession = makeMultipleCountersV3MirrorSession(claim, {
      authorityProcessorId: config.authorityProcessorId,
      createdAtMs: authorityTime,
      sessionEpochSeed: config.sessionEpochSeed,
    })
    const scope = makeMultipleCountersV3ProgramScope({
      instantAppId: claim.instantAppId,
      sessionEpochSeed: config.sessionEpochSeed,
      subjectId: claim.subjectId,
    })
    const maybeExistingSession = yield* readCurrentProgramSession(
      config.store,
      scope,
    )
    if (Option.isSome(maybeExistingSession)) {
      if (
        !sessionMatchesCandidate(maybeExistingSession.value, candidateSession)
      ) {
        return yield* new MultipleCountersV3EnrollmentClaimError({
          cause: new Error(
            'The existing Program session belongs to different immutable authority provenance.',
          ),
          stage: 'SessionState',
        })
      }
      return {
        originPolicyDecision,
        originPolicyDisposition: originPolicyOutcome.disposition,
        programSession: maybeExistingSession.value,
        programSessionDisposition: 'Existing',
      }
    } else {
      const sessionOutcome =
        yield* config.store.appendServerConfirmedProgramSession(
          candidateSession,
        )
      return {
        originPolicyDecision,
        originPolicyDisposition: originPolicyOutcome.disposition,
        programSession: candidateSession,
        programSessionDisposition: sessionOutcome.disposition,
      }
    }
  })

/** Continuously materializes strictly ordered claims without stopping on invalid proof. */
export const runMultipleCountersV3EnrollmentMaterializer = <StreamError>(
  claims: Stream.Stream<
    ReadonlyArray<InstantV3OriginEnrollmentClaimRecordType>,
    StreamError
  >,
  config: MultipleCountersV3EnrollmentMaterializerConfig,
): Effect.Effect<never, StreamError | V3ProgramStoreAppendError> =>
  Stream.runForEach(claims, records =>
    Effect.forEach(
      Array.sort(
        records,
        Order.combine(
          Order.mapInput(
            Order.Number,
            (record: InstantV3OriginEnrollmentClaimRecordType) =>
              record.claimedAtMs,
          ),
          Order.mapInput(
            Order.String,
            (record: InstantV3OriginEnrollmentClaimRecordType) =>
              record.enrollmentClaimId,
          ),
        ),
      ),
      record =>
        materializeMultipleCountersV3Enrollment(record, config).pipe(
          Effect.catchTag('MultipleCountersV3EnrollmentClaimError', error =>
            Effect.sync(() => {
              config.onRejectedClaim?.(error, record)
            }),
          ),
        ),
      { concurrency: 1, discard: true },
    ),
  ).pipe(Effect.flatMap(() => Effect.never))
