import {
  Array,
  Data,
  Deferred,
  Effect,
  Fiber,
  Option,
  Order,
  Ref,
  Result,
  Schema as S,
  Stream,
  SubscriptionRef,
  SynchronizedRef,
} from 'effect'
import { TestClock } from 'effect/testing'
import { Program, Synchronization } from 'foldkit'
import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  OriginEffectResultSigningRecord,
  deriveOriginClientKeyPair,
  deriveOriginDeviceKeyPair,
  deriveOriginProcessorKeyPair,
  digestOriginOrdinaryMessageProposalProof,
  encodeOriginClientCertificateJson,
  encodeOriginProcessorCertificateJson,
  makeOriginClientCertificate,
  makeOriginProcessorCertificate,
  signOriginEffectResultProposal,
} from '../originProof/index.js'
import { makeV3InMemoryProgramStores } from '../v3InMemoryProgramStore/index.js'
import {
  V3ProgramStoreError,
  V3ProgramStoreScope,
  type V3ProgramStoreService,
  v3EnqueuedTransactionOutcome,
  v3ServerConfirmedTransactionOutcome,
} from '../v3ProgramStore/index.js'
import {
  InstantV3AcceptedEffectResultOccurrenceRecord,
  type InstantV3AcceptedMessageOccurrenceRecord,
  InstantV3AcceptedMessageProposalResolutionRecord,
  InstantV3AcceptedOrdinaryMessageOccurrenceRecord,
  type InstantV3MessageProposalRecord,
  type InstantV3MessageProposalResolutionRecord,
  InstantV3OrdinaryMessageProposalRecord,
  InstantV3ProgramSessionIdentity,
  InstantV3ProgramSessionRecord,
  InstantV3RejectedMessageProposalResolutionRecord,
  instantV3OriginPolicyProtocolVersion,
  instantV3ProgramProtocolVersion,
  makeInstantV3AcceptedActorSequencePositionKey,
  makeInstantV3AcceptedEffectIdempotencyPositionKey,
  makeInstantV3AcceptedEffectRequestResultPositionKey,
  makeInstantV3AcceptedMessageIdempotencyPositionKey,
  makeInstantV3AcceptedOccurrencePositionKey,
  makeInstantV3AcceptedProposalPositionKey,
  makeInstantV3AcceptedSequencePositionKey,
  makeInstantV3EffectPlacementPositionKey,
  makeInstantV3MessageProposalActorSequencePositionKey,
  makeInstantV3MessageProposalEffectIdempotencyPositionKey,
  makeInstantV3MessageProposalEffectRequestResultPositionKey,
  makeInstantV3MessageProposalMessageIdempotencyPositionKey,
  makeInstantV3MessageProposalOccurrencePositionKey,
  makeInstantV3MessageProposalPositionKey,
  makeInstantV3MessageProposalResolutionPositionKey,
  makeInstantV3ProgramSessionLifecyclePositionKey,
  printInstantV3ProgramSessionId,
} from '../v3Schema/index.js'
import { finishCurrentObserverGeneration } from './observerLifecycle.js'
import {
  V3SharedProgramAcceptedHistoryError,
  V3SharedProgramAcceptedRoutingError,
  V3SharedProgramIdentityError,
  V3SharedProgramInvocationFacts,
  type V3SharedProgramMessageProtocol,
  V3SharedProgramObservationReadinessError,
  type V3SharedProgramOrigin,
  V3SharedProgramPersistenceError,
  type V3SharedProgramProcessor,
  type V3SharedProgramProcessorSnapshot,
  V3SharedProgramSessionPolicyUnavailable,
  V3SharedProgramSynchronizationPreflightError,
  V3SharedProgramUpdateError,
  makeV3SharedProgramMessageProtocol,
  makeV3SharedProgramProcessor,
} from './v3SharedProgramProcessor.js'

const Navigation = S.Literals(['List', 'Detail'])
const DeletePrompt = S.Literals(['Closed', 'Open'])
const Model = S.Struct({
  count: S.Int.check(S.isGreaterThanOrEqualTo(0)),
  deletePrompt: DeletePrompt,
  navigation: Navigation,
})
type Model = typeof Model.Type

const Incremented = S.TaggedStruct('Incremented', {})
const OpenedDetail = S.TaggedStruct('OpenedDetail', {})
const OpenedDeletePrompt = S.TaggedStruct('OpenedDeletePrompt', {})
const CancelledDelete = S.TaggedStruct('CancelledDelete', {})
const ConfirmedDelete = S.TaggedStruct('ConfirmedDelete', {})
const CompletedEffect = S.TaggedStruct('CompletedEffect', {})
const Message = S.Union([
  Incremented,
  OpenedDetail,
  OpenedDeletePrompt,
  CancelledDelete,
  ConfirmedDelete,
  CompletedEffect,
])
type Message = typeof Message.Type

const ClickedIncrement = S.TaggedStruct('ClickedIncrement', {
  occurrenceId: S.String,
})
const ClickedOpenDetail = S.TaggedStruct('ClickedOpenDetail', {
  occurrenceId: S.String,
})
const ClickedOpenDeletePrompt = S.TaggedStruct('ClickedOpenDeletePrompt', {
  occurrenceId: S.String,
})
const ClickedCancelDelete = S.TaggedStruct('ClickedCancelDelete', {
  occurrenceId: S.String,
})
const ClickedConfirmDelete = S.TaggedStruct('ClickedConfirmDelete', {
  occurrenceId: S.String,
})
const GotEffectResult = S.TaggedStruct('GotEffectResult', {
  occurrenceId: S.String,
})
const Claim = S.Union([
  ClickedIncrement,
  ClickedOpenDetail,
  ClickedOpenDeletePrompt,
  ClickedCancelDelete,
  ClickedConfirmDelete,
  GotEffectResult,
])
type Claim = typeof Claim.Type

class ClaimDecodeError extends Data.TaggedError('ClaimDecodeError')<{
  readonly cause: unknown
}> {}

class ClaimResolutionError extends Data.TaggedError('ClaimResolutionError')<{
  readonly reason: string
}> {}

const commandExecutions = { value: 0 }

const synchronization: Program.ProgramSynchronization<Model, Message> = {
  messageCategory: message =>
    message._tag === 'OpenedDetail' ||
    message._tag === 'OpenedDeletePrompt' ||
    message._tag === 'CancelledDelete'
      ? 'Navigation'
      : 'Domain',
  projectDomain: model => ({ count: model.count }),
}

const program = Program.make<Model, Message>({
  id: 'v3counter',
  version: 1,
  Model,
  Message,
  init: () => [
    Model.make({ count: 0, deletePrompt: 'Closed', navigation: 'List' }),
    [],
  ],
  synchronization,
  update: (model, message) => {
    if (message._tag === 'Incremented') {
      return [{ ...model, count: model.count + 1 }, []]
    } else if (message._tag === 'OpenedDetail') {
      return [{ ...model, navigation: 'Detail' }, []]
    } else if (message._tag === 'OpenedDeletePrompt') {
      return [{ ...model, deletePrompt: 'Open' }, []]
    } else if (message._tag === 'CancelledDelete') {
      return [{ ...model, deletePrompt: 'Closed' }, []]
    } else if (message._tag === 'ConfirmedDelete') {
      return [
        { ...model, count: 0, deletePrompt: 'Closed', navigation: 'List' },
        [],
      ]
    } else {
      return [
        { ...model, count: model.count + 10 },
        [
          {
            name: 'ProveCommandsStayInert',
            effect: Effect.sync(() => {
              commandExecutions.value += 1
              return CompletedEffect.make({})
            }),
          },
        ],
      ]
    }
  },
})

const decodeClaim = (input: unknown): Result.Result<Claim, ClaimDecodeError> =>
  Result.mapError(
    S.decodeUnknownResult(Claim, { onExcessProperty: 'error' })(input),
    cause => new ClaimDecodeError({ cause }),
  )

const resolveClaim = (
  model: Model,
  claim: Claim,
  facts: unknown,
): Result.Result<Message, ClaimResolutionError> => {
  const decodedFacts = S.decodeUnknownResult(V3SharedProgramInvocationFacts, {
    onExcessProperty: 'error',
  })(facts)
  if (Result.isFailure(decodedFacts)) {
    return Result.fail(
      new ClaimResolutionError({ reason: 'InvalidInvocationFacts' }),
    )
  }
  if (decodedFacts.success.occurrenceId !== claim.occurrenceId) {
    return Result.fail(
      new ClaimResolutionError({ reason: 'OccurrenceMismatch' }),
    )
  }
  if (claim._tag === 'ClickedIncrement') {
    return Result.succeed(Incremented.make({}))
  } else if (claim._tag === 'ClickedOpenDetail') {
    return Result.succeed(OpenedDetail.make({}))
  } else if (claim._tag === 'ClickedOpenDeletePrompt') {
    return Result.succeed(OpenedDeletePrompt.make({}))
  } else if (claim._tag === 'ClickedCancelDelete') {
    return Result.succeed(CancelledDelete.make({}))
  } else if (claim._tag === 'GotEffectResult') {
    return Result.succeed(CompletedEffect.make({}))
  } else if (model.deletePrompt === 'Open') {
    return Result.succeed(ConfirmedDelete.make({}))
  } else {
    return Result.fail(new ClaimResolutionError({ reason: 'DeleteIsStale' }))
  }
}

const admission = Program.makeMessageAdmission({
  program,
  Claim,
  decodeClaim,
  occurrenceId: claim => claim.occurrenceId,
  resolve: resolveClaim,
})

const messageProtocol = makeV3SharedProgramMessageProtocol({
  Message,
  envelopeVersion: 1,
  eventMetadata: message => ({
    eventId: `counter.${message._tag}`,
    eventVersion: 1,
  }),
})

const appSubjectDigest = 'a'.repeat(64)
const sessionEpochId = 'e'.repeat(22)
const sessionIdentity = InstantV3ProgramSessionIdentity.make({
  appSubjectDigest,
  originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
  programId: program.id,
  programVersion: program.version,
  sessionEpochId,
})
const scope = V3ProgramStoreScope.make({
  appSubjectDigest,
  instantAppId: 'instant-app-test',
  programId: program.id,
  programVersion: program.version,
  protocolVersion: instantV3ProgramProtocolVersion,
  sessionEpochId,
  sessionId: printInstantV3ProgramSessionId(sessionIdentity),
  subjectId: 'subject-test',
})
const initialSessionPolicy = Synchronization.SessionPolicy.make({
  generation: 0,
  mode: Synchronization.Mirror.make({}),
})
const activeProgramSession = InstantV3ProgramSessionRecord.make({
  ...scope,
  authorityProcessorId: 'authority-test',
  createdAtMs: 1_753_824_999_000,
  id: '00000000-0000-4000-8000-000000000699',
  lifecycleGeneration: 1,
  lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
    scope.sessionId,
    1,
  ),
  lifecycleState: 'Active',
  originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
  previousLifecyclePositionKey: null,
  processorRoomId: 'processor-room-test',
  sessionPolicy: initialSessionPolicy,
})

const makeReadyInMemoryProgramStores = Effect.gen(function* () {
  const stores = yield* makeV3InMemoryProgramStores()
  yield* stores.authority.appendServerConfirmedProgramSession(
    activeProgramSession,
  )
  return stores
})

const nextUuid = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const makeOrigin = Effect.gen(function* () {
  const device = yield* deriveOriginDeviceKeyPair(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
  )
  const client = yield* deriveOriginClientKeyPair(
    Uint8Array.from({ length: 32 }, (_, index) => index + 33),
  )
  const processor = yield* deriveOriginProcessorKeyPair(
    Uint8Array.from({ length: 32 }, (_, index) => index + 65),
  )
  const clientCertificate = yield* makeOriginClientCertificate(
    {
      clientId: client.clientId,
      instantAppId: scope.instantAppId,
      originDeviceId: device.originDeviceId,
      subjectId: scope.subjectId,
    },
    device.secretKey,
  )
  const processorCertificate = yield* makeOriginProcessorCertificate(
    {
      clientId: client.clientId,
      instantAppId: scope.instantAppId,
      originDeviceId: device.originDeviceId,
      originPolicyGeneration: 1,
      originPolicyId: 'origin-policy-test',
      originatingProcessorId: processor.originatingProcessorId,
      programId: scope.programId,
      programVersion: scope.programVersion,
      protocolVersion: scope.protocolVersion,
      sessionId: scope.sessionId,
      subjectId: scope.subjectId,
    },
    client.secretKey,
  )
  return {
    actorId: 'actor-test',
    clientId: client.clientId,
    originClientCertificateJson:
      yield* encodeOriginClientCertificateJson(clientCertificate),
    originDeviceId: device.originDeviceId,
    originPolicyGeneration: 1,
    originPolicyId: 'origin-policy-test',
    originProcessorCertificateJson:
      yield* encodeOriginProcessorCertificateJson(processorCertificate),
    originatingProcessorId: processor.originatingProcessorId,
    processorSecretKey: processor.secretKey,
  } satisfies V3SharedProgramOrigin
})

const makeIdentitySources = Effect.gen(function* () {
  const actorSequence = yield* Ref.make(0)
  const entitySequence = yield* Ref.make(100)
  const messageSequence = yield* Ref.make(0)
  const occurrenceSequence = yield* Ref.make(0)
  const proposalSequence = yield* Ref.make(0)
  const timestamp = yield* Ref.make(1_753_825_000_000)
  return {
    nextActorSequence: Ref.updateAndGet(actorSequence, value => value + 1),
    nextEntityId: Ref.updateAndGet(entitySequence, value => value + 1).pipe(
      Effect.map(nextUuid),
    ),
    nextMessageIdempotencyKey: Ref.updateAndGet(
      messageSequence,
      value => value + 1,
    ).pipe(Effect.map(value => `message-${value.toString()}`)),
    nextOccurrenceId: Ref.updateAndGet(
      occurrenceSequence,
      value => value + 1,
    ).pipe(Effect.map(value => `occurrence-${value.toString()}`)),
    nextProposalId: Ref.updateAndGet(proposalSequence, value => value + 1).pipe(
      Effect.map(value => `proposal-${value.toString()}`),
    ),
    now: Ref.updateAndGet(timestamp, value => value + 1),
  }
})

type Processor = V3SharedProgramProcessor<Model, Claim>

const makeProcessor = (
  store: V3ProgramStoreService,
  origin: V3SharedProgramOrigin,
  protocol: V3SharedProgramMessageProtocol<Message> = messageProtocol,
  selectedAdmission = admission,
  initialObservationReadinessTimeoutMs?: number,
) =>
  Effect.flatMap(makeIdentitySources, identities =>
    makeV3SharedProgramProcessor({
      admission: selectedAdmission,
      identities,
      ...(initialObservationReadinessTimeoutMs === undefined
        ? {}
        : { initialObservationReadinessTimeoutMs }),
      messageProtocol: protocol,
      origin,
      scope,
      store,
    }),
  )

const waitForSnapshot = (
  processor: Processor,
  predicate: (snapshot: V3SharedProgramProcessorSnapshot<Model>) => boolean,
  attempts = 200,
): Effect.Effect<V3SharedProgramProcessorSnapshot<Model>> =>
  Effect.gen(function* () {
    const snapshot = yield* processor.readSnapshot
    if (predicate(snapshot) || attempts <= 0) {
      return snapshot
    } else {
      yield* Effect.yieldNow
      return yield* waitForSnapshot(processor, predicate, attempts - 1)
    }
  })

const connectReady = (processor: Processor): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* processor.connect
    yield* waitForSnapshot(processor, current =>
      Option.isSome(current.activeSessionPolicy),
    )
  })

const snapshotAfter = (
  processor: Processor,
  change: Effect.Effect<void>,
): Effect.Effect<V3SharedProgramProcessorSnapshot<Model>> =>
  Effect.gen(function* () {
    const nextSnapshot = yield* Effect.forkChild(
      Stream.runHead(Stream.drop(processor.snapshots, 1)),
    )
    yield* Effect.yieldNow
    yield* change
    const maybeSnapshot = yield* Fiber.join(nextSnapshot)
    if (Option.isSome(maybeSnapshot)) {
      return maybeSnapshot.value
    } else {
      return yield* Effect.die('Processor snapshots ended unexpectedly.')
    }
  })

const makeAccepted = (
  proposal: InstantV3OrdinaryMessageProposalRecord,
  acceptedSequence: number,
  audience: Synchronization.Audience,
  sessionPolicy: Synchronization.SessionPolicy,
  acceptedEntityId: string,
  resolutionEntityId: string,
) =>
  Effect.gen(function* () {
    const message = yield* messageProtocol.decodeProposed(proposal)
    const messageCategory = program.synchronization?.messageCategory(message)
    if (messageCategory === undefined) {
      return yield* Effect.die('Missing synchronization metadata')
    }
    const acceptedAtMs = proposal.createdAtMs + acceptedSequence
    const envelopeJson = yield* messageProtocol.acceptEnvelope(proposal, {
      acceptedAtMs,
      acceptedSequence,
      acceptingProcessorId: 'authority-test',
      audience,
      messageCategory,
      policyGeneration: sessionPolicy.generation,
      sessionPolicy,
    })
    const occurrence = InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make({
      ...proposal,
      acceptedAtMs,
      acceptedSequence,
      acceptedSequencePositionKey: makeInstantV3AcceptedSequencePositionKey(
        scope.sessionId,
        acceptedSequence,
      ),
      acceptingProcessorId: 'authority-test',
      actorSequencePositionKey: makeInstantV3AcceptedActorSequencePositionKey(
        scope.sessionId,
        proposal.actorId,
        proposal.clientId,
        proposal.actorSequence,
      ),
      audience,
      causationId: proposal.causationOccurrenceId,
      envelopeJson,
      id: acceptedEntityId,
      messageCategory,
      messageIdempotencyPositionKey:
        makeInstantV3AcceptedMessageIdempotencyPositionKey(
          scope.sessionId,
          proposal.messageIdempotencyKey,
        ),
      occurrencePositionKey: makeInstantV3AcceptedOccurrencePositionKey(
        scope.sessionId,
        proposal.occurrenceId,
      ),
      policyGeneration: sessionPolicy.generation,
      positionKey: makeInstantV3AcceptedSequencePositionKey(
        scope.sessionId,
        acceptedSequence,
      ),
      proposedEnvelopeJson: proposal.envelopeJson,
      proposalPositionKey: makeInstantV3AcceptedProposalPositionKey(
        scope.sessionId,
        proposal.proposalId,
      ),
      sessionPolicy,
    })
    const resolution = InstantV3AcceptedMessageProposalResolutionRecord.make({
      ...scope,
      acceptedAtMs,
      acceptedMessageOccurrenceId: occurrence.id,
      acceptedMessageOccurrencePositionKey: occurrence.positionKey,
      acceptingProcessorId: occurrence.acceptingProcessorId,
      actorId: proposal.actorId,
      actorSequence: proposal.actorSequence,
      clientId: proposal.clientId,
      id: resolutionEntityId,
      originDeviceId: proposal.originDeviceId,
      originatingProcessorId: proposal.originatingProcessorId,
      proposalId: proposal.proposalId,
      proposalKind: proposal.proposalKind,
      proposalTerminalPositionKey:
        makeInstantV3MessageProposalResolutionPositionKey(
          scope.sessionId,
          proposal.proposalId,
        ),
      resolutionState: 'Accepted',
    })
    return { occurrence, resolution }
  })

const makeAcceptedHistory = (
  template: typeof InstantV3OrdinaryMessageProposalRecord.Type,
  count: number,
  sessionPolicy: Synchronization.SessionPolicy,
) =>
  Effect.forEach(Array.range(1, count), acceptedSequence =>
    Effect.gen(function* () {
      const actorId = 'history-actor'
      const occurrenceId = `history-occurrence-${acceptedSequence.toString()}`
      const messageIdempotencyKey = `history-message-${acceptedSequence.toString()}`
      const proposalId = `history-proposal-${acceptedSequence.toString()}`
      const createdAtMs = template.createdAtMs + acceptedSequence
      const encoded = yield* messageProtocol.encodeProposed(
        Incremented.make({}),
        {
          actorId,
          actorSequence: acceptedSequence,
          causationOccurrenceId: null,
          clientId: template.clientId,
          correlationId: null,
          createdAtMs,
          occurrenceId,
          originDeviceId: template.originDeviceId,
          originatingProcessorId: template.originatingProcessorId,
          programId: scope.programId,
          programVersion: scope.programVersion,
          protocolVersion: scope.protocolVersion,
          sessionId: scope.sessionId,
          subjectId: scope.subjectId,
        },
      )
      const proposal = InstantV3OrdinaryMessageProposalRecord.make({
        ...template,
        actorId,
        actorSequence: acceptedSequence,
        actorSequencePositionKey:
          makeInstantV3MessageProposalActorSequencePositionKey(
            scope.sessionId,
            actorId,
            template.clientId,
            acceptedSequence,
          ),
        admissionOccurrenceId: occurrenceId,
        causationOccurrenceId: null,
        correlationId: null,
        createdAtMs,
        envelopeJson: encoded.envelopeJson,
        envelopeVersion: encoded.envelopeVersion,
        eventId: encoded.eventId,
        eventVersion: encoded.eventVersion,
        id: nextUuid(100_000 + acceptedSequence),
        messageIdempotencyKey,
        messageIdempotencyPositionKey:
          makeInstantV3MessageProposalMessageIdempotencyPositionKey(
            scope.sessionId,
            messageIdempotencyKey,
          ),
        occurrenceId,
        occurrencePositionKey:
          makeInstantV3MessageProposalOccurrencePositionKey(
            scope.sessionId,
            occurrenceId,
          ),
        payloadJson: encoded.payloadJson,
        proposalId,
        proposalPositionKey: makeInstantV3MessageProposalPositionKey(
          scope.sessionId,
          proposalId,
        ),
      })
      const accepted = yield* makeAccepted(
        proposal,
        acceptedSequence,
        Synchronization.SessionAudience.make({}),
        sessionPolicy,
        nextUuid(200_000 + acceptedSequence),
        nextUuid(300_000 + acceptedSequence),
      )
      return accepted.occurrence
    }),
  )

const makeRejected = (
  proposal: InstantV3OrdinaryMessageProposalRecord,
  id: string,
) =>
  InstantV3RejectedMessageProposalResolutionRecord.make({
    ...scope,
    actorId: proposal.actorId,
    actorSequence: proposal.actorSequence,
    clientId: proposal.clientId,
    id,
    originDeviceId: proposal.originDeviceId,
    originatingProcessorId: proposal.originatingProcessorId,
    proposalId: proposal.proposalId,
    proposalKind: proposal.proposalKind,
    proposalTerminalPositionKey:
      makeInstantV3MessageProposalResolutionPositionKey(
        scope.sessionId,
        proposal.proposalId,
      ),
    rejectedAtMs: proposal.createdAtMs + 100,
    rejectingProcessorId: 'authority-test',
    rejectionReason: 'AdmissionClaimRejected',
    resolutionState: 'Rejected',
  })

const makeControlledStore = Effect.gen(function* () {
  const accepted = yield* SubscriptionRef.make<
    ReadonlyArray<InstantV3AcceptedMessageOccurrenceRecord>
  >([])
  const proposals = yield* SubscriptionRef.make<
    ReadonlyArray<InstantV3MessageProposalRecord>
  >([])
  const programSessions = yield* SubscriptionRef.make<
    ReadonlyArray<typeof InstantV3ProgramSessionRecord.Type>
  >([activeProgramSession])
  const resolutions = yield* SubscriptionRef.make<
    ReadonlyArray<InstantV3MessageProposalResolutionRecord>
  >([])
  const connectionStatus = yield* SubscriptionRef.make<
    'Connecting' | 'Opened' | 'Authenticated' | 'Closed' | 'Errored'
  >('Closed')
  const isOnline = yield* Ref.make(false)
  const appendAttempts = yield* Ref.make(0)
  const appendMessageProposal: V3ProgramStoreService['appendMessageProposal'] =
    proposal =>
      Effect.gen(function* () {
        yield* Ref.update(appendAttempts, attempts => attempts + 1)
        if (proposal.proposalKind !== 'OrdinaryMessage') {
          return yield* Effect.die('Test store accepts ordinary proposals only')
        }
        if (yield* Ref.get(isOnline)) {
          yield* SubscriptionRef.update(proposals, current =>
            Array.some(
              current,
              candidate => candidate.proposalId === proposal.proposalId,
            )
              ? current
              : [...current, proposal],
          )
          return v3ServerConfirmedTransactionOutcome(
            `server-${proposal.proposalId}`,
            'Appended',
          )
        } else {
          return v3EnqueuedTransactionOutcome('offline-client', 'Appended')
        }
      })
  const store: V3ProgramStoreService = {
    appendMessageProposal,
    appendOriginEnrollmentClaim: () =>
      Effect.die('Origin enrollment is outside this test'),
    observations: {
      observeAcceptedMessageOccurrences: () =>
        SubscriptionRef.changes(accepted),
      observeConnectionStatus: SubscriptionRef.changes(connectionStatus),
      observeEffectPlacements: () => Stream.succeed([]),
      observeEffectRequests: () => Stream.succeed([]),
      observeMessageProposals: () => SubscriptionRef.changes(proposals),
      observeMessageProposalResolutions: () =>
        SubscriptionRef.changes(resolutions),
      observeOriginEnrollmentClaims: () => Stream.succeed([]),
      observeOriginPolicyDecisions: () => Stream.succeed([]),
      observeProgramSessions: () => SubscriptionRef.changes(programSessions),
      observeProjectionCheckpoints: () => Stream.succeed([]),
    },
  }
  return {
    accepted,
    appendAttempts,
    connectionStatus,
    isOnline,
    programSessions,
    proposals,
    resolutions,
    store,
  }
})

const makeSilentObservationStore = (
  store: V3ProgramStoreService,
  source: V3SharedProgramObservationReadinessError['source'],
): V3ProgramStoreService => ({
  ...store,
  observations: {
    ...store.observations,
    observeAcceptedMessageOccurrences:
      source === 'AcceptedMessageOccurrences'
        ? () => Stream.never
        : store.observations.observeAcceptedMessageOccurrences,
    observeConnectionStatus:
      source === 'ConnectionStatus'
        ? Stream.never
        : store.observations.observeConnectionStatus,
    observeMessageProposals:
      source === 'MessageProposals'
        ? () => Stream.never
        : store.observations.observeMessageProposals,
    observeMessageProposalResolutions:
      source === 'MessageProposalResolutions'
        ? () => Stream.never
        : store.observations.observeMessageProposalResolutions,
    observeProgramSessions:
      source === 'ProgramSessions'
        ? () => Stream.never
        : store.observations.observeProgramSessions,
  },
})

describe('V3SharedProgramProcessor', () => {
  it.effect(
    'does not sign or append a Message whose next Model is invalid',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeReadyInMemoryProgramStores
        const origin = yield* makeOrigin
        const invalidModelProgram = Program.make<Model, Message>({
          id: program.id,
          version: program.version,
          Model,
          Message,
          init: program.init,
          synchronization,
          update: model => [{ ...model, count: -1 }, []],
        })
        const invalidModelAdmission = Program.makeMessageAdmission({
          program: invalidModelProgram,
          Claim,
          decodeClaim,
          occurrenceId: claim => claim.occurrenceId,
          resolve: resolveClaim,
        })
        const processor = yield* makeProcessor(
          stores.client,
          origin,
          messageProtocol,
          invalidModelAdmission,
        )
        yield* connectReady(processor)

        const submission = yield* Effect.result(
          processor.submitAction(occurrenceId =>
            ClickedIncrement.make({ occurrenceId }),
          ),
        )
        expect(Result.isFailure(submission)).toBe(true)
        if (Result.isFailure(submission)) {
          expect(submission.failure).toBeInstanceOf(V3SharedProgramUpdateError)
          if (submission.failure instanceof V3SharedProgramUpdateError) {
            expect(submission.failure.stage).toBe('Optimistic')
          }
        }
        const processorSnapshot = yield* processor.readSnapshot
        const storeSnapshot = yield* stores.readSnapshot
        expect(processorSnapshot.optimisticModel.count).toBe(0)
        expect(processorSnapshot.pendingClaims).toHaveLength(0)
        expect(storeSnapshot.messageProposals).toHaveLength(0)
      }).pipe(Effect.scoped),
  )

  it.effect(
    'does not project an accepted Message whose next Model is invalid',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        const origin = yield* makeOrigin
        const source = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(source)
        const submission = yield* source.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const accepted = yield* makeAccepted(
          submission.proposal,
          1,
          Synchronization.SessionAudience.make({}),
          initialSessionPolicy,
          '00000000-0000-4000-8000-000000000780',
          '00000000-0000-4000-8000-000000000781',
        )
        const invalidModelProgram = Program.make<Model, Message>({
          id: program.id,
          version: program.version,
          Model,
          Message,
          init: program.init,
          synchronization,
          update: model => [{ ...model, count: -1 }, []],
        })
        const invalidModelAdmission = Program.makeMessageAdmission({
          program: invalidModelProgram,
          Claim,
          decodeClaim,
          occurrenceId: claim => claim.occurrenceId,
          resolve: resolveClaim,
        })
        const receiver = yield* makeProcessor(
          controlled.store,
          { ...origin, actorId: 'receiver-actor' },
          messageProtocol,
          invalidModelAdmission,
        )
        yield* connectReady(receiver)

        yield* SubscriptionRef.set(controlled.accepted, [accepted.occurrence])
        const snapshot = yield* waitForSnapshot(receiver, current =>
          Option.exists(
            current.lastError,
            error =>
              error instanceof V3SharedProgramUpdateError &&
              error.stage === 'Accepted',
          ),
        )
        expect(snapshot.acceptedModel.count).toBe(0)
        expect(snapshot.throughAcceptedSequence).toBe(0)
        expect(snapshot.waitingForAcceptedSequence).toEqual(Option.some(1))
      }).pipe(Effect.scoped),
  )

  it.effect(
    'does not sign or append a Message whose Program update defects',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeReadyInMemoryProgramStores
        const origin = yield* makeOrigin
        const defectiveProgram = Program.make<Model, Message>({
          id: program.id,
          version: program.version,
          Model,
          Message,
          init: program.init,
          synchronization,
          update: () => {
            throw new Error('Defective Program update.')
          },
        })
        const defectiveAdmission = Program.makeMessageAdmission({
          program: defectiveProgram,
          Claim,
          decodeClaim,
          occurrenceId: claim => claim.occurrenceId,
          resolve: resolveClaim,
        })
        const processor = yield* makeProcessor(
          stores.client,
          origin,
          messageProtocol,
          defectiveAdmission,
        )
        yield* connectReady(processor)

        const submission = yield* Effect.result(
          processor.submitAction(occurrenceId =>
            ClickedIncrement.make({ occurrenceId }),
          ),
        )
        expect(Result.isFailure(submission)).toBe(true)
        if (Result.isFailure(submission)) {
          expect(submission.failure).toBeInstanceOf(V3SharedProgramUpdateError)
          if (submission.failure instanceof V3SharedProgramUpdateError) {
            expect(submission.failure.stage).toBe('Optimistic')
          }
        }
        const processorSnapshot = yield* processor.readSnapshot
        const storeSnapshot = yield* stores.readSnapshot
        expect(processorSnapshot.optimisticModel.count).toBe(0)
        expect(processorSnapshot.pendingClaims).toHaveLength(0)
        expect(storeSnapshot.messageProposals).toHaveLength(0)
      }).pipe(Effect.scoped),
  )

  it.effect('submits only claims and keeps exact retries pending', () =>
    Effect.gen(function* () {
      const stores = yield* makeReadyInMemoryProgramStores
      const origin = yield* makeOrigin
      const processor = yield* makeProcessor(stores.client, origin)
      yield* connectReady(processor)

      const submission = yield* processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      const snapshot = yield* waitForSnapshot(
        processor,
        current =>
          Option.isSome(Array.head(current.pendingClaims)) &&
          Option.isNone(Array.get(current.pendingClaims, 1)),
      )

      expect(snapshot.acceptedModel.count).toBe(0)
      expect(snapshot.optimisticModel.count).toBe(1)
      expect(
        Option.map(
          Array.head(snapshot.pendingClaims),
          pending => pending.authorityState,
        ),
      ).toEqual(Option.some('AwaitingAuthority'))
      expect(
        Option.map(
          Array.head(snapshot.pendingClaims),
          pending => pending.persistence,
        ),
      ).toEqual(Option.some('ServerConfirmed'))
      expect(submission.proposal.admissionOccurrenceId).toBe(
        submission.proposal.occurrenceId,
      )
      expect('audience' in submission.proposal).toBe(false)
      expect('messageCategory' in submission.proposal).toBe(false)
      expectTypeOf(processor).not.toHaveProperty('propose')

      const retry = yield* processor.retryPending(
        submission.proposal.proposalId,
      )
      expect(retry.proposal).toEqual(submission.proposal)
      expect(retry.outcome.disposition).toBe('Idempotent')

      const mismatchedAction = yield* Effect.result(
        processor.submitAction(() =>
          ClickedIncrement.make({ occurrenceId: 'ignored-occurrence' }),
        ),
      )
      expect(Result.isFailure(mismatchedAction)).toBe(true)
      if (Result.isFailure(mismatchedAction)) {
        expect(mismatchedAction.failure).toBeInstanceOf(
          V3SharedProgramIdentityError,
        )
      }
    }).pipe(Effect.scoped),
  )

  it.effect(
    'requires a confirmed active session before creating local pending work',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        yield* SubscriptionRef.set(controlled.programSessions, [])
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* processor.connect
        yield* Effect.yieldNow

        const result = yield* Effect.result(
          processor.submitAction(occurrenceId =>
            ClickedIncrement.make({ occurrenceId }),
          ),
        )
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(
            V3SharedProgramSessionPolicyUnavailable,
          )
        }
        const snapshot = yield* waitForSnapshot(
          processor,
          current =>
            current.throughAcceptedSequence === 1 &&
            Array.isReadonlyArrayEmpty(current.pendingClaims),
          2_000,
        )
        expect(Option.isNone(snapshot.activeProgramSession)).toBe(true)
        expect(Option.isNone(snapshot.activeSessionPolicy)).toBe(true)
        expect(Option.isNone(Array.head(snapshot.pendingClaims))).toBe(true)
        expect(
          Option.isNone(
            Array.head(yield* SubscriptionRef.get(controlled.proposals)),
          ),
        ).toBe(true)
      }).pipe(Effect.scoped),
  )

  it.effect(
    'rejects Observe followers locally, allows RemoteControl, and reuses cached policy offline',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        const origin = yield* makeOrigin
        const leader = yield* deriveOriginProcessorKeyPair(
          Uint8Array.from({ length: 32 }, (_, index) => index + 97),
        )
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(processor)
        const observePolicy = Synchronization.SessionPolicy.make({
          generation: 1,
          mode: Synchronization.Follow.make({
            followers: [
              {
                control: 'Observe',
                processorId: origin.originatingProcessorId,
              },
            ],
            leaderProcessorId: leader.originatingProcessorId,
          }),
        })
        const observeSession = InstantV3ProgramSessionRecord.make({
          ...activeProgramSession,
          createdAtMs: activeProgramSession.createdAtMs + 1,
          id: '00000000-0000-4000-8000-000000000760',
          lifecycleGeneration: 2,
          lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
            scope.sessionId,
            2,
          ),
          previousLifecyclePositionKey:
            activeProgramSession.lifecyclePositionKey,
          sessionPolicy: observePolicy,
        })
        yield* SubscriptionRef.set(controlled.programSessions, [
          activeProgramSession,
          observeSession,
        ])
        let snapshot = yield* waitForSnapshot(
          processor,
          current =>
            Option.isSome(current.activeSessionPolicy) &&
            current.activeSessionPolicy.value.generation === 1,
        )
        expect(
          Option.map(snapshot.activeProgramSession, session => ({
            lifecycleGeneration: session.lifecycleGeneration,
            lifecyclePositionKey: session.lifecyclePositionKey,
            lifecycleState: session.lifecycleState,
            sessionPolicy: session.sessionPolicy,
          })),
        ).toEqual(
          Option.some({
            lifecycleGeneration: observeSession.lifecycleGeneration,
            lifecyclePositionKey: observeSession.lifecyclePositionKey,
            lifecycleState: 'Active',
            sessionPolicy: observePolicy,
          }),
        )

        const rejected = yield* Effect.result(
          processor.submitAction(occurrenceId =>
            ClickedOpenDetail.make({ occurrenceId }),
          ),
        )
        expect(Result.isFailure(rejected)).toBe(true)
        if (Result.isFailure(rejected)) {
          expect(rejected.failure).toBeInstanceOf(
            V3SharedProgramSynchronizationPreflightError,
          )
          if (
            rejected.failure instanceof
            V3SharedProgramSynchronizationPreflightError
          ) {
            expect(rejected.failure.reason).toBe('ReadOnlyFollower')
          }
        }
        expect(
          Option.isNone(
            Array.head(yield* SubscriptionRef.get(controlled.proposals)),
          ),
        ).toBe(true)

        const remoteControlPolicy = Synchronization.SessionPolicy.make({
          generation: 2,
          mode: Synchronization.Follow.make({
            followers: [
              {
                control: 'RemoteControl',
                processorId: origin.originatingProcessorId,
              },
            ],
            leaderProcessorId: leader.originatingProcessorId,
          }),
        })
        const remoteControlSession = InstantV3ProgramSessionRecord.make({
          ...observeSession,
          createdAtMs: observeSession.createdAtMs + 1,
          id: '00000000-0000-4000-8000-000000000761',
          lifecycleGeneration: 3,
          lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
            scope.sessionId,
            3,
          ),
          previousLifecyclePositionKey: observeSession.lifecyclePositionKey,
          sessionPolicy: remoteControlPolicy,
        })
        yield* SubscriptionRef.set(controlled.programSessions, [
          activeProgramSession,
          observeSession,
          remoteControlSession,
        ])
        snapshot = yield* waitForSnapshot(
          processor,
          current =>
            Option.isSome(current.activeSessionPolicy) &&
            current.activeSessionPolicy.value.generation === 2,
        )
        expect(
          Option.map(
            snapshot.activeProgramSession,
            session => session.lifecycleGeneration,
          ),
        ).toEqual(Option.some(3))
        expect(
          Option.map(
            snapshot.activeProgramSession,
            session => session.sessionPolicy,
          ),
        ).toEqual(Option.some(remoteControlPolicy))
        const remoteSubmission = yield* processor.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        )
        expect(remoteSubmission.outcome._tag).toBe('ServerConfirmed')

        yield* processor.disconnect
        yield* Ref.set(controlled.isOnline, false)
        yield* SubscriptionRef.set(controlled.programSessions, [])
        const offlineSubmission = yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        expect(offlineSubmission.outcome._tag).toBe('Enqueued')
        snapshot = yield* processor.readSnapshot
        expect(snapshot.optimisticModel.count).toBe(1)
        expect(
          Option.map(
            snapshot.activeProgramSession,
            session => session.lifecycleGeneration,
          ),
        ).toEqual(Option.some(3))
        expect(Option.isSome(snapshot.activeSessionPolicy)).toBe(true)
      }).pipe(Effect.scoped),
  )

  it.effect(
    'makes RemoteControl navigation pending work stale after changing to Observe',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        const origin = yield* makeOrigin
        const leader = yield* deriveOriginProcessorKeyPair(
          Uint8Array.from({ length: 32 }, (_, index) => index + 113),
        )
        const remoteControlPolicy = Synchronization.SessionPolicy.make({
          generation: 1,
          mode: Synchronization.Follow.make({
            followers: [
              {
                control: 'RemoteControl',
                processorId: origin.originatingProcessorId,
              },
            ],
            leaderProcessorId: leader.originatingProcessorId,
          }),
        })
        const remoteControlSession = InstantV3ProgramSessionRecord.make({
          ...activeProgramSession,
          createdAtMs: activeProgramSession.createdAtMs + 1,
          id: '00000000-0000-4000-8000-000000000762',
          lifecycleGeneration: 2,
          lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
            scope.sessionId,
            2,
          ),
          previousLifecyclePositionKey:
            activeProgramSession.lifecyclePositionKey,
          sessionPolicy: remoteControlPolicy,
        })
        yield* SubscriptionRef.set(controlled.programSessions, [
          activeProgramSession,
          remoteControlSession,
        ])
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(processor)
        yield* processor.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        )
        let snapshot = yield* processor.readSnapshot
        expect(snapshot.optimisticModel.navigation).toBe('Detail')
        expect(
          Option.map(
            Array.head(snapshot.pendingClaims),
            pending => pending.projection._tag,
          ),
        ).toEqual(Option.some('Applied'))

        const observePolicy = Synchronization.SessionPolicy.make({
          generation: 2,
          mode: Synchronization.Follow.make({
            followers: [
              {
                control: 'Observe',
                processorId: origin.originatingProcessorId,
              },
            ],
            leaderProcessorId: leader.originatingProcessorId,
          }),
        })
        const observeSession = InstantV3ProgramSessionRecord.make({
          ...remoteControlSession,
          createdAtMs: remoteControlSession.createdAtMs + 1,
          id: '00000000-0000-4000-8000-000000000763',
          lifecycleGeneration: 3,
          lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
            scope.sessionId,
            3,
          ),
          previousLifecyclePositionKey:
            remoteControlSession.lifecyclePositionKey,
          sessionPolicy: observePolicy,
        })
        yield* SubscriptionRef.set(controlled.programSessions, [
          activeProgramSession,
          remoteControlSession,
          observeSession,
        ])
        snapshot = yield* waitForSnapshot(
          processor,
          current =>
            Option.isSome(current.activeSessionPolicy) &&
            current.activeSessionPolicy.value.generation === 2 &&
            Option.exists(
              Array.head(current.pendingClaims),
              pending => pending.projection._tag === 'Stale',
            ),
        )
        expect(snapshot.optimisticModel.navigation).toBe('List')
        expect(
          Option.map(Array.head(snapshot.pendingClaims), pending =>
            pending.projection._tag === 'Stale'
              ? pending.projection.failureTag
              : 'NotStale',
          ),
        ).toEqual(Option.some('V3SharedProgramSynchronizationPreflightError'))
      }).pipe(Effect.scoped),
  )

  it.effect(
    'does not flush an old Applied claim after a policy transition fails projection',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        const origin = yield* makeOrigin
        const leader = yield* deriveOriginProcessorKeyPair(
          Uint8Array.from({ length: 32 }, (_, index) => index + 121),
        )
        const remoteControlPolicy = Synchronization.SessionPolicy.make({
          generation: 1,
          mode: Synchronization.Follow.make({
            followers: [
              {
                control: 'RemoteControl',
                processorId: origin.originatingProcessorId,
              },
            ],
            leaderProcessorId: leader.originatingProcessorId,
          }),
        })
        const remoteControlSession = InstantV3ProgramSessionRecord.make({
          ...activeProgramSession,
          createdAtMs: activeProgramSession.createdAtMs + 1,
          id: '00000000-0000-4000-8000-000000000792',
          lifecycleGeneration: 2,
          lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
            scope.sessionId,
            2,
          ),
          previousLifecyclePositionKey:
            activeProgramSession.lifecyclePositionKey,
          sessionPolicy: remoteControlPolicy,
        })
        yield* SubscriptionRef.set(controlled.programSessions, [
          activeProgramSession,
          remoteControlSession,
        ])
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(processor)
        const submission = yield* processor.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        )
        expect(submission.projection._tag).toBe('Applied')
        expect(yield* Ref.get(controlled.appendAttempts)).toBe(1)

        const accepted = yield* makeAccepted(
          submission.proposal,
          1,
          Synchronization.SessionAudience.make({}),
          remoteControlPolicy,
          '00000000-0000-4000-8000-000000000793',
          '00000000-0000-4000-8000-000000000794',
        )
        const invalidEnvelope = yield* messageProtocol.acceptEnvelope(
          submission.proposal,
          {
            acceptedAtMs: accepted.occurrence.acceptedAtMs,
            acceptedSequence: accepted.occurrence.acceptedSequence,
            acceptingProcessorId: accepted.occurrence.acceptingProcessorId,
            audience: accepted.occurrence.audience,
            messageCategory: 'Domain',
            policyGeneration: remoteControlPolicy.generation,
            sessionPolicy: remoteControlPolicy,
          },
        )
        const invalidAccepted =
          InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make({
            ...accepted.occurrence,
            envelopeJson: invalidEnvelope,
            messageCategory: 'Domain',
          })
        yield* SubscriptionRef.set(controlled.accepted, [invalidAccepted])
        yield* waitForSnapshot(processor, current =>
          Option.isSome(current.lastError),
        )

        const observePolicy = Synchronization.SessionPolicy.make({
          generation: 2,
          mode: Synchronization.Follow.make({
            followers: [
              {
                control: 'Observe',
                processorId: origin.originatingProcessorId,
              },
            ],
            leaderProcessorId: leader.originatingProcessorId,
          }),
        })
        const observeSession = InstantV3ProgramSessionRecord.make({
          ...remoteControlSession,
          createdAtMs: remoteControlSession.createdAtMs + 1,
          id: '00000000-0000-4000-8000-000000000795',
          lifecycleGeneration: 3,
          lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
            scope.sessionId,
            3,
          ),
          previousLifecyclePositionKey:
            remoteControlSession.lifecyclePositionKey,
          sessionPolicy: observePolicy,
        })
        yield* SubscriptionRef.set(controlled.programSessions, [
          activeProgramSession,
          remoteControlSession,
          observeSession,
        ])
        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        const snapshot = yield* waitForSnapshot(
          processor,
          current =>
            current.connection._tag === 'Attached' &&
            current.connection.transportStatus === 'Authenticated' &&
            Option.isSome(current.lastError),
        )

        expect(yield* Ref.get(controlled.appendAttempts)).toBe(1)
        expect(Option.isNone(snapshot.activeProgramSession)).toBe(true)
        expect(Option.isNone(snapshot.activeSessionPolicy)).toBe(true)
        expect(
          Option.map(
            Array.head(snapshot.pendingClaims),
            pending => pending.projection._tag,
          ),
        ).toEqual(Option.some('Applied'))
      }).pipe(Effect.scoped),
  )

  it.effect(
    'makes pending work stale after revocation and does not retry it',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(processor)
        yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        yield* processor.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        )
        expect(yield* Ref.get(controlled.appendAttempts)).toBe(2)

        const revokedSession = InstantV3ProgramSessionRecord.make({
          ...activeProgramSession,
          createdAtMs: activeProgramSession.createdAtMs + 1,
          id: '00000000-0000-4000-8000-000000000764',
          lifecycleGeneration: 2,
          lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
            scope.sessionId,
            2,
          ),
          lifecycleState: 'Revoked',
          previousLifecyclePositionKey:
            activeProgramSession.lifecyclePositionKey,
        })
        yield* SubscriptionRef.set(controlled.programSessions, [
          activeProgramSession,
          revokedSession,
        ])
        const snapshot = yield* waitForSnapshot(
          processor,
          current =>
            Option.isNone(current.activeSessionPolicy) &&
            Array.length(current.pendingClaims) === 2 &&
            Array.every(
              current.pendingClaims,
              pending => pending.projection._tag === 'Stale',
            ),
        )
        expect(Option.isNone(snapshot.activeProgramSession)).toBe(true)
        expect(snapshot.optimisticModel).toEqual({
          count: 0,
          deletePrompt: 'Closed',
          navigation: 'List',
        })
        expect(
          Array.map(snapshot.pendingClaims, pending =>
            pending.projection._tag === 'Stale'
              ? pending.projection.failureTag
              : 'NotStale',
          ),
        ).toEqual([
          'V3SharedProgramSessionPolicyUnavailable',
          'V3SharedProgramSessionPolicyUnavailable',
        ])

        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        yield* waitForSnapshot(
          processor,
          current =>
            current.connection._tag === 'Attached' &&
            current.connection.transportStatus === 'Authenticated',
        )
        yield* Effect.yieldNow
        expect(yield* Ref.get(controlled.appendAttempts)).toBe(2)
      }).pipe(Effect.scoped),
  )

  it.effect('reports a typed readiness failure for every silent source', () =>
    Effect.gen(function* () {
      const sources: ReadonlyArray<
        V3SharedProgramObservationReadinessError['source']
      > = [
        'AcceptedMessageOccurrences',
        'ConnectionStatus',
        'MessageProposals',
        'MessageProposalResolutions',
        'ProgramSessions',
      ]
      for (const source of sources) {
        const controlled = yield* makeControlledStore
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(
          makeSilentObservationStore(controlled.store, source),
          origin,
          messageProtocol,
          admission,
          10,
        )
        yield* processor.connect
        for (const _attempt of Array.range(1, 5)) {
          yield* Effect.yieldNow
          yield* TestClock.adjust(10)
        }
        const snapshot = yield* waitForSnapshot(
          processor,
          current =>
            current.connection._tag === 'Detached' &&
            Option.isSome(current.lastError),
        )
        expect(Option.isSome(snapshot.lastError)).toBe(true)
        if (Option.isSome(snapshot.lastError)) {
          expect(snapshot.lastError.value).toBeInstanceOf(
            V3SharedProgramObservationReadinessError,
          )
          if (
            snapshot.lastError.value instanceof
            V3SharedProgramObservationReadinessError
          ) {
            expect(snapshot.lastError.value.source).toBe(source)
            expect(snapshot.lastError.value.timeoutMs).toBe(10)
          }
        }
      }
    }).pipe(Effect.scoped),
  )

  it.effect('distinguishes offline enqueue, reconnect, and rejection', () =>
    Effect.gen(function* () {
      const controlled = yield* makeControlledStore
      const origin = yield* makeOrigin
      const processor = yield* makeProcessor(controlled.store, origin)
      yield* connectReady(processor)

      const submission = yield* processor.submitAction(occurrenceId =>
        ClickedIncrement.make({ occurrenceId }),
      )
      let snapshot = yield* processor.readSnapshot
      expect(snapshot.optimisticModel.count).toBe(1)
      expect(
        Option.map(
          Array.head(snapshot.pendingClaims),
          pending => pending.persistence,
        ),
      ).toEqual(Option.some('Enqueued'))

      yield* Ref.set(controlled.isOnline, true)
      yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
      snapshot = yield* waitForSnapshot(processor, current =>
        Option.exists(
          Array.head(current.pendingClaims),
          pending => pending.persistence === 'ServerConfirmed',
        ),
      )
      expect(snapshot.optimisticModel.count).toBe(1)
      expect(snapshot.pendingClaims).toHaveLength(1)

      yield* SubscriptionRef.set(controlled.resolutions, [
        makeRejected(
          submission.proposal,
          '00000000-0000-4000-8000-000000000700',
        ),
      ])
      snapshot = yield* waitForSnapshot(processor, current =>
        Option.isNone(Array.head(current.pendingClaims)),
      )
      expect(snapshot.acceptedModel.count).toBe(0)
      expect(snapshot.optimisticModel.count).toBe(0)
      expect(snapshot.recentTerminalClaims).toEqual([
        {
          maybeRejectionReason: Option.some('AdmissionClaimRejected'),
          proposalId: submission.proposal.proposalId,
          resolutionState: 'Rejected',
          resolvedAtMs: submission.proposal.createdAtMs + 100,
        },
      ])
    }).pipe(Effect.scoped),
  )

  it.effect(
    'returns the retained local projection when persistence fails',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        const persistenceFailure = new V3ProgramStoreError({
          cause: new Error('Instant append failed after local projection.'),
          operation: 'AppendMessageProposal',
        })
        const failingStore: V3ProgramStoreService = {
          ...controlled.store,
          appendMessageProposal: () => Effect.fail(persistenceFailure),
        }
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(failingStore, origin)
        yield* connectReady(processor)

        const result = yield* Effect.result(
          processor.submitAction(occurrenceId =>
            ClickedIncrement.make({ occurrenceId }),
          ),
        )
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(V3SharedProgramPersistenceError)
          if (result.failure instanceof V3SharedProgramPersistenceError) {
            expect(result.failure.cause).toBe(persistenceFailure)
            expect(result.failure.persistence).toBe('Local')
            expect(result.failure.projection._tag).toBe('Applied')
            const snapshot = yield* processor.readSnapshot
            expect(
              Option.map(Array.head(snapshot.pendingClaims), pending => ({
                projection: pending.projection._tag,
                proposalId: pending.proposal.proposalId,
              })),
            ).toEqual(
              Option.some({
                projection: 'Applied',
                proposalId: result.failure.proposal.proposalId,
              }),
            )
          }
        }
      }).pipe(Effect.scoped),
  )

  it.effect(
    'returns the submitted projection after authority already settles the live row',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        const processorReady = yield* Deferred.make<Processor>()
        const hasStartedSettlement = yield* Ref.make(false)
        const settledSnapshot =
          yield* Deferred.make<V3SharedProgramProcessorSnapshot<Model>>()
        const settlingStore: V3ProgramStoreService = {
          ...controlled.store,
          appendMessageProposal: proposal =>
            Effect.gen(function* () {
              if (proposal.proposalKind !== 'OrdinaryMessage') {
                return yield* Effect.die(
                  'Expected one ordinary proposal in the settling store.',
                )
              }
              const hasAlreadyStartedSettlement = yield* Ref.getAndSet(
                hasStartedSettlement,
                true,
              )
              const outcome =
                yield* controlled.store.appendMessageProposal(proposal)
              if (hasAlreadyStartedSettlement) {
                return outcome
              }
              const accepted = yield* makeAccepted(
                proposal,
                1,
                Synchronization.SessionAudience.make({}),
                initialSessionPolicy,
                '00000000-0000-4000-8000-000000000790',
                '00000000-0000-4000-8000-000000000791',
              ).pipe(Effect.orDie)
              yield* SubscriptionRef.set(controlled.resolutions, [
                accepted.resolution,
              ])
              yield* SubscriptionRef.set(controlled.accepted, [
                accepted.occurrence,
              ])
              const processor = yield* Deferred.await(processorReady)
              const snapshot = yield* waitForSnapshot(
                processor,
                snapshot => Array.isReadonlyArrayEmpty(snapshot.pendingClaims),
                2_000,
              )
              yield* Deferred.succeed(settledSnapshot, snapshot)
              return outcome
            }),
        }
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(settlingStore, origin)
        yield* Deferred.succeed(processorReady, processor)
        yield* connectReady(processor)

        const submission = yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const snapshot = yield* Deferred.await(settledSnapshot)
        const accepted = yield* SubscriptionRef.get(controlled.accepted)
        const resolutions = yield* SubscriptionRef.get(controlled.resolutions)

        expect(submission.projection._tag).toBe('Applied')
        expect(snapshot.pendingClaims).toEqual([])
        expect(snapshot.recentTerminalClaims).toEqual([
          {
            maybeRejectionReason: Option.none(),
            proposalId: submission.proposal.proposalId,
            resolutionState: 'Accepted',
            resolvedAtMs: submission.proposal.createdAtMs + 1,
          },
        ])
        expect(accepted).toHaveLength(1)
        expect(resolutions).toHaveLength(1)
      }).pipe(Effect.scoped),
  )

  it.effect(
    'stages query-skewed accepted rows and joins terminals in any order',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(processor)
        const first = yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const second = yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const policy = Synchronization.SessionPolicy.make({
          generation: 0,
          mode: Synchronization.Mirror.make({}),
        })
        const firstAccepted = yield* makeAccepted(
          first.proposal,
          1,
          Synchronization.SessionAudience.make({}),
          policy,
          '00000000-0000-4000-8000-000000000701',
          '00000000-0000-4000-8000-000000000702',
        )
        const secondAccepted = yield* makeAccepted(
          second.proposal,
          2,
          Synchronization.SessionAudience.make({}),
          policy,
          '00000000-0000-4000-8000-000000000703',
          '00000000-0000-4000-8000-000000000704',
        )

        yield* SubscriptionRef.set(controlled.resolutions, [
          secondAccepted.resolution,
        ])
        let snapshot = yield* snapshotAfter(
          processor,
          SubscriptionRef.set(controlled.accepted, [secondAccepted.occurrence]),
        )
        expect(snapshot.throughAcceptedSequence).toBe(0)
        expect(snapshot.acceptedModel.count).toBe(0)
        expect(snapshot.optimisticModel.count).toBe(2)
        expect(snapshot.pendingClaims).toHaveLength(2)

        yield* SubscriptionRef.set(controlled.accepted, [
          secondAccepted.occurrence,
          firstAccepted.occurrence,
        ])
        snapshot = yield* waitForSnapshot(
          processor,
          current => current.throughAcceptedSequence === 2,
        )
        expect(snapshot.throughAcceptedSequence).toBe(2)
        expect(snapshot.acceptedModel.count).toBe(2)
        expect(snapshot.optimisticModel.count).toBe(2)
        expect(snapshot.pendingClaims).toHaveLength(1)
        expect(
          Option.map(
            Array.head(snapshot.pendingClaims),
            pending => pending.projection._tag,
          ),
        ).toEqual(Option.some('Accepted'))

        yield* SubscriptionRef.set(controlled.resolutions, [
          secondAccepted.resolution,
          firstAccepted.resolution,
        ])
        snapshot = yield* waitForSnapshot(processor, current =>
          Option.isNone(Array.head(current.pendingClaims)),
        )
        expect(snapshot.pendingClaims).toHaveLength(0)
      }).pipe(Effect.scoped),
  )

  it.effect(
    'projects a 1,025-Message replacement snapshot with one late Program update',
    () =>
      Effect.gen(function* () {
        const templateStores = yield* makeReadyInMemoryProgramStores
        const templateOrigin = yield* makeOrigin
        const templateProcessor = yield* makeProcessor(
          templateStores.client,
          templateOrigin,
        )
        yield* connectReady(templateProcessor)
        const templateSubmission = yield* templateProcessor.submitAction(
          occurrenceId => ClickedIncrement.make({ occurrenceId }),
        )
        const acceptedHistory = yield* makeAcceptedHistory(
          templateSubmission.proposal,
          1_025,
          initialSessionPolicy,
        )
        const firstReplacement = Array.take(acceptedHistory, 1_024)
        const controlled = yield* makeControlledStore
        const receiverOrigin = yield* makeOrigin
        const processorUpdateCount = { value: 0 }
        const countedProgram = Program.make<Model, Message>({
          id: program.id,
          version: program.version,
          Model,
          Message,
          init: program.init,
          synchronization,
          update: (model, message) => {
            processorUpdateCount.value += 1
            return program.update(model, message)
          },
        })
        const countedAdmission = Program.makeMessageAdmission({
          program: countedProgram,
          Claim,
          decodeClaim,
          occurrenceId: claim => claim.occurrenceId,
          resolve: resolveClaim,
        })
        const receiver = yield* makeProcessor(
          controlled.store,
          receiverOrigin,
          messageProtocol,
          countedAdmission,
        )
        yield* connectReady(receiver)

        yield* SubscriptionRef.set(controlled.accepted, firstReplacement)
        let snapshot = yield* waitForSnapshot(
          receiver,
          current => current.throughAcceptedSequence === 1_024,
          2_000,
        )
        expect(snapshot.acceptedModel.count).toBe(1_024)
        expect(processorUpdateCount.value).toBe(1_024)

        yield* SubscriptionRef.set(controlled.accepted, acceptedHistory)
        snapshot = yield* waitForSnapshot(
          receiver,
          current => current.throughAcceptedSequence === 1_025,
          2_000,
        )
        expect(snapshot.acceptedModel.count).toBe(1_025)
        expect(processorUpdateCount.value).toBe(1_025)

        yield* SubscriptionRef.set(
          controlled.accepted,
          Array.drop(acceptedHistory, 1),
        )
        snapshot = yield* waitForSnapshot(
          receiver,
          current => current.throughAcceptedSequence === 0,
          2_000,
        )
        expect(snapshot.acceptedModel.count).toBe(0)
        expect(snapshot.waitingForAcceptedSequence).toEqual(Option.some(1))
        expect(processorUpdateCount.value).toBe(1_025)
      }).pipe(Effect.scoped),
    { timeout: 20_000 },
  )

  it.effect(
    'rejects a non-consecutive duplicate proposal in accepted history',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(processor)
        const first = yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const second = yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const policy = Synchronization.SessionPolicy.make({
          generation: 0,
          mode: Synchronization.Mirror.make({}),
        })
        const firstAccepted = yield* makeAccepted(
          first.proposal,
          1,
          Synchronization.SessionAudience.make({}),
          policy,
          '00000000-0000-4000-8000-000000000740',
          '00000000-0000-4000-8000-000000000741',
        )
        const secondAccepted = yield* makeAccepted(
          second.proposal,
          2,
          Synchronization.SessionAudience.make({}),
          policy,
          '00000000-0000-4000-8000-000000000742',
          '00000000-0000-4000-8000-000000000743',
        )
        const duplicateAccepted = yield* makeAccepted(
          first.proposal,
          3,
          Synchronization.SessionAudience.make({}),
          policy,
          '00000000-0000-4000-8000-000000000744',
          '00000000-0000-4000-8000-000000000745',
        )
        yield* SubscriptionRef.set(controlled.accepted, [
          firstAccepted.occurrence,
          secondAccepted.occurrence,
        ])
        yield* waitForSnapshot(
          processor,
          current => current.throughAcceptedSequence === 2,
        )

        yield* SubscriptionRef.set(controlled.accepted, [
          firstAccepted.occurrence,
          secondAccepted.occurrence,
          duplicateAccepted.occurrence,
        ])
        const snapshot = yield* waitForSnapshot(
          processor,
          current =>
            Option.isSome(current.lastError) &&
            current.lastError.value instanceof
              V3SharedProgramAcceptedHistoryError,
        )
        expect(snapshot.throughAcceptedSequence).toBe(2)
        expect(snapshot.acceptedModel.count).toBe(2)
        expect(Option.isSome(snapshot.lastError)).toBe(true)
        if (Option.isSome(snapshot.lastError)) {
          expect(snapshot.lastError.value).toBeInstanceOf(
            V3SharedProgramAcceptedHistoryError,
          )
          if (
            snapshot.lastError.value instanceof
            V3SharedProgramAcceptedHistoryError
          ) {
            expect(snapshot.lastError.value.reason).toBe('DuplicateProposal')
          }
        }
      }).pipe(Effect.scoped),
  )

  it.effect(
    'rejects self-consistent accepted category, audience, and policy lies',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(processor)
        const submission = yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const policy = Synchronization.SessionPolicy.make({
          generation: 0,
          mode: Synchronization.Mirror.make({}),
        })
        const accepted = yield* makeAccepted(
          submission.proposal,
          1,
          Synchronization.SessionAudience.make({}),
          policy,
          '00000000-0000-4000-8000-000000000750',
          '00000000-0000-4000-8000-000000000751',
        )
        const occurrenceWithRouting = (
          audience: Synchronization.Audience,
          messageCategory: Synchronization.MessageCategory,
          policyGeneration: number,
        ) =>
          messageProtocol
            .acceptEnvelope(submission.proposal, {
              acceptedAtMs: accepted.occurrence.acceptedAtMs,
              acceptedSequence: accepted.occurrence.acceptedSequence,
              acceptingProcessorId: accepted.occurrence.acceptingProcessorId,
              audience,
              messageCategory,
              policyGeneration,
              sessionPolicy: policy,
            })
            .pipe(
              Effect.map(envelopeJson =>
                InstantV3AcceptedOrdinaryMessageOccurrenceRecord.make({
                  ...accepted.occurrence,
                  audience,
                  envelopeJson,
                  messageCategory,
                  policyGeneration,
                }),
              ),
            )
        const assertions: ReadonlyArray<
          Readonly<{
            occurrence: InstantV3AcceptedMessageOccurrenceRecord
            reason: V3SharedProgramAcceptedRoutingError['reason']
          }>
        > = [
          {
            occurrence: yield* occurrenceWithRouting(
              Synchronization.SessionAudience.make({}),
              'Navigation',
              0,
            ),
            reason: 'MessageCategoryMismatch',
          },
          {
            occurrence: yield* occurrenceWithRouting(
              Synchronization.ProcessorAudience.make({
                processorIds: [origin.originatingProcessorId],
              }),
              'Domain',
              0,
            ),
            reason: 'AudienceMismatch',
          },
          {
            occurrence: yield* occurrenceWithRouting(
              Synchronization.SessionAudience.make({}),
              'Domain',
              1,
            ),
            reason: 'PolicyGenerationMismatch',
          },
        ]
        for (const assertion of assertions) {
          yield* SubscriptionRef.set(controlled.accepted, [
            assertion.occurrence,
          ])
          const snapshot = yield* waitForSnapshot(
            processor,
            current =>
              Option.isSome(current.lastError) &&
              current.lastError.value instanceof
                V3SharedProgramAcceptedRoutingError &&
              current.lastError.value.reason === assertion.reason,
          )
          expect(snapshot.throughAcceptedSequence).toBe(0)
          expect(snapshot.acceptedModel.count).toBe(0)
        }
      }).pipe(Effect.scoped),
  )

  it.effect(
    'keeps a stale destructive claim awaiting authority without applying it',
    () =>
      Effect.gen(function* () {
        const stores = yield* makeReadyInMemoryProgramStores
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(stores.client, origin)
        yield* connectReady(processor)
        const opened = yield* processor.submitAction(occurrenceId =>
          ClickedOpenDeletePrompt.make({ occurrenceId }),
        )
        const policy = Synchronization.SessionPolicy.make({
          generation: 0,
          mode: Synchronization.Mirror.make({}),
        })
        const openedAccepted = yield* makeAccepted(
          opened.proposal,
          1,
          Synchronization.SessionAudience.make({}),
          policy,
          '00000000-0000-4000-8000-000000000710',
          '00000000-0000-4000-8000-000000000711',
        )
        yield* stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
          openedAccepted,
        )
        yield* waitForSnapshot(
          processor,
          current => current.acceptedModel.deletePrompt === 'Open',
        )

        const destructive = yield* processor.submitAction(occurrenceId =>
          ClickedConfirmDelete.make({ occurrenceId }),
        )
        const cancelled = yield* processor.submitAction(occurrenceId =>
          ClickedCancelDelete.make({ occurrenceId }),
        )
        const cancelledAccepted = yield* makeAccepted(
          cancelled.proposal,
          2,
          Synchronization.SessionAudience.make({}),
          policy,
          '00000000-0000-4000-8000-000000000712',
          '00000000-0000-4000-8000-000000000713',
        )
        yield* stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
          cancelledAccepted,
        )

        const snapshot = yield* waitForSnapshot(processor, current =>
          Array.some(
            current.pendingClaims,
            pending =>
              pending.proposal.proposalId === destructive.proposal.proposalId &&
              pending.projection._tag === 'Stale',
          ),
        )
        const maybeDestructive = Array.findFirst(
          snapshot.pendingClaims,
          pending =>
            pending.proposal.proposalId === destructive.proposal.proposalId,
        )
        expect(Option.isSome(maybeDestructive)).toBe(true)
        if (Option.isSome(maybeDestructive)) {
          expect(maybeDestructive.value.authorityState).toBe(
            'AwaitingAuthority',
          )
          expect(maybeDestructive.value.projection._tag).toBe('Stale')
        }
        expect(snapshot.optimisticModel.deletePrompt).toBe('Closed')
      }).pipe(Effect.scoped),
  )

  it.effect(
    'projects frozen SharedDomain, Mirror, and Follow audiences only',
    () =>
      Effect.gen(function* () {
        commandExecutions.value = 0
        const stores = yield* makeReadyInMemoryProgramStores
        const origin = yield* makeOrigin
        const source = yield* makeProcessor(stores.client, origin)
        yield* connectReady(source)
        const sharedNavigation = yield* source.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        )
        const mirroredNavigation = yield* source.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        )
        const followedNavigation = yield* source.submitAction(occurrenceId =>
          ClickedOpenDetail.make({ occurrenceId }),
        )
        const inertEffect = yield* source.submitAction(occurrenceId =>
          GotEffectResult.make({ occurrenceId }),
        )

        const otherOriginKeys = yield* deriveOriginProcessorKeyPair(
          Uint8Array.from({ length: 32 }, (_, index) => index + 97),
        )
        const otherProcessorId = otherOriginKeys.originatingProcessorId
        const sharedPolicy = Synchronization.SessionPolicy.make({
          generation: 1,
          mode: Synchronization.SharedDomain.make({}),
        })
        const mirrorPolicy = Synchronization.SessionPolicy.make({
          generation: 2,
          mode: Synchronization.Mirror.make({}),
        })
        const followPolicy = Synchronization.SessionPolicy.make({
          generation: 3,
          mode: Synchronization.Follow.make({
            followers: [
              {
                control: 'Observe',
                processorId: otherProcessorId,
              },
            ],
            leaderProcessorId: origin.originatingProcessorId,
          }),
        })
        const sharedAccepted = yield* makeAccepted(
          sharedNavigation.proposal,
          1,
          Synchronization.ProcessorAudience.make({
            processorIds: [origin.originatingProcessorId],
          }),
          sharedPolicy,
          '00000000-0000-4000-8000-000000000720',
          '00000000-0000-4000-8000-000000000721',
        )
        const mirroredAccepted = yield* makeAccepted(
          mirroredNavigation.proposal,
          2,
          Synchronization.SessionAudience.make({}),
          mirrorPolicy,
          '00000000-0000-4000-8000-000000000722',
          '00000000-0000-4000-8000-000000000723',
        )
        const followedAccepted = yield* makeAccepted(
          followedNavigation.proposal,
          3,
          Synchronization.ProcessorAudience.make({
            processorIds: Array.sort(
              [origin.originatingProcessorId, otherProcessorId],
              Order.String,
            ),
          }),
          followPolicy,
          '00000000-0000-4000-8000-000000000724',
          '00000000-0000-4000-8000-000000000725',
        )
        const inertEffectAccepted = yield* makeAccepted(
          inertEffect.proposal,
          4,
          Synchronization.SessionAudience.make({}),
          followPolicy,
          '00000000-0000-4000-8000-000000000726',
          '00000000-0000-4000-8000-000000000727',
        )
        yield* stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
          sharedAccepted,
        )
        yield* stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
          mirroredAccepted,
        )
        yield* stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
          followedAccepted,
        )
        yield* stores.authority.appendServerConfirmedAcceptedMessageOccurrence(
          inertEffectAccepted,
        )

        const otherOrigin: V3SharedProgramOrigin = {
          ...origin,
          originatingProcessorId: otherProcessorId,
          processorSecretKey: otherOriginKeys.secretKey,
        }
        const follower = yield* makeProcessor(stores.client, otherOrigin)
        yield* connectReady(follower)
        const snapshot = yield* waitForSnapshot(
          follower,
          current => current.throughAcceptedSequence === 4,
        )

        expect(snapshot.acceptedModel.navigation).toBe('Detail')
        expect(snapshot.acceptedModel.count).toBe(10)
        expect(commandExecutions.value).toBe(0)
      }).pipe(Effect.scoped),
  )

  it.effect(
    'stages accepted EffectResults until their original causal proposal joins',
    () =>
      Effect.gen(function* () {
        commandExecutions.value = 0
        const controlled = yield* makeControlledStore
        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(processor)
        const causalSubmission = yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const causalAccepted = yield* makeAccepted(
          causalSubmission.proposal,
          1,
          Synchronization.SessionAudience.make({}),
          initialSessionPolicy,
          '00000000-0000-4000-8000-000000000770',
          '00000000-0000-4000-8000-000000000771',
        )
        const causalOriginProofDigest =
          yield* digestOriginOrdinaryMessageProposalProof(
            causalSubmission.proposal,
          )
        const effectRequestId = 'effect-request-1'
        const effectOccurrenceId = 'effect-occurrence-1'
        const effectProposalId = 'effect-proposal-1'
        const effectIdempotencyKey = 'effect-result-1'
        const effectEnvelopeInput = {
          actorId: origin.actorId,
          actorSequence: 2,
          causationOccurrenceId: causalAccepted.occurrence.occurrenceId,
          clientId: origin.clientId,
          correlationId: causalAccepted.occurrence.correlationId,
          createdAtMs: causalAccepted.occurrence.acceptedAtMs + 1,
          occurrenceId: effectOccurrenceId,
          originDeviceId: origin.originDeviceId,
          originatingProcessorId: origin.originatingProcessorId,
          programId: scope.programId,
          programVersion: scope.programVersion,
          protocolVersion: scope.protocolVersion,
          sessionId: scope.sessionId,
          subjectId: scope.subjectId,
          causalAcceptedSequence: causalAccepted.occurrence.acceptedSequence,
          causalAudience: causalAccepted.occurrence.audience,
          causalMessageCategory: causalAccepted.occurrence.messageCategory,
          causalOccurrenceId: causalAccepted.occurrence.occurrenceId,
          causalOriginDeviceId: causalAccepted.occurrence.originDeviceId,
          causalOriginPolicyGeneration:
            causalAccepted.occurrence.originPolicyGeneration,
          causalOriginPolicyId: causalAccepted.occurrence.originPolicyId,
          causalOriginProofDigest,
          causalOriginatingProcessorId:
            causalAccepted.occurrence.originatingProcessorId,
          causalPolicyGeneration: causalAccepted.occurrence.policyGeneration,
          causalProposalId: causalAccepted.occurrence.proposalId,
          effectAssignmentGeneration: 1,
          effectCancellationGeneration: 0,
          effectIdempotencyKey,
          effectIdempotencyPositionKey:
            makeInstantV3MessageProposalEffectIdempotencyPositionKey(
              scope.sessionId,
              effectIdempotencyKey,
            ),
          effectPlacementId: makeInstantV3EffectPlacementPositionKey(
            scope.sessionId,
            effectRequestId,
            1,
            0,
          ),
          effectRequestId,
          effectRequestResultPositionKey:
            makeInstantV3MessageProposalEffectRequestResultPositionKey(
              scope.sessionId,
              effectRequestId,
            ),
          executorClientCertificateJson: origin.originClientCertificateJson,
          executorOriginPolicyGeneration: origin.originPolicyGeneration,
          executorOriginPolicyId: origin.originPolicyId,
          executorProcessorCertificateJson:
            origin.originProcessorCertificateJson,
          executorProcessorId: origin.originatingProcessorId,
        }
        const encodedEffect = yield* messageProtocol.encodeEffectResultProposed(
          CompletedEffect.make({}),
          effectEnvelopeInput,
        )
        expect(
          'executorResultSignature' in JSON.parse(encodedEffect.envelopeJson),
        ).toBe(false)
        const effectSigningRecord = OriginEffectResultSigningRecord.make({
          ...scope,
          ...effectEnvelopeInput,
          actorSequencePositionKey:
            makeInstantV3MessageProposalActorSequencePositionKey(
              scope.sessionId,
              origin.actorId,
              origin.clientId,
              effectEnvelopeInput.actorSequence,
            ),
          effectIdempotencyPositionKey:
            effectEnvelopeInput.effectIdempotencyPositionKey,
          effectRequestResultPositionKey:
            effectEnvelopeInput.effectRequestResultPositionKey,
          envelopeJson: encodedEffect.envelopeJson,
          envelopeVersion: encodedEffect.envelopeVersion,
          eventId: encodedEffect.eventId,
          eventVersion: encodedEffect.eventVersion,
          id: '00000000-0000-4000-8000-000000000772',
          occurrencePositionKey:
            makeInstantV3MessageProposalOccurrencePositionKey(
              scope.sessionId,
              effectOccurrenceId,
            ),
          payloadJson: encodedEffect.payloadJson,
          proposalId: effectProposalId,
          proposalKind: 'EffectResult',
          proposalPositionKey: makeInstantV3MessageProposalPositionKey(
            scope.sessionId,
            effectProposalId,
          ),
        })
        const effectProposal = yield* signOriginEffectResultProposal(
          effectSigningRecord,
          origin.processorSecretKey,
        )
        expect(
          yield* messageProtocol.decodeEffectResultProposed(effectProposal),
        ).toEqual(CompletedEffect.make({}))
        const acceptedAtMs = effectProposal.createdAtMs + 1
        const acceptedEnvelope =
          yield* messageProtocol.acceptEffectResultEnvelope(effectProposal, {
            acceptedAtMs,
            acceptedSequence: 2,
            acceptingProcessorId: 'authority-test',
            audience: causalAccepted.occurrence.audience,
            messageCategory: causalAccepted.occurrence.messageCategory,
            policyGeneration: causalAccepted.occurrence.policyGeneration,
            sessionPolicy: causalAccepted.occurrence.sessionPolicy,
          })
        const {
          causationOccurrenceId: _causationOccurrenceId,
          ...acceptedProposalFields
        } = effectProposal
        const effectOccurrence =
          InstantV3AcceptedEffectResultOccurrenceRecord.make({
            ...acceptedProposalFields,
            acceptedAtMs,
            acceptedSequence: 2,
            acceptedSequencePositionKey:
              makeInstantV3AcceptedSequencePositionKey(scope.sessionId, 2),
            acceptingProcessorId: 'authority-test',
            actorSequencePositionKey:
              makeInstantV3AcceptedActorSequencePositionKey(
                scope.sessionId,
                effectProposal.actorId,
                effectProposal.clientId,
                effectProposal.actorSequence,
              ),
            audience: causalAccepted.occurrence.audience,
            causationId: effectProposal.causationOccurrenceId,
            effectIdempotencyPositionKey:
              makeInstantV3AcceptedEffectIdempotencyPositionKey(
                scope.sessionId,
                effectProposal.effectIdempotencyKey,
              ),
            effectRequestResultPositionKey:
              makeInstantV3AcceptedEffectRequestResultPositionKey(
                scope.sessionId,
                effectProposal.effectRequestId,
              ),
            envelopeJson: acceptedEnvelope,
            id: '00000000-0000-4000-8000-000000000773',
            messageCategory: causalAccepted.occurrence.messageCategory,
            occurrencePositionKey: makeInstantV3AcceptedOccurrencePositionKey(
              scope.sessionId,
              effectProposal.occurrenceId,
            ),
            policyGeneration: causalAccepted.occurrence.policyGeneration,
            positionKey: makeInstantV3AcceptedSequencePositionKey(
              scope.sessionId,
              2,
            ),
            proposedEnvelopeJson: effectProposal.envelopeJson,
            proposalPositionKey: makeInstantV3AcceptedProposalPositionKey(
              scope.sessionId,
              effectProposal.proposalId,
            ),
            sessionPolicy: causalAccepted.occurrence.sessionPolicy,
          })
        void _causationOccurrenceId

        yield* SubscriptionRef.set(controlled.proposals, [])
        yield* SubscriptionRef.set(controlled.accepted, [
          causalAccepted.occurrence,
          effectOccurrence,
        ])
        let snapshot = yield* waitForSnapshot(
          processor,
          current => current.throughAcceptedSequence === 1,
        )
        expect(snapshot.acceptedModel.count).toBe(1)
        expect(snapshot.waitingForAcceptedSequence).toEqual(Option.some(2))

        yield* SubscriptionRef.set(controlled.proposals, [
          causalSubmission.proposal,
          effectProposal,
        ])
        snapshot = yield* waitForSnapshot(
          processor,
          current => current.throughAcceptedSequence === 2,
        )
        expect(snapshot.acceptedModel.count).toBe(11)
        expect(commandExecutions.value).toBe(0)
      }).pipe(Effect.scoped),
  )

  it.effect(
    'reconnects coherently while a failed observation generation finishes',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        const observationAttempts = yield* Ref.make(0)
        const reconnectingStore: V3ProgramStoreService = {
          ...controlled.store,
          observations: {
            ...controlled.store.observations,
            observeAcceptedMessageOccurrences: () =>
              Stream.unwrap(
                Ref.updateAndGet(
                  observationAttempts,
                  attempt => attempt + 1,
                ).pipe(
                  Effect.map(attempt =>
                    attempt === 1
                      ? Stream.fail(
                          new V3ProgramStoreError({
                            cause: new Error('Transient observation failure.'),
                            operation: 'ObserveAcceptedMessageOccurrences',
                          }),
                        )
                      : SubscriptionRef.changes(controlled.accepted),
                  ),
                ),
              ),
          },
        }
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(reconnectingStore, origin)

        yield* processor.connect
        let snapshot = yield* waitForSnapshot(processor, current =>
          Option.isSome(current.lastError),
        )
        yield* processor.connect
        snapshot = yield* waitForSnapshot(
          processor,
          current =>
            current.connection._tag === 'Attached' &&
            Option.isSome(current.activeSessionPolicy),
        )
        expect(snapshot.connection._tag).toBe('Attached')
        expect(yield* Ref.get(observationAttempts)).toBe(2)
      }).pipe(Effect.scoped),
  )

  it.effect(
    'keeps a replacement generation behind a paused old finalizer',
    () =>
      Effect.gen(function* () {
        const oldHandle = { generation: 1, label: 'Old' }
        const nextHandle = { generation: 2, label: 'Next' }
        const observerRef = yield* SynchronizedRef.make(Option.some(oldHandle))
        const finishEntered = yield* Deferred.make<void>()
        const allowFinish = yield* Deferred.make<void>()
        const finishingFiber = yield* Effect.forkChild(
          finishCurrentObserverGeneration(
            observerRef,
            oldHandle.generation,
            () =>
              Deferred.succeed(finishEntered, undefined).pipe(
                Effect.andThen(Deferred.await(allowFinish)),
              ),
          ),
        )
        yield* Deferred.await(finishEntered)
        const reconnectFiber = yield* Effect.forkChild(
          SynchronizedRef.set(observerRef, Option.some(nextHandle)),
        )
        yield* Effect.yieldNow
        expect(reconnectFiber.pollUnsafe()).toBeUndefined()

        yield* Deferred.succeed(allowFinish, undefined)
        yield* Fiber.join(finishingFiber)
        yield* Fiber.join(reconnectFiber)
        expect(yield* SynchronizedRef.get(observerRef)).toEqual(
          Option.some(nextHandle),
        )
      }),
  )

  it.effect(
    'disconnects and restarts observation without losing projection',
    () =>
      Effect.gen(function* () {
        const controlled = yield* makeControlledStore
        yield* Ref.set(controlled.isOnline, true)
        yield* SubscriptionRef.set(controlled.connectionStatus, 'Authenticated')
        const origin = yield* makeOrigin
        const processor = yield* makeProcessor(controlled.store, origin)
        yield* connectReady(processor)
        const submission = yield* processor.submitAction(occurrenceId =>
          ClickedIncrement.make({ occurrenceId }),
        )
        const policy = Synchronization.SessionPolicy.make({
          generation: 0,
          mode: Synchronization.Mirror.make({}),
        })
        const accepted = yield* makeAccepted(
          submission.proposal,
          1,
          Synchronization.SessionAudience.make({}),
          policy,
          '00000000-0000-4000-8000-000000000730',
          '00000000-0000-4000-8000-000000000731',
        )

        yield* processor.disconnect
        yield* SubscriptionRef.set(controlled.resolutions, [
          accepted.resolution,
        ])
        yield* SubscriptionRef.set(controlled.accepted, [accepted.occurrence])
        let snapshot = yield* processor.readSnapshot
        expect(snapshot.connection._tag).toBe('Detached')
        expect(snapshot.acceptedModel.count).toBe(0)

        yield* connectReady(processor)
        snapshot = yield* waitForSnapshot(
          processor,
          current => current.throughAcceptedSequence === 1,
        )
        expect(snapshot.connection._tag).toBe('Attached')
        expect(snapshot.acceptedModel.count).toBe(1)
        expect(snapshot.pendingClaims).toHaveLength(0)
      }).pipe(Effect.scoped),
  )
})
