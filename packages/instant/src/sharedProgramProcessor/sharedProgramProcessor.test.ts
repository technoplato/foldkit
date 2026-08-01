import {
  Array,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Schema as S,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect'
import { Command, Processor, type Program, Synchronization } from 'foldkit'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  AcceptanceAuthorityChanged,
  type AcceptanceAuthorityConfig,
  AcceptanceAuthorityEffectResultMismatch,
  AcceptanceAuthorityIdentityConflict,
  AcceptanceAuthorityProcessorMismatch,
  AcceptanceAuthorityProposalKindMismatch,
  AcceptanceAuthorityScopeMismatch,
  AcceptanceAuthoritySessionRevoked,
  InstantAcceptedMessageOccurrenceRecord,
  InstantAcceptedMessageOccurrenceValidationIssue,
  InstantEffectPlacementRecord,
  InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  InstantMessageProposalResolutionRecord,
  InstantProgramSessionRecord,
  ProgramAuthorityStore,
  type ProgramAuthorityStoreService,
  ProgramStoreError,
  ProgramStoreProposalMutationRejected,
  type ProgramStoreService,
  SharedProgramAcceptedEffectResultDuplicate,
  SharedProgramAcceptedMessageDuplicate,
  SharedProgramAcceptedOccurrenceInvalid,
  SharedProgramAcceptedPolicyHistoryMismatch,
  SharedProgramAcceptedRoutingMismatch,
  SharedProgramAdmissionSequencerMismatch,
  SharedProgramCausalRoutingMissing,
  SharedProgramCodecError,
  SharedProgramMessageCategoryError,
  type SharedProgramMessageCodec,
  SharedProgramMessageIdempotencyKeyInvalid,
  SharedProgramProposalResolutionMismatch,
  SharedProgramProposalResolutionScopeMismatch,
  type SharedProgramRuntime,
  enqueuedTransactionOutcome,
  instantProgramProtocolVersion,
  makeAcceptedOccurrencePositionKey,
  makeAcceptanceAuthority as makeBaseAcceptanceAuthority,
  makeInMemoryProgramStore,
  makeInstantCapabilityIdIndex,
  makeInstantEffectPlacementPositionKey,
  makeSchemaProgramMessageCodec,
  makeSharedProgramProcessor,
  makeSharedProgramProcessorSnapshotSchema,
} from '../index.js'

const Incremented = S.TaggedStruct('Incremented', {})
const ResetCounter = S.TaggedStruct('ResetCounter', {})
const SelectedCounter = S.TaggedStruct('SelectedCounter', {
  counterId: S.String,
})
const Message = S.Union([Incremented, ResetCounter, SelectedCounter])
type Message = typeof Message.Type

const Model = S.Struct({ count: S.Int })
type Model = typeof Model.Type

const SynchronizedModel = S.Struct({
  count: S.Int,
  maybeSelectedCounterId: S.Option(S.String),
})
type SynchronizedModel = typeof SynchronizedModel.Type

const programSynchronization: Program.ProgramSynchronization<Model, Message> = {
  messageCategory: () => 'Domain',
  projectDomain: model => model,
}

const navigationSynchronization: Program.ProgramSynchronization<
  SynchronizedModel,
  Message
> = {
  messageCategory: message =>
    message._tag === 'SelectedCounter' ? 'Navigation' : 'Domain',
  projectDomain: model => ({ count: model.count }),
}

const mirrorPolicy = Synchronization.SessionPolicy.make({
  generation: 0,
  mode: Synchronization.Mirror.make({}),
})

const sharedDomainPolicy = Synchronization.SessionPolicy.make({
  generation: 1,
  mode: Synchronization.SharedDomain.make({}),
})

const makeFollowPolicy = (
  control: Synchronization.FollowControl,
): Synchronization.SessionPolicy =>
  Synchronization.SessionPolicy.make({
    generation: 2,
    mode: Synchronization.Follow.make({
      followers: [
        Synchronization.Follower.make({
          control,
          processorId: 'processor-follower',
        }),
      ],
      leaderProcessorId: 'processor-leader',
    }),
  })

const nextCount = (count: number, message: Message): number => {
  if (message._tag === 'Incremented') {
    return count + 1
  } else if (message._tag === 'ResetCounter') {
    return 0
  } else {
    return count
  }
}

const Envelope = S.Struct({
  acceptedAtMs: S.NullOr(S.Int),
  acceptedSequence: S.NullOr(S.Int),
  acceptingProcessorId: S.NullOr(S.String),
  occurrenceId: S.String,
})
type Envelope = typeof Envelope.Type

const EnvelopeJson = S.fromJsonString(Envelope)
const makeProposedEnvelopeJson = (occurrenceId: string): string =>
  S.encodeSync(EnvelopeJson)(
    Envelope.make({
      acceptedAtMs: null,
      acceptedSequence: null,
      acceptingProcessorId: null,
      occurrenceId,
    }),
  )

const subjectId = 'subject-001'
const sessionId = 'session-001'
const programId = 'shared-counter'
const programVersion = 1
const authorityProcessorId = 'processor-authority'
const clientId = 'client-browser'
const processorId = 'processor-browser'
const originDeviceId = 'device-browser'
const lifecycleSchedulingBarrierMs = 10

const session = InstantProgramSessionRecord.make({
  authorityProcessorId,
  createdAtMs: 1_753_825_000_000,
  id: sessionId,
  isRevoked: false,
  processorRoomId: 'room-b16c34a61a9b45a29f8b180035bdc821',
  programId,
  programVersion,
  protocolVersion: instantProgramProtocolVersion,
  sessionId,
  sessionPolicy: mirrorPolicy,
  subjectId,
})

const codec = makeSchemaProgramMessageCodec({
  Envelope,
  Message,
  acceptEnvelope: (envelope, input) =>
    Envelope.make({
      ...envelope,
      acceptedAtMs: input.acceptedAtMs,
      acceptedSequence: input.acceptedSequence,
      acceptingProcessorId: input.acceptingProcessorId,
    }),
  envelopeVersion: 1,
  eventMetadata: message => {
    if (message._tag === 'Incremented') {
      return {
        eventId: 'counter.incremented',
        eventVersion: 1,
      }
    } else if (message._tag === 'ResetCounter') {
      return {
        eventId: 'counter.reset',
        eventVersion: 1,
      }
    } else {
      return {
        eventId: 'counter.selected',
        eventVersion: 1,
      }
    }
  },
  makeProposedEnvelope: (_message, input) =>
    Envelope.make({
      acceptedAtMs: null,
      acceptedSequence: null,
      acceptingProcessorId: null,
      occurrenceId: input.occurrenceId,
    }),
  validateAcceptedEnvelope: (envelope, occurrence) =>
    envelope.occurrenceId === occurrence.occurrenceId &&
    envelope.acceptedAtMs === occurrence.acceptedAtMs &&
    envelope.acceptedSequence === occurrence.acceptedSequence &&
    envelope.acceptingProcessorId === occurrence.acceptingProcessorId
      ? Effect.void
      : Effect.fail(new Error('Accepted envelope provenance mismatch.')),
  validateProposedEnvelope: (envelope, proposal) =>
    envelope.occurrenceId === proposal.occurrenceId
      ? Effect.void
      : Effect.fail(new Error('Envelope occurrence provenance mismatch.')),
})

const authorityProtocol = {
  acceptEnvelope: codec.acceptEnvelope,
  decodeAcceptedMessage: (occurrence: InstantAcceptedMessageOccurrenceRecord) =>
    codec
      .decodeAccepted(occurrence)
      .pipe(Effect.map(decoded => decoded.message)),
  decodeProposedMessage: (proposal: InstantMessageProposalRecord) =>
    codec.decodeProposed(proposal).pipe(Effect.map(decoded => decoded.message)),
  messageCategory: programSynchronization.messageCategory,
}

type TestAuthorityConfig = Omit<
  AcceptanceAuthorityConfig<Message>,
  | 'decodeAcceptedMessage'
  | 'decodeProposedMessage'
  | 'messageCategory'
  | 'store'
> &
  Readonly<{ store: ProgramStoreService }>

const makeTestAuthorityStore = (
  store: ProgramStoreService,
): ProgramAuthorityStoreService =>
  ProgramAuthorityStore.of({
    ...store,
    appendServerConfirmedAcceptedMessageOccurrence: record =>
      Effect.flatMap(store.appendAcceptedMessageOccurrence(record), outcome =>
        outcome._tag === 'Synced'
          ? Effect.succeed(outcome)
          : Effect.fail(
              new ProgramStoreError({
                cause: new Error('Accepted write was not server confirmed.'),
                operation: 'AppendAcceptedMessageOccurrence',
              }),
            ),
      ),
    appendServerConfirmedEffectPlacement: record =>
      Effect.flatMap(store.appendEffectPlacement(record), outcome =>
        outcome._tag === 'Synced'
          ? Effect.succeed(outcome)
          : Effect.fail(
              new ProgramStoreError({
                cause: new Error('Placement write was not server confirmed.'),
                operation: 'AppendEffectPlacement',
              }),
            ),
      ),
    appendServerConfirmedEffectRequest: record =>
      Effect.flatMap(store.appendEffectRequest(record), outcome =>
        outcome._tag === 'Synced'
          ? Effect.succeed(outcome)
          : Effect.fail(
              new ProgramStoreError({
                cause: new Error('Effect request was not server confirmed.'),
                operation: 'AppendEffectRequest',
              }),
            ),
      ),
    appendServerConfirmedMessageProposalResolution: record =>
      Effect.flatMap(store.appendMessageProposalResolution(record), outcome =>
        outcome._tag === 'Synced'
          ? Effect.succeed(outcome)
          : Effect.fail(
              new ProgramStoreError({
                cause: new Error('Resolution write was not server confirmed.'),
                operation: 'AppendMessageProposalResolution',
              }),
            ),
      ),
    serverConfirmed: {
      observeAcceptedMessageOccurrences:
        store.observeAcceptedMessageOccurrences,
      observeConnectionStatus: store.observeConnectionStatus,
      observeEffectPlacements: store.observeEffectPlacements,
      observeEffectRequests: store.observeEffectRequests,
      observeMessageProposals: store.observeMessageProposals,
      observeMessageProposalResolutions:
        store.observeMessageProposalResolutions,
      observeProgramSessions: store.observeProgramSessions,
      observeProjectionCheckpoints: store.observeProjectionCheckpoints,
    },
  })

const makeAcceptanceAuthority = (config: TestAuthorityConfig) =>
  makeBaseAcceptanceAuthority({
    ...authorityProtocol,
    ...config,
    store: makeTestAuthorityStore(config.store),
  })

const makeRuntime = (
  initialCount = 0,
): Effect.Effect<
  Readonly<{
    appliedEnvelopes: SubscriptionRef.SubscriptionRef<ReadonlyArray<Envelope>>
    runtime: SharedProgramRuntime<Model, Message, Envelope, never>
  }>
> =>
  Effect.gen(function* () {
    const model = yield* SubscriptionRef.make(
      Model.make({ count: initialCount }),
    )
    const appliedEnvelopes = yield* SubscriptionRef.make<
      ReadonlyArray<Envelope>
    >([])
    return {
      appliedEnvelopes,
      runtime: {
        project: (currentModel, messages) =>
          Array.reduce(messages, currentModel, (model, message) =>
            Model.make({
              count: nextCount(model.count, message),
            }),
          ),
        readModel: () => Effect.runSync(SubscriptionRef.get(model)),
        replay: {
          inspect: frame => Effect.succeed(Model.make({ count: frame })),
        },
        run: (_message, options) =>
          Effect.gen(function* () {
            yield* SubscriptionRef.update(
              appliedEnvelopes,
              Array.append(options.envelope),
            )
            return yield* SubscriptionRef.updateAndGet(model, current =>
              Model.make({
                count: nextCount(current.count, _message),
              }),
            )
          }),
      },
    }
  })

const makeOccurrence = (
  proposal: InstantMessageProposalRecord,
  acceptedSequence: number,
  sessionPolicy: Synchronization.SessionPolicy = mirrorPolicy,
): Effect.Effect<InstantAcceptedMessageOccurrenceRecord> =>
  Effect.map(
    codec.acceptEnvelope(proposal, {
      acceptedAtMs: 1_753_825_100_000 + acceptedSequence,
      acceptedSequence,
      acceptingProcessorId: authorityProcessorId,
    }),
    envelopeJson =>
      InstantAcceptedMessageOccurrenceRecord.make({
        acceptedAtMs: 1_753_825_100_000 + acceptedSequence,
        acceptedSequence,
        acceptingProcessorId: authorityProcessorId,
        actorId: proposal.actorId,
        actorSequence: proposal.actorSequence,
        audience: proposal.proposedAudience,
        causationId: proposal.causationOccurrenceId,
        clientId: proposal.clientId,
        correlationId: proposal.correlationId,
        createdAtMs: proposal.createdAtMs,
        effectAssignmentGeneration: proposal.effectAssignmentGeneration,
        effectCancellationGeneration: proposal.effectCancellationGeneration,
        effectIdempotencyKey: proposal.effectIdempotencyKey,
        effectRequestId: proposal.effectRequestId,
        envelopeJson,
        envelopeVersion: proposal.envelopeVersion,
        eventId: proposal.eventId,
        eventVersion: proposal.eventVersion,
        executorProcessorId: proposal.executorProcessorId,
        id: proposal.occurrenceId,
        messageCategory: proposal.messageCategory,
        messageIdempotencyKey: proposal.messageIdempotencyKey,
        occurrenceId: proposal.occurrenceId,
        originDeviceId: proposal.originDeviceId,
        originatingProcessorId: proposal.originatingProcessorId,
        payloadJson: proposal.payloadJson,
        positionKey: makeAcceptedOccurrencePositionKey(
          sessionId,
          acceptedSequence,
        ),
        programId,
        programVersion,
        protocolVersion: proposal.protocolVersion,
        proposedEnvelopeJson: proposal.envelopeJson,
        proposalId: proposal.proposalId,
        proposalKind: proposal.proposalKind,
        policyGeneration: proposal.policyGeneration,
        sessionPolicy,
        sessionId,
        subjectId,
      }),
  ).pipe(Effect.orDie)

const appendCausalOccurrence = (
  store: ProgramStoreService,
  acceptedSequence = 1,
): Effect.Effect<InstantAcceptedMessageOccurrenceRecord, never, Scope.Scope> =>
  Effect.gen(function* () {
    const { runtime } = yield* makeRuntime()
    const generator = yield* makeProcessor(
      store,
      runtime,
      codec,
      'client-causal',
      0,
      programSynchronization,
      mirrorPolicy,
      'processor-causal',
      'causal-occurrence',
    )
    const proposal = yield* generator.propose(
      SelectedCounter.make({ counterId: 'counter-causal' }),
    )
    const occurrence = yield* makeOccurrence(proposal, acceptedSequence)
    yield* store.appendAcceptedMessageOccurrence(occurrence)
    return occurrence
  }).pipe(Effect.orDie)

const makeProcessor = (
  store: ProgramStoreService,
  runtime: SharedProgramRuntime<Model, Message, Envelope, never>,
  processorCodec: SharedProgramMessageCodec<Message, Envelope> = codec,
  processorClientId: string = clientId,
  throughAcceptedSequence = 0,
  synchronization: Program.ProgramSynchronization<
    Model,
    Message
  > = programSynchronization,
  synchronizationPolicy: Synchronization.SessionPolicy = mirrorPolicy,
  processorOccurrenceId: string = processorId,
  occurrenceIdPrefix = 'occurrence',
) => {
  const ids = [
    `${occurrenceIdPrefix}-001`,
    `${occurrenceIdPrefix}-002`,
    `${occurrenceIdPrefix}-003`,
  ]
  const nextId = SubscriptionRef.make(0)
  const nextSequence = SubscriptionRef.make(0)
  return Effect.flatMap(nextId, idRef =>
    Effect.flatMap(nextSequence, sequenceRef =>
      makeSharedProgramProcessor({
        admissionSequencerProcessorId: authorityProcessorId,
        actorId: subjectId,
        clientId: processorClientId,
        codec: processorCodec,
        makeId: () => {
          const index = Effect.runSync(
            SubscriptionRef.getAndUpdate(idRef, value => value + 1),
          )
          return Option.getOrElse(
            Array.get(ids, index),
            () => `${occurrenceIdPrefix}-${index}`,
          )
        },
        Model,
        nextActorSequence: SubscriptionRef.updateAndGet(
          sequenceRef,
          value => value + 1,
        ),
        now: () => 1_753_825_050_000,
        originDeviceId,
        originatingProcessorId: processorOccurrenceId,
        programId,
        programVersion,
        protocolVersion: instantProgramProtocolVersion,
        runtime,
        sessionId,
        store,
        subjectId,
        synchronization,
        synchronizationPolicy,
        throughAcceptedSequence,
      }),
    ),
  )
}

const nextSynchronizedModel = (
  model: SynchronizedModel,
  message: Message,
): SynchronizedModel => {
  if (message._tag === 'Incremented') {
    return SynchronizedModel.make({
      ...model,
      count: model.count + 1,
    })
  } else if (message._tag === 'ResetCounter') {
    return SynchronizedModel.make({
      ...model,
      count: 0,
    })
  } else {
    return SynchronizedModel.make({
      ...model,
      maybeSelectedCounterId: Option.some(message.counterId),
    })
  }
}

const makeSynchronizedRuntime = (
  initialCount = 0,
): Effect.Effect<
  Readonly<{
    appliedEnvelopes: SubscriptionRef.SubscriptionRef<ReadonlyArray<Envelope>>
    runtime: SharedProgramRuntime<SynchronizedModel, Message, Envelope, never>
  }>
> =>
  Effect.gen(function* () {
    const model = yield* SubscriptionRef.make(
      SynchronizedModel.make({
        count: initialCount,
        maybeSelectedCounterId: Option.none(),
      }),
    )
    const appliedEnvelopes = yield* SubscriptionRef.make<
      ReadonlyArray<Envelope>
    >([])
    return {
      appliedEnvelopes,
      runtime: {
        project: (currentModel, messages) =>
          Array.reduce(messages, currentModel, nextSynchronizedModel),
        readModel: () => Effect.runSync(SubscriptionRef.get(model)),
        replay: {
          inspect: frame =>
            Effect.succeed(
              SynchronizedModel.make({
                count: frame,
                maybeSelectedCounterId: Option.none(),
              }),
            ),
        },
        run: (message, options) =>
          Effect.gen(function* () {
            yield* SubscriptionRef.update(
              appliedEnvelopes,
              Array.append(options.envelope),
            )
            return yield* SubscriptionRef.updateAndGet(model, currentModel =>
              nextSynchronizedModel(currentModel, message),
            )
          }),
      },
    }
  })

const makeSynchronizedProcessor = (
  store: ProgramStoreService,
  runtime: SharedProgramRuntime<SynchronizedModel, Message, Envelope, never>,
  synchronizationPolicy: Synchronization.SessionPolicy,
  processorOccurrenceId: string,
  processorClientId: string = clientId,
) => {
  const nextId = SubscriptionRef.make(0)
  const nextSequence = SubscriptionRef.make(0)
  return Effect.flatMap(nextId, idRef =>
    Effect.flatMap(nextSequence, sequenceRef =>
      makeSharedProgramProcessor({
        admissionSequencerProcessorId: authorityProcessorId,
        actorId: subjectId,
        clientId: processorClientId,
        codec,
        makeId: () => {
          const index = Effect.runSync(
            SubscriptionRef.getAndUpdate(idRef, value => value + 1),
          )
          return `${processorOccurrenceId}-occurrence-${index}`
        },
        Model: SynchronizedModel,
        nextActorSequence: SubscriptionRef.updateAndGet(
          sequenceRef,
          value => value + 1,
        ),
        now: () => 1_753_825_050_000,
        originDeviceId,
        originatingProcessorId: processorOccurrenceId,
        programId,
        programVersion,
        protocolVersion: instantProgramProtocolVersion,
        runtime,
        sessionId,
        store,
        subjectId,
        synchronization: navigationSynchronization,
        synchronizationPolicy,
      }),
    ),
  )
}

const effectCapability = Processor.CapabilityRequirement.make({
  id: ['Device', 'Vibrate'],
  minimumVersion: 1,
})

const makeEffectRequest = (
  causalOccurrence: InstantAcceptedMessageOccurrenceRecord,
): InstantEffectRequestRecord =>
  InstantEffectRequestRecord.make({
    causalAudience: causalOccurrence.audience,
    causalMessageCategory: causalOccurrence.messageCategory,
    causalOccurrenceId: causalOccurrence.occurrenceId,
    causalPolicyGeneration: causalOccurrence.policyGeneration,
    effectId: 'device.vibrate',
    effectVersion: 1,
    id: 'effect-request-001',
    idempotencyKey: 'effect-idempotency-001',
    minimumCapabilityVersion: 1,
    originatingProcessorId: authorityProcessorId,
    placement: Processor.Placement.make({
      affinity: Processor.AnyProcessor.make({}),
      capability: effectCapability,
      cardinality: 'One',
      unavailable: 'Wait',
      version: 1,
    }),
    programId,
    programVersion,
    protocolVersion: instantProgramProtocolVersion,
    publicArguments: {},
    permittedResultEvents: [
      Command.ResultEventRange.make({
        eventId: 'counter.incremented',
        maximumVersion: 1,
        minimumVersion: 1,
      }),
      Command.ResultEventRange.make({
        eventId: 'counter.failed',
        maximumVersion: 2,
        minimumVersion: 1,
      }),
    ],
    requestId: 'effect-request-001',
    requestedAtMs: 1_753_825_200_000,
    requiredCapabilityIdJson: makeInstantCapabilityIdIndex(effectCapability.id),
    sessionId,
    subjectId,
  })

const makeEffectPlacement = (
  request: InstantEffectRequestRecord,
  placementStatus:
    | 'AssignedPreferred'
    | 'AssignedFallback'
    | 'Waiting'
    | 'Failed'
    | 'Ignored',
  assignedProcessorId: string | null,
): InstantEffectPlacementRecord => {
  const placementDecision = (() => {
    if (placementStatus === 'AssignedPreferred') {
      return Processor.AssignedPreferred.make({
        processorId: assignedProcessorId ?? '',
      })
    } else if (placementStatus === 'AssignedFallback') {
      return Processor.AssignedFallback.make({
        processorId: assignedProcessorId ?? '',
      })
    } else if (placementStatus === 'Waiting') {
      return Processor.Waiting.make({ reason: 'NoCapableProcessor' })
    } else if (placementStatus === 'Failed') {
      return Processor.Failed.make({ reason: 'NoCapableProcessor' })
    } else {
      return Processor.Ignored.make({ reason: 'NoCapableProcessor' })
    }
  })()
  return InstantEffectPlacementRecord.make({
    assignedProcessorId,
    assignmentGeneration: 1,
    cancellationGeneration: 0,
    decidedAtMs: 1_753_825_200_001,
    id: '00000000-0000-4000-8000-000000000001',
    placementDecision,
    placementStatus,
    positionKey: makeInstantEffectPlacementPositionKey(request.requestId, 1, 0),
    programId: request.programId,
    programVersion: request.programVersion,
    protocolVersion: request.protocolVersion,
    requestId: request.requestId,
    sessionId: request.sessionId,
    subjectId: request.subjectId,
  })
}

describe('shared Program Processor', () => {
  it.effect(
    'requires explicit Mirror policy and exposes it through the portable snapshot',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)

          const snapshot = yield* processor.readSnapshot
          const portableSnapshot = S.decodeUnknownSync(
            makeSharedProgramProcessorSnapshotSchema(Model),
          )(snapshot)

          expect(snapshot.synchronizationPolicy).toEqual(mirrorPolicy)
          expect(portableSnapshot.synchronizationPolicy).toEqual(mirrorPolicy)
        }),
      ),
  )

  it.effect('classifies navigation while Mirror projects and applies it', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const classifications = yield* SubscriptionRef.make<
          ReadonlyArray<Synchronization.MessageCategory>
        >([])
        const navigationSynchronization: Program.ProgramSynchronization<
          Model,
          Message
        > = {
          messageCategory: message => {
            const category =
              message._tag === 'SelectedCounter' ? 'Navigation' : 'Domain'
            Effect.runSync(
              SubscriptionRef.update(classifications, categories =>
                Array.append(categories, category),
              ),
            )
            return category
          },
          projectDomain: model => model,
        }
        const store = yield* makeInMemoryProgramStore()
        const { appliedEnvelopes, runtime } = yield* makeRuntime()
        const processor = yield* makeProcessor(
          store,
          runtime,
          codec,
          clientId,
          0,
          navigationSynchronization,
        )
        const proposal = yield* processor.propose(
          SelectedCounter.make({ counterId: 'counter-002' }),
        )

        expect(proposal.messageCategory).toBe('Navigation')
        expect(proposal.policyGeneration).toBe(mirrorPolicy.generation)
        expect(proposal.proposedAudience).toEqual(
          Synchronization.SessionAudience.make({}),
        )
        expect((yield* processor.readSnapshot).pendingProposals).toHaveLength(1)

        yield* store.appendAcceptedMessageOccurrence(
          yield* makeOccurrence(proposal, 1),
        )
        yield* processor.connect

        const snapshot = yield* processor.readSnapshot
        const observedClassifications =
          yield* SubscriptionRef.get(classifications)
        expect(snapshot.acceptedSequence).toBe(1)
        expect(snapshot.pendingProposals).toEqual([])
        expect(yield* SubscriptionRef.get(appliedEnvelopes)).toHaveLength(1)
        expect(observedClassifications).toContain('Navigation')
        expect(
          observedClassifications.every(
            classification => classification === 'Navigation',
          ),
        ).toBe(true)
      }),
    ),
  )

  it.effect(
    'keeps SharedDomain navigation optimistic only on its originating Processor',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime: originRuntime } = yield* makeSynchronizedRuntime(5)
          const origin = yield* makeSynchronizedProcessor(
            store,
            originRuntime,
            sharedDomainPolicy,
            'processor-origin',
          )
          const proposal = yield* origin.propose(
            SelectedCounter.make({ counterId: 'counter-002' }),
          )

          expect(proposal.messageCategory).toBe('Navigation')
          expect(proposal.policyGeneration).toBe(sharedDomainPolicy.generation)
          expect(proposal.proposedAudience).toEqual(
            Synchronization.ProcessorAudience.make({
              processorIds: ['processor-origin'],
            }),
          )
          expect((yield* origin.readSnapshot).displayedModel).toEqual({
            count: 5,
            maybeSelectedCounterId: Option.some('counter-002'),
          })

          const { runtime: otherRuntime } = yield* makeSynchronizedRuntime(5)
          const other = yield* makeSynchronizedProcessor(
            store,
            otherRuntime,
            sharedDomainPolicy,
            'processor-other',
          )
          yield* other.connect

          const otherSnapshot = yield* other.readSnapshot
          expect(otherSnapshot.pendingProposals).toEqual([])
          expect(otherSnapshot.displayedModel).toEqual({
            count: 5,
            maybeSelectedCounterId: Option.none(),
          })

          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(proposal, 1, sharedDomainPolicy),
          )
          yield* Stream.runHead(
            Stream.filter(
              other.snapshots,
              snapshot => snapshot.acceptedSequence === 1,
            ),
          )
          yield* origin.connect

          expect((yield* origin.readSnapshot).acceptedModel).toEqual({
            count: 5,
            maybeSelectedCounterId: Option.some('counter-002'),
          })
          expect((yield* other.readSnapshot).acceptedModel).toEqual({
            count: 5,
            maybeSelectedCounterId: Option.none(),
          })
        }),
      ),
  )

  it.effect(
    'rejects Follow Observe navigation before optimistic projection or persistence',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { appliedEnvelopes, runtime } =
            yield* makeSynchronizedRuntime(5)
          const follower = yield* makeSynchronizedProcessor(
            store,
            runtime,
            makeFollowPolicy('Observe'),
            'processor-follower',
          )

          const rejection = yield* Effect.flip(
            follower.propose(
              SelectedCounter.make({ counterId: 'counter-002' }),
            ),
          )
          const proposals = yield* Stream.runHead(
            store.observeMessageProposals({ sessionId, subjectId }),
          )

          expect(rejection).toEqual(
            Synchronization.ReadOnlyFollowerRejected.make({
              leaderProcessorId: 'processor-leader',
              processorId: 'processor-follower',
            }),
          )
          expect((yield* follower.readSnapshot).pendingProposals).toEqual([])
          expect(Option.getOrThrow(proposals)).toEqual([])

          const { runtime: leaderRuntime } = yield* makeSynchronizedRuntime(5)
          const leader = yield* makeSynchronizedProcessor(
            store,
            leaderRuntime,
            makeFollowPolicy('Observe'),
            'processor-leader',
            'client-leader',
          )
          const leaderProposal = yield* leader.propose(
            SelectedCounter.make({ counterId: 'counter-002' }),
          )
          expect(leaderProposal.proposedAudience).toEqual(
            Synchronization.ProcessorAudience.make({
              processorIds: ['processor-follower', 'processor-leader'],
            }),
          )
          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(
              leaderProposal,
              1,
              makeFollowPolicy('Observe'),
            ),
          )
          yield* follower.connect

          const acceptedFollower = yield* follower.readSnapshot
          expect(acceptedFollower.acceptedSequence).toBe(1)
          expect(acceptedFollower.acceptedModel).toEqual({
            count: 5,
            maybeSelectedCounterId: Option.some('counter-002'),
          })
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toHaveLength(1)
        }),
      ),
  )

  it.effect(
    'reports an invalid Program-owned Message category before proposal persistence',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const invalidSynchronization: Program.ProgramSynchronization<
            Model,
            Message
          > = {
            messageCategory: () =>
              S.decodeUnknownSync(Synchronization.MessageCategory)(
                'InvalidCategory',
              ),
            projectDomain: model => model,
          }
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(
            store,
            runtime,
            codec,
            clientId,
            0,
            invalidSynchronization,
          )

          expect(
            yield* Effect.flip(processor.propose(Incremented.make({}))),
          ).toBeInstanceOf(SharedProgramMessageCategoryError)
          expect((yield* processor.readSnapshot).pendingProposals).toEqual([])
          expect(
            Option.getOrThrow(
              yield* Stream.runHead(
                store.observeMessageProposals({ sessionId, subjectId }),
              ),
            ),
          ).toEqual([])
        }),
      ),
  )

  it.effect(
    'lets Follow RemoteControl navigation originate from a granted follower',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeSynchronizedRuntime(5)
          const follower = yield* makeSynchronizedProcessor(
            store,
            runtime,
            makeFollowPolicy('RemoteControl'),
            'processor-follower',
          )

          const proposal = yield* follower.propose(
            SelectedCounter.make({ counterId: 'counter-002' }),
          )

          expect(proposal.proposedAudience).toEqual(
            Synchronization.ProcessorAudience.make({
              processorIds: ['processor-follower', 'processor-leader'],
            }),
          )
          expect((yield* follower.readSnapshot).displayedModel).toEqual({
            count: 5,
            maybeSelectedCounterId: Option.some('counter-002'),
          })

          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(
              proposal,
              1,
              makeFollowPolicy('RemoteControl'),
            ),
          )
          const { runtime: leaderRuntime } = yield* makeSynchronizedRuntime(5)
          const leader = yield* makeSynchronizedProcessor(
            store,
            leaderRuntime,
            makeFollowPolicy('RemoteControl'),
            'processor-leader',
            'client-leader',
          )
          yield* leader.connect
          expect((yield* leader.readSnapshot).acceptedModel).toEqual({
            count: 5,
            maybeSelectedCounterId: Option.some('counter-002'),
          })
        }),
      ),
  )

  it.effect(
    'advances across skipped navigation before applying a later included occurrence',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime: originRuntime } = yield* makeSynchronizedRuntime()
          const origin = yield* makeSynchronizedProcessor(
            store,
            originRuntime,
            sharedDomainPolicy,
            'processor-origin',
            'client-origin',
          )
          const skippedProposal = yield* origin.propose(
            SelectedCounter.make({ counterId: 'counter-002' }),
          )
          const includedProposal = yield* origin.propose(Incremented.make({}))
          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(skippedProposal, 1, sharedDomainPolicy),
          )
          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(includedProposal, 2, sharedDomainPolicy),
          )

          const { appliedEnvelopes, runtime } =
            yield* makeSynchronizedRuntime(5)
          const processor = yield* makeSynchronizedProcessor(
            store,
            runtime,
            sharedDomainPolicy,
            'processor-other',
            'client-other',
          )
          yield* processor.connect

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedSequence).toBe(2)
          expect(snapshot.acceptedModel).toEqual({
            count: 6,
            maybeSelectedCounterId: Option.none(),
          })
          expect(snapshot.displayedModel).toEqual({
            count: 6,
            maybeSelectedCounterId: Option.none(),
          })
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toHaveLength(1)
        }),
      ),
  )

  it.effect(
    'rejects corrupt accepted routing before changing the Model or cursor',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeSynchronizedRuntime(5)
          const processor = yield* makeSynchronizedProcessor(
            store,
            runtime,
            sharedDomainPolicy,
            'processor-origin',
          )
          const proposal = yield* processor.propose(
            SelectedCounter.make({ counterId: 'counter-002' }),
          )
          const occurrence = yield* makeOccurrence(
            proposal,
            1,
            sharedDomainPolicy,
          )
          const corruptOccurrence = InstantAcceptedMessageOccurrenceRecord.make(
            {
              ...occurrence,
              audience: Synchronization.SessionAudience.make({}),
            },
          )
          yield* store.appendAcceptedMessageOccurrence(corruptOccurrence)

          const failure = yield* Effect.flip(processor.connect)
          const snapshot = yield* processor.readSnapshot

          expect(failure).toEqual(
            new SharedProgramAcceptedRoutingMismatch({
              occurrenceId: corruptOccurrence.occurrenceId,
              reason: 'AudienceClaim',
            }),
          )
          expect(snapshot.acceptedSequence).toBe(0)
          expect(snapshot.acceptedModel).toEqual({
            count: 5,
            maybeSelectedCounterId: Option.none(),
          })
        }),
      ),
  )

  it.effect(
    'rejects accepted-row incoherence before changing the Model or cursor',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { appliedEnvelopes, runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const proposal = yield* processor.propose(Incremented.make({}))
          const occurrence = yield* makeOccurrence(proposal, 1)
          const invalidOccurrence = InstantAcceptedMessageOccurrenceRecord.make(
            {
              ...occurrence,
              effectRequestId: 'unexpected-effect-request',
            },
          )
          yield* store.appendAcceptedMessageOccurrence(invalidOccurrence)

          const failure = yield* Effect.flip(processor.connect)
          const snapshot = yield* processor.readSnapshot

          expect(failure).toEqual(
            new SharedProgramAcceptedOccurrenceInvalid({
              occurrenceId: invalidOccurrence.occurrenceId,
              reason:
                InstantAcceptedMessageOccurrenceValidationIssue.make(
                  'ProposalKind',
                ),
            }),
          )
          expect(snapshot.acceptedSequence).toBe(0)
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toEqual([])
        }),
      ),
  )

  it.effect(
    'fences every invalid ordered accepted-policy history before runtime application',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const generatorStore = yield* makeInMemoryProgramStore()
          const { runtime: generatorRuntime } = yield* makeSynchronizedRuntime()
          const generator = yield* makeSynchronizedProcessor(
            generatorStore,
            generatorRuntime,
            sharedDomainPolicy,
            'processor-generator',
          )
          const firstProposal = yield* generator.propose(Incremented.make({}))
          const secondProposal = yield* generator.propose(Incremented.make({}))
          const currentOccurrence = yield* makeOccurrence(
            firstProposal,
            1,
            sharedDomainPolicy,
          )
          const priorOccurrence = yield* makeOccurrence(
            InstantMessageProposalRecord.make({
              ...firstProposal,
              policyGeneration: mirrorPolicy.generation,
            }),
            1,
            mirrorPolicy,
          )
          const priorAfterCurrent = yield* makeOccurrence(
            InstantMessageProposalRecord.make({
              ...secondProposal,
              policyGeneration: mirrorPolicy.generation,
            }),
            2,
            mirrorPolicy,
          )
          const futurePolicy = Synchronization.SessionPolicy.make({
            generation: 2,
            mode: Synchronization.Mirror.make({}),
          })
          const futureOccurrence = yield* makeOccurrence(
            InstantMessageProposalRecord.make({
              ...firstProposal,
              policyGeneration: futurePolicy.generation,
            }),
            1,
            futurePolicy,
          )
          const wrongCurrentPolicy = Synchronization.SessionPolicy.make({
            generation: sharedDomainPolicy.generation,
            mode: Synchronization.Mirror.make({}),
          })
          const wrongCurrentOccurrence = yield* makeOccurrence(
            firstProposal,
            1,
            wrongCurrentPolicy,
          )
          const reusedPriorPolicy = Synchronization.SessionPolicy.make({
            generation: mirrorPolicy.generation,
            mode: Synchronization.SharedDomain.make({}),
          })
          const noncanonicalPriorOccurrence = yield* makeOccurrence(
            InstantMessageProposalRecord.make({
              ...secondProposal,
              policyGeneration: mirrorPolicy.generation,
            }),
            2,
            reusedPriorPolicy,
          )

          const connectFailure = (
            occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
          ) =>
            Effect.gen(function* () {
              const store = yield* makeInMemoryProgramStore()
              yield* Effect.forEach(
                occurrences,
                store.appendAcceptedMessageOccurrence,
                { concurrency: 1, discard: true },
              )
              const { appliedEnvelopes, runtime } =
                yield* makeSynchronizedRuntime()
              const processor = yield* makeSynchronizedProcessor(
                store,
                runtime,
                sharedDomainPolicy,
                'processor-consumer',
              )
              const failure = yield* Effect.flip(processor.connect)
              return {
                appliedEnvelopes: yield* SubscriptionRef.get(appliedEnvelopes),
                failure,
              }
            })

          const decreased = yield* connectFailure([
            currentOccurrence,
            priorAfterCurrent,
          ])
          expect(decreased.failure).toEqual(
            new SharedProgramAcceptedPolicyHistoryMismatch({
              occurrenceId: priorAfterCurrent.occurrenceId,
              reason: 'GenerationDecreased',
            }),
          )
          expect(decreased.appliedEnvelopes).toEqual([])

          const future = yield* connectFailure([futureOccurrence])
          expect(future.failure).toEqual(
            new SharedProgramAcceptedPolicyHistoryMismatch({
              occurrenceId: futureOccurrence.occurrenceId,
              reason: 'FutureGeneration',
            }),
          )
          expect(future.appliedEnvelopes).toEqual([])

          const wrongCurrent = yield* connectFailure([wrongCurrentOccurrence])
          expect(wrongCurrent.failure).toEqual(
            new SharedProgramAcceptedPolicyHistoryMismatch({
              occurrenceId: wrongCurrentOccurrence.occurrenceId,
              reason: 'SessionPolicyClaim',
            }),
          )
          expect(wrongCurrent.appliedEnvelopes).toEqual([])

          const noncanonical = yield* connectFailure([
            priorOccurrence,
            noncanonicalPriorOccurrence,
          ])
          expect(noncanonical.failure).toEqual(
            new SharedProgramAcceptedPolicyHistoryMismatch({
              occurrenceId: noncanonicalPriorOccurrence.occurrenceId,
              reason: 'SessionPolicyClaim',
            }),
          )
          expect(noncanonical.appliedEnvelopes).toEqual([])
        }),
      ),
  )

  it.effect(
    'rejects duplicate accepted effect-result idempotency before runtime application',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const generatorStore = yield* makeInMemoryProgramStore()
          const { runtime: generatorRuntime } = yield* makeRuntime()
          const generator = yield* makeProcessor(
            generatorStore,
            generatorRuntime,
          )
          const causalProposal = yield* generator.propose(Incremented.make({}))
          const firstResultProposal = yield* generator.propose(
            Incremented.make({}),
          )
          const secondResultProposal = yield* generator.propose(
            Incremented.make({}),
          )
          const causalOccurrence = yield* makeOccurrence(causalProposal, 1)
          const effectIdempotencyKey = 'duplicate-accepted-effect-key'
          const asEffectResult = (
            proposal: InstantMessageProposalRecord,
          ): InstantMessageProposalRecord =>
            InstantMessageProposalRecord.make({
              ...proposal,
              causationOccurrenceId: causalOccurrence.occurrenceId,
              effectAssignmentGeneration: 1,
              effectCancellationGeneration: 0,
              effectIdempotencyKey,
              effectRequestId: 'effect-request-duplicate-accepted',
              executorProcessorId: processorId,
              proposalKind: 'EffectResult',
            })
          const firstResult = yield* makeOccurrence(
            asEffectResult(firstResultProposal),
            2,
          )
          const secondResult = yield* makeOccurrence(
            asEffectResult(secondResultProposal),
            3,
          )
          const store = yield* makeInMemoryProgramStore()
          yield* store.appendAcceptedMessageOccurrence(causalOccurrence)
          yield* store.appendAcceptedMessageOccurrence(firstResult)
          yield* store.appendAcceptedMessageOccurrence(secondResult)
          const { appliedEnvelopes, runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)

          const failure = yield* Effect.flip(processor.connect)

          expect(failure).toEqual(
            new SharedProgramAcceptedEffectResultDuplicate({
              effectIdempotencyKey,
              occurrenceId: secondResult.occurrenceId,
            }),
          )
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toEqual([])
          expect((yield* processor.readSnapshot).acceptedSequence).toBe(0)
        }),
      ),
  )

  it.effect(
    'rejects duplicate accepted ordinary-Message identities before optimistic or runtime projection',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const generatorStore = yield* makeInMemoryProgramStore()
          const { runtime: generatorRuntime } = yield* makeRuntime()
          const generator = yield* makeProcessor(
            generatorStore,
            generatorRuntime,
          )
          const messageIdempotencyKey = 'placement-request-duplicate:1:0'
          const input = {
            messageIdempotencyKey,
            maybeCausationOccurrenceId: Option.none<string>(),
            maybeCorrelationId: Option.none<string>(),
          }
          const firstProposal = yield* generator.proposeIdempotentCorrelated(
            Incremented.make({}),
            input,
          )
          const secondProposal = yield* generator.proposeIdempotentCorrelated(
            Incremented.make({}),
            input,
          )
          const firstOccurrence = yield* makeOccurrence(firstProposal, 1)
          const secondOccurrence = yield* makeOccurrence(secondProposal, 2)
          const store = yield* makeInMemoryProgramStore()
          yield* store.appendAcceptedMessageOccurrence(firstOccurrence)
          yield* store.appendAcceptedMessageOccurrence(secondOccurrence)
          const { appliedEnvelopes, runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)

          const failure = yield* Effect.flip(processor.connect)

          expect(failure).toEqual(
            new SharedProgramAcceptedMessageDuplicate({
              messageIdempotencyKey,
              occurrenceId: secondOccurrence.occurrenceId,
            }),
          )
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toEqual([])
          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedSequence).toBe(0)
          expect(snapshot.displayedModel).toEqual({ count: 0 })
        }),
      ),
  )

  it.effect(
    'projects offline proposals without mutating the accepted runtime Model',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { appliedEnvelopes, runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)

          yield* processor.propose(Incremented.make({}))
          const snapshot = yield* processor.readSnapshot
          const proposals = yield* Stream.runHead(
            store.observeMessageProposals({ sessionId, subjectId }),
          )

          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.pendingProposals).toHaveLength(1)
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toEqual([])
          expect(Option.getOrThrow(proposals)).toHaveLength(1)
        }),
      ),
  )

  it.effect(
    'rejects an invalid ordinary-Message identity as a typed error',
    () =>
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        const { runtime } = yield* makeRuntime()
        const processor = yield* makeProcessor(store, runtime)

        expect(
          yield* Effect.flip(
            processor.proposeIdempotentCorrelated(Incremented.make({}), {
              messageIdempotencyKey: '',
              maybeCausationOccurrenceId: Option.none(),
              maybeCorrelationId: Option.none(),
            }),
          ),
        ).toBeInstanceOf(SharedProgramMessageIdempotencyKeyInvalid)
        expect((yield* processor.readSnapshot).pendingProposals).toEqual([])
      }),
  )

  it.effect(
    'projects ordinary-Message aliases once and clears every pending alias on acceptance',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { appliedEnvelopes, runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          yield* processor.connect
          const messageIdempotencyKey = 'placement-request-pending:1:0'
          const input = {
            messageIdempotencyKey,
            maybeCausationOccurrenceId: Option.none<string>(),
            maybeCorrelationId: Option.none<string>(),
          }
          const original = yield* processor.proposeIdempotentCorrelated(
            Incremented.make({}),
            input,
          )
          yield* processor.proposeIdempotentCorrelated(
            Incremented.make({}),
            input,
          )

          const pendingSnapshot = yield* processor.readSnapshot
          expect(pendingSnapshot.acceptedModel).toEqual({ count: 0 })
          expect(pendingSnapshot.displayedModel).toEqual({ count: 1 })
          expect(pendingSnapshot.pendingProposals).toHaveLength(2)

          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(original, 1),
          )
          yield* Stream.runHead(
            Stream.filter(
              processor.snapshots,
              snapshot => snapshot.acceptedSequence === 1,
            ),
          )

          const acceptedSnapshot = yield* processor.readSnapshot
          expect(acceptedSnapshot.acceptedModel).toEqual({ count: 1 })
          expect(acceptedSnapshot.displayedModel).toEqual({ count: 1 })
          expect(acceptedSnapshot.pendingProposals).toEqual([])
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toHaveLength(1)
        }),
      ),
  )

  it.effect(
    'rebases noncommutative local Messages in actor order without double application',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime(5)
          const processor = yield* makeProcessor(store, runtime)
          const incrementProposal = yield* processor.propose(
            Incremented.make({}),
          )
          const resetProposal = yield* processor.propose(ResetCounter.make({}))

          expect((yield* processor.readSnapshot).displayedModel).toEqual({
            count: 0,
          })

          const remoteStore = yield* makeInMemoryProgramStore()
          const { runtime: remoteRuntime } = yield* makeRuntime()
          const remoteProcessor = yield* makeProcessor(
            remoteStore,
            remoteRuntime,
            codec,
            'client-remote',
          )
          yield* remoteProcessor.propose(Incremented.make({}))
          yield* remoteProcessor.propose(Incremented.make({}))
          const remoteProposal = yield* remoteProcessor.propose(
            Incremented.make({}),
          )
          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(remoteProposal, 1),
          )
          yield* processor.connect

          const remotelyRebased = yield* processor.readSnapshot
          expect(remotelyRebased.acceptedModel).toEqual({ count: 6 })
          expect(remotelyRebased.displayedModel).toEqual({ count: 0 })
          expect(remotelyRebased.pendingProposals).toHaveLength(2)

          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(incrementProposal, 2),
          )
          yield* Stream.runHead(
            Stream.filter(
              processor.snapshots,
              snapshot => snapshot.acceptedSequence === 2,
            ),
          )
          const incrementAccepted = yield* processor.readSnapshot
          expect(incrementAccepted.acceptedModel).toEqual({ count: 7 })
          expect(incrementAccepted.displayedModel).toEqual({ count: 0 })
          expect(incrementAccepted.pendingProposals).toHaveLength(1)

          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(resetProposal, 3),
          )
          yield* Stream.runHead(
            Stream.filter(
              processor.snapshots,
              snapshot => snapshot.acceptedSequence === 3,
            ),
          )
          const converged = yield* processor.readSnapshot
          expect(converged.acceptedModel).toEqual({ count: 0 })
          expect(converged.displayedModel).toEqual({ count: 0 })
          expect(converged.pendingProposals).toEqual([])
        }),
      ),
  )

  it.effect(
    'rejects malformed or metadata-divergent generic codec records before admission',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const proposal = yield* processor.propose(Incremented.make({}))
          const malformed = InstantMessageProposalRecord.make({
            ...proposal,
            payloadJson: '{}',
          })
          const divergent = InstantMessageProposalRecord.make({
            ...proposal,
            eventId: 'counter.divergent',
          })

          expect(
            yield* Effect.flip(
              codec.acceptEnvelope(malformed, {
                acceptedAtMs: 1_753_825_100_001,
                acceptedSequence: 1,
                acceptingProcessorId: authorityProcessorId,
              }),
            ),
          ).toBeInstanceOf(SharedProgramCodecError)
          expect(
            yield* Effect.flip(
              codec.acceptEnvelope(divergent, {
                acceptedAtMs: 1_753_825_100_001,
                acceptedSequence: 1,
                acceptingProcessorId: authorityProcessorId,
              }),
            ),
          ).toBeInstanceOf(SharedProgramCodecError)

          const occurrence = yield* makeOccurrence(proposal, 1)
          const forgedOccurrence = InstantAcceptedMessageOccurrenceRecord.make({
            ...occurrence,
            eventId: 'counter.divergent',
          })
          expect(
            yield* Effect.flip(codec.decodeAccepted(forgedOccurrence)),
          ).toBeInstanceOf(SharedProgramCodecError)
        }),
      ),
  )

  it.effect(
    'quarantines an invalid proposed payload without stopping observation',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const rejectingCodec: SharedProgramMessageCodec<Message, Envelope> = {
            ...codec,
            decodeProposed: () =>
              Effect.fail(
                new SharedProgramCodecError({
                  cause: new Error('Invalid local proposal.'),
                  operation: 'DecodeProposed',
                }),
              ),
          }
          const processor = yield* makeProcessor(store, runtime, rejectingCodec)

          yield* processor.propose(Incremented.make({}))
          yield* processor.connect

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 0 })
          expect(snapshot.pendingProposals).toHaveLength(1)
          expect(snapshot.connection).toEqual({
            _tag: 'Attached',
            transportStatus: 'authenticated',
          })
        }),
      ),
  )

  it.effect(
    'does not project proposals outside its scope or with invalid kind fields',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const generatorStore = yield* makeInMemoryProgramStore()
          const { runtime: generatorRuntime } = yield* makeRuntime()
          const generator = yield* makeProcessor(
            generatorStore,
            generatorRuntime,
          )
          const proposal = yield* generator.propose(Incremented.make({}))
          const foreignProposal = InstantMessageProposalRecord.make({
            ...proposal,
            proposalId: 'proposal-foreign',
            sessionId: 'session-other',
            subjectId: 'subject-other',
          })
          const invalidKindProposal = InstantMessageProposalRecord.make({
            ...proposal,
            effectAssignmentGeneration: 1,
            effectCancellationGeneration: 0,
            effectIdempotencyKey: 'unexpected-effect-key',
            effectRequestId: 'unexpected-effect-request',
            executorProcessorId: processorId,
          })
          const baseStore = yield* makeInMemoryProgramStore()
          const store: ProgramStoreService = {
            ...baseStore,
            observeMessageProposals: () =>
              Stream.make([foreignProposal, invalidKindProposal]).pipe(
                Stream.concat(Stream.never),
              ),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)

          yield* processor.connect

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 0 })
          expect(snapshot.pendingProposals).toEqual([
            {
              persistence: 'Enqueued',
              proposal: invalidKindProposal,
            },
          ])
        }),
      ),
  )

  it.effect(
    'rejects accepted occurrences not written by the session sequencer',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const proposal = yield* processor.propose(Incremented.make({}))
          const occurrence = yield* makeOccurrence(proposal, 1)
          yield* store.appendAcceptedMessageOccurrence(
            InstantAcceptedMessageOccurrenceRecord.make({
              ...occurrence,
              acceptingProcessorId: 'processor-not-the-sequencer',
            }),
          )

          expect(yield* Effect.flip(processor.connect)).toBeInstanceOf(
            SharedProgramAdmissionSequencerMismatch,
          )
          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.acceptedSequence).toBe(0)
          expect(snapshot.displayedModel).toEqual({ count: 1 })
        }),
      ),
  )

  it.effect(
    'rejects proposal resolutions not written by the session sequencer',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const proposal = yield* processor.propose(Incremented.make({}))
          yield* store.appendMessageProposalResolution(
            InstantMessageProposalResolutionRecord.make({
              actorId: proposal.actorId,
              actorSequence: proposal.actorSequence,
              clientId: proposal.clientId,
              id: proposal.proposalId,
              programId,
              programVersion,
              protocolVersion: instantProgramProtocolVersion,
              proposalId: proposal.proposalId,
              rejectedAtMs: 1_753_825_100_002,
              rejectingProcessorId: 'processor-not-the-sequencer',
              rejectionReason: 'EnvelopeInvalid',
              sessionId,
              subjectId,
            }),
          )

          expect(yield* Effect.flip(processor.connect)).toBeInstanceOf(
            SharedProgramAdmissionSequencerMismatch,
          )
          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.pendingProposals).toHaveLength(1)
        }),
      ),
  )

  it.effect(
    'fails closed on a proposal resolution outside the authenticated Program scope',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const proposal = yield* processor.propose(Incremented.make({}))
          const resolution = InstantMessageProposalResolutionRecord.make({
            actorId: proposal.actorId,
            actorSequence: proposal.actorSequence,
            clientId: proposal.clientId,
            id: proposal.proposalId,
            programId: 'different-program',
            programVersion,
            protocolVersion: instantProgramProtocolVersion,
            proposalId: proposal.proposalId,
            rejectedAtMs: 1_753_825_100_002,
            rejectingProcessorId: authorityProcessorId,
            rejectionReason: 'EnvelopeInvalid',
            sessionId,
            subjectId,
          })
          yield* store.appendMessageProposalResolution(resolution)

          expect(yield* Effect.flip(processor.connect)).toEqual(
            new SharedProgramProposalResolutionScopeMismatch({
              resolutionId: resolution.id,
            }),
          )
          expect((yield* processor.readSnapshot).pendingProposals).toHaveLength(
            1,
          )
        }),
      ),
  )

  it.effect(
    'fails closed on contradictory accepted and rejected terminals after restart',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const generator = yield* makeProcessor(store, runtime)
          const proposal = yield* generator.propose(Incremented.make({}))
          const occurrence = yield* makeOccurrence(proposal, 1)
          yield* store.appendAcceptedMessageOccurrence(occurrence)
          yield* store.appendMessageProposalResolution(
            InstantMessageProposalResolutionRecord.make({
              actorId: proposal.actorId,
              actorSequence: proposal.actorSequence,
              clientId: proposal.clientId,
              id: proposal.proposalId,
              programId,
              programVersion,
              protocolVersion: instantProgramProtocolVersion,
              proposalId: proposal.proposalId,
              rejectedAtMs: 1_753_825_100_002,
              rejectingProcessorId: authorityProcessorId,
              rejectionReason: 'EnvelopeInvalid',
              sessionId,
              subjectId,
            }),
          )
          const { runtime: restartedRuntime } = yield* makeRuntime()
          const restarted = yield* makeProcessor(store, restartedRuntime)

          expect(yield* Effect.flip(restarted.connect)).toEqual(
            new SharedProgramProposalResolutionMismatch({
              proposalId: proposal.proposalId,
              reason: 'AcceptedAndRejected',
            }),
          )
        }),
      ),
  )

  it.effect(
    'applies accepted occurrences exactly once and clears matching pending proposals',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { appliedEnvelopes, runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const proposal = yield* processor.propose(Incremented.make({}))
          const authority = yield* makeAcceptanceAuthority({
            acceptEnvelope: codec.acceptEnvelope,
            now: () => 1_753_825_100_001,
            session,
            store,
          })

          yield* authority.recoverAcceptedOccurrences([])
          yield* authority.recoverEffectRequests([])
          const accepted = yield* authority.admit(proposal)
          yield* processor.connect
          yield* store.appendAcceptedMessageOccurrence(accepted)

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 1 })
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.connection).toEqual({
            _tag: 'Attached',
            transportStatus: 'authenticated',
          })
          expect(snapshot.pendingProposals).toEqual([])
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toHaveLength(1)
        }),
      ),
  )

  it.effect(
    'does not re-project proposals already covered by a restored checkpoint',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime: generatorRuntime } = yield* makeRuntime()
          const generator = yield* makeProcessor(store, generatorRuntime)
          const firstProposal = yield* generator.propose(Incremented.make({}))
          const secondProposal = yield* generator.propose(Incremented.make({}))
          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(firstProposal, 1),
          )
          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(secondProposal, 2),
          )
          const { appliedEnvelopes, runtime } = yield* makeRuntime(1)
          const restored = yield* makeProcessor(
            store,
            runtime,
            codec,
            clientId,
            1,
          )

          yield* restored.connect

          const snapshot = yield* restored.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 2 })
          expect(snapshot.acceptedSequence).toBe(2)
          expect(snapshot.displayedModel).toEqual({ count: 2 })
          expect(snapshot.pendingProposals).toEqual([])
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toHaveLength(1)
        }),
      ),
  )

  it.effect(
    'suppresses an ordinary-Message alias snapshot that arrives after acceptance',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const generatorStore = yield* makeInMemoryProgramStore()
          const { runtime: generatorRuntime } = yield* makeRuntime()
          const generator = yield* makeProcessor(
            generatorStore,
            generatorRuntime,
          )
          const input = {
            messageIdempotencyKey: 'placement-query-skew:1:0',
            maybeCausationOccurrenceId: Option.none<string>(),
            maybeCorrelationId: Option.none<string>(),
          }
          const original = yield* generator.proposeIdempotentCorrelated(
            Incremented.make({}),
            input,
          )
          const alias = yield* generator.proposeIdempotentCorrelated(
            Incremented.make({}),
            input,
          )
          const occurrence = yield* makeOccurrence(original, 1)
          const acceptedAllowed = yield* Deferred.make<void>()
          const proposalsAllowed = yield* Deferred.make<void>()
          const baseStore = yield* makeInMemoryProgramStore()
          const store: ProgramStoreService = {
            ...baseStore,
            observeAcceptedMessageOccurrences: () =>
              Stream.fromEffect(
                Deferred.await(acceptedAllowed).pipe(Effect.as([occurrence])),
              ).pipe(Stream.concat(Stream.never)),
            observeMessageProposals: () =>
              Stream.fromEffect(
                Deferred.await(proposalsAllowed).pipe(Effect.as([alias])),
              ).pipe(Stream.concat(Stream.never)),
          }
          const { appliedEnvelopes, runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const connected = yield* Effect.forkChild(processor.connect)
          const acceptedApplied = yield* Effect.forkChild(
            Stream.runHead(
              Stream.filter(
                SubscriptionRef.changes(appliedEnvelopes),
                Array.isReadonlyArrayNonEmpty,
              ),
            ),
          )

          yield* Deferred.succeed(acceptedAllowed, undefined)
          yield* Fiber.join(acceptedApplied)
          yield* Deferred.succeed(proposalsAllowed, undefined)
          yield* Fiber.join(connected)

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 1 })
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.pendingProposals).toEqual([])
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toHaveLength(1)
        }),
      ),
  )

  it.effect(
    'requeues a synced optimistic proposal removed without a terminal resolution',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const proposals = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalRecord>
          >([])
          const store: ProgramStoreService = {
            ...baseStore,
            observeMessageProposals: () => SubscriptionRef.changes(proposals),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          yield* processor.connect
          const proposal = yield* processor.propose(Incremented.make({}))
          yield* SubscriptionRef.set(proposals, [proposal])
          yield* Stream.runHead(
            Stream.filter(processor.snapshots, snapshot =>
              Array.isReadonlyArrayNonEmpty(snapshot.pendingProposals),
            ),
          )
          expect((yield* processor.readSnapshot).displayedModel).toEqual({
            count: 1,
          })
          const removalProcessed = yield* Effect.forkChild(
            Stream.runHead(
              Stream.filter(processor.snapshots, snapshot =>
                Array.some(
                  snapshot.pendingProposals,
                  pending =>
                    pending.proposal.proposalId === proposal.proposalId &&
                    pending.persistence === 'Local',
                ),
              ),
            ),
          )

          yield* SubscriptionRef.set(proposals, [])
          yield* Fiber.join(removalProcessed)

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.pendingProposals).toMatchObject([
            {
              persistence: 'Local',
              proposal: { proposalId: proposal.proposalId },
            },
          ])
        }),
      ),
  )

  it.effect(
    'requeues an enqueued optimistic proposal after a later Instant rollback',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore(
            enqueuedTransactionOutcome('offline-client'),
          )
          const proposals = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalRecord>
          >([])
          const store: ProgramStoreService = {
            ...baseStore,
            observeMessageProposals: () => SubscriptionRef.changes(proposals),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          yield* processor.connect
          const proposal = yield* processor.propose(Incremented.make({}))
          expect(
            (yield* processor.readSnapshot).pendingProposals,
          ).toMatchObject([{ persistence: 'Enqueued' }])

          yield* SubscriptionRef.set(proposals, [proposal])
          yield* Stream.runHead(
            Stream.filter(processor.snapshots, snapshot =>
              Array.some(
                snapshot.pendingProposals,
                pending => pending.proposal.proposalId === proposal.proposalId,
              ),
            ),
          )
          const removalProcessed = yield* Effect.forkChild(
            Stream.runHead(
              Stream.filter(processor.snapshots, snapshot =>
                Array.some(
                  snapshot.pendingProposals,
                  pending =>
                    pending.proposal.proposalId === proposal.proposalId &&
                    pending.persistence === 'Local',
                ),
              ),
            ),
          )

          yield* SubscriptionRef.set(proposals, [])
          yield* Fiber.join(removalProcessed)

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.pendingProposals).toMatchObject([
            {
              persistence: 'Local',
              proposal: { proposalId: proposal.proposalId },
            },
          ])
        }),
      ),
  )

  it.effect('rolls back and suppresses a durably rejected proposal', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        const { runtime } = yield* makeRuntime()
        const processor = yield* makeProcessor(store, runtime)
        yield* processor.connect
        const proposal = yield* processor.propose(Incremented.make({}))
        expect((yield* processor.readSnapshot).displayedModel).toEqual({
          count: 1,
        })
        const rolledBack = yield* Effect.forkChild(
          Stream.runHead(
            Stream.filter(processor.snapshots, snapshot =>
              Array.isReadonlyArrayEmpty(snapshot.pendingProposals),
            ),
          ),
        )

        yield* store.appendMessageProposalResolution(
          InstantMessageProposalResolutionRecord.make({
            actorId: proposal.actorId,
            actorSequence: proposal.actorSequence,
            clientId: proposal.clientId,
            id: proposal.proposalId,
            programId,
            programVersion,
            protocolVersion: instantProgramProtocolVersion,
            proposalId: proposal.proposalId,
            rejectedAtMs: 1_753_825_100_002,
            rejectingProcessorId: authorityProcessorId,
            rejectionReason: 'EnvelopeInvalid',
            sessionId,
            subjectId,
          }),
        )
        yield* Fiber.join(rolledBack)

        const rejectedSnapshot = yield* processor.readSnapshot
        expect(rejectedSnapshot.acceptedModel).toEqual({ count: 0 })
        expect(rejectedSnapshot.displayedModel).toEqual({ count: 0 })
        expect(rejectedSnapshot.pendingProposals).toEqual([])

        yield* processor.disconnect
        yield* processor.connect

        const reconnectedSnapshot = yield* processor.readSnapshot
        expect(reconnectedSnapshot.displayedModel).toEqual({ count: 0 })
        expect(reconnectedSnapshot.pendingProposals).toEqual([])
      }),
    ),
  )

  it.effect(
    'defers a post-connect resolution until its proposal snapshot catches up',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const proposalRows = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalRecord>
          >([])
          const resolutionRows = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalResolutionRecord>
          >([])
          const store: ProgramStoreService = {
            ...baseStore,
            observeMessageProposalResolutions: () =>
              SubscriptionRef.changes(resolutionRows),
            observeMessageProposals: () =>
              SubscriptionRef.changes(proposalRows),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          yield* processor.connect
          const proposal = yield* processor.propose(Incremented.make({}))
          const resolution = InstantMessageProposalResolutionRecord.make({
            actorId: proposal.actorId,
            actorSequence: proposal.actorSequence,
            clientId: proposal.clientId,
            id: proposal.proposalId,
            programId,
            programVersion,
            protocolVersion: instantProgramProtocolVersion,
            proposalId: proposal.proposalId,
            rejectedAtMs: 1_753_825_100_002,
            rejectingProcessorId: authorityProcessorId,
            rejectionReason: 'EnvelopeInvalid',
            sessionId,
            subjectId,
          })
          const snapshotObservationStarted = yield* Deferred.make<void>()
          const resolutionReconciled = yield* Effect.forkChild(
            Stream.runHead(
              processor.snapshots.pipe(
                Stream.tap(() =>
                  Deferred.succeed(snapshotObservationStarted, undefined).pipe(
                    Effect.asVoid,
                  ),
                ),
                Stream.drop(1),
              ),
            ),
          )

          yield* Deferred.await(snapshotObservationStarted)
          yield* SubscriptionRef.set(resolutionRows, [resolution])
          yield* Fiber.join(resolutionReconciled)

          const deferredSnapshot = yield* processor.readSnapshot
          expect(deferredSnapshot.connection).toEqual({
            _tag: 'Attached',
            transportStatus: 'authenticated',
          })
          expect(deferredSnapshot.pendingProposals).toMatchObject([
            { proposal: { proposalId: proposal.proposalId } },
          ])

          const rolledBack = yield* Effect.forkChild(
            Stream.runHead(
              Stream.filter(processor.snapshots, snapshot =>
                Array.isReadonlyArrayEmpty(snapshot.pendingProposals),
              ),
            ),
          )
          yield* SubscriptionRef.set(proposalRows, [proposal])
          yield* Fiber.join(rolledBack)

          const resolvedSnapshot = yield* processor.readSnapshot
          expect(resolvedSnapshot.connection).toEqual({
            _tag: 'Attached',
            transportStatus: 'authenticated',
          })
          expect(resolvedSnapshot.pendingProposals).toEqual([])
        }),
      ),
  )

  it.effect(
    'suppresses a proposal snapshot that arrives after its rejection',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const generatorStore = yield* makeInMemoryProgramStore()
          const { runtime: generatorRuntime } = yield* makeRuntime()
          const generator = yield* makeProcessor(
            generatorStore,
            generatorRuntime,
          )
          const proposal = yield* generator.propose(Incremented.make({}))
          const resolution = InstantMessageProposalResolutionRecord.make({
            actorId: proposal.actorId,
            actorSequence: proposal.actorSequence,
            clientId: proposal.clientId,
            id: proposal.proposalId,
            programId,
            programVersion,
            protocolVersion: instantProgramProtocolVersion,
            proposalId: proposal.proposalId,
            rejectedAtMs: 1_753_825_100_002,
            rejectingProcessorId: authorityProcessorId,
            rejectionReason: 'EnvelopeInvalid',
            sessionId,
            subjectId,
          })
          const proposalsAllowed = yield* Deferred.make<void>()
          const resolutionEmitted = yield* Deferred.make<void>()
          const baseStore = yield* makeInMemoryProgramStore()
          const store: ProgramStoreService = {
            ...baseStore,
            observeMessageProposals: () =>
              Stream.fromEffect(
                Deferred.await(proposalsAllowed).pipe(Effect.as([proposal])),
              ).pipe(Stream.concat(Stream.never)),
            observeMessageProposalResolutions: () =>
              Stream.fromEffect(
                Deferred.succeed(resolutionEmitted, undefined).pipe(
                  Effect.as([resolution]),
                ),
              ).pipe(Stream.concat(Stream.never)),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const connected = yield* Effect.forkChild(processor.connect)

          yield* Deferred.await(resolutionEmitted)
          yield* Effect.yieldNow
          yield* Deferred.succeed(proposalsAllowed, undefined)
          yield* Fiber.join(connected)

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 0 })
          expect(snapshot.pendingProposals).toEqual([])
        }),
      ),
  )

  it.effect(
    'waits for initial rejection state before restoring a proposal snapshot',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const generatorStore = yield* makeInMemoryProgramStore()
          const { runtime: generatorRuntime } = yield* makeRuntime()
          const generator = yield* makeProcessor(
            generatorStore,
            generatorRuntime,
          )
          const proposal = yield* generator.propose(Incremented.make({}))
          const resolution = InstantMessageProposalResolutionRecord.make({
            actorId: proposal.actorId,
            actorSequence: proposal.actorSequence,
            clientId: proposal.clientId,
            id: proposal.proposalId,
            programId,
            programVersion,
            protocolVersion: instantProgramProtocolVersion,
            proposalId: proposal.proposalId,
            rejectedAtMs: 1_753_825_100_002,
            rejectingProcessorId: authorityProcessorId,
            rejectionReason: 'EnvelopeInvalid',
            sessionId,
            subjectId,
          })
          const proposalEmitted = yield* Deferred.make<void>()
          const resolutionsAllowed = yield* Deferred.make<void>()
          const baseStore = yield* makeInMemoryProgramStore()
          const store: ProgramStoreService = {
            ...baseStore,
            observeMessageProposals: () =>
              Stream.fromEffect(
                Deferred.succeed(proposalEmitted, undefined).pipe(
                  Effect.as([proposal]),
                ),
              ).pipe(Stream.concat(Stream.never)),
            observeMessageProposalResolutions: () =>
              Stream.fromEffect(
                Deferred.await(resolutionsAllowed).pipe(
                  Effect.as([resolution]),
                ),
              ).pipe(Stream.concat(Stream.never)),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const connected = yield* Effect.forkChild(processor.connect)

          yield* Deferred.await(proposalEmitted)
          yield* Effect.yieldNow
          const initializing = yield* processor.readSnapshot
          expect(initializing.displayedModel).toEqual({ count: 0 })
          expect(initializing.pendingProposals).toEqual([])

          yield* Deferred.succeed(resolutionsAllowed, undefined)
          yield* Fiber.join(connected)

          const connectedSnapshot = yield* processor.readSnapshot
          expect(connectedSnapshot.displayedModel).toEqual({ count: 0 })
          expect(connectedSnapshot.pendingProposals).toEqual([])
        }),
      ),
  )

  it.effect('buffers gaps, reconnects, and keeps replay inspection inert', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        const { appliedEnvelopes, runtime } = yield* makeRuntime()
        const processor = yield* makeProcessor(store, runtime)
        const firstProposal = yield* processor.propose(Incremented.make({}))
        const secondProposal = yield* processor.propose(Incremented.make({}))
        const thirdProposal = yield* processor.propose(Incremented.make({}))
        const first = yield* makeOccurrence(firstProposal, 1)
        const second = yield* makeOccurrence(secondProposal, 2)
        const third = yield* makeOccurrence(thirdProposal, 3)

        yield* store.appendAcceptedMessageOccurrence(first)
        yield* store.appendAcceptedMessageOccurrence(third)
        yield* processor.connect

        const bufferedGap = yield* processor.readSnapshot
        expect(bufferedGap.acceptedModel).toEqual({ count: 1 })
        expect(bufferedGap.displayedModel).toEqual({ count: 3 })
        expect(bufferedGap.pendingProposals).toHaveLength(2)

        yield* processor.inspectReplay(9)
        yield* store.appendAcceptedMessageOccurrence(second)
        yield* Stream.runHead(
          Stream.filter(
            processor.snapshots,
            snapshot => snapshot.acceptedSequence === 3,
          ),
        )
        const inspecting = yield* processor.readSnapshot
        expect(inspecting.acceptedModel).toEqual({ count: 3 })
        expect(inspecting.displayedModel).toEqual({ count: 9 })
        expect(yield* SubscriptionRef.get(appliedEnvelopes)).toHaveLength(3)

        yield* processor.propose(Incremented.make({}))
        const inspectingWithPending = yield* processor.readSnapshot
        expect(inspectingWithPending.acceptedModel).toEqual({ count: 3 })
        expect(inspectingWithPending.displayedModel).toEqual({ count: 9 })
        expect(inspectingWithPending.pendingProposals).toHaveLength(1)

        yield* processor.returnLive
        expect((yield* processor.readSnapshot).displayedModel).toEqual({
          count: 4,
        })

        yield* processor.disconnect
        const fourthProposal = InstantMessageProposalRecord.make({
          ...thirdProposal,
          actorSequence: 4,
          envelopeJson: makeProposedEnvelopeJson('occurrence-004'),
          id: 'occurrence-004',
          occurrenceId: 'occurrence-004',
          proposalId: 'occurrence-004',
        })
        const fourth = yield* makeOccurrence(fourthProposal, 4)
        yield* store.appendAcceptedMessageOccurrence(fourth)
        expect((yield* processor.readSnapshot).acceptedModel).toEqual({
          count: 3,
        })

        yield* processor.connect
        expect((yield* processor.readSnapshot).acceptedModel).toEqual({
          count: 4,
        })
      }),
    ),
  )

  it.effect('scope closure waits for detached subscription releases', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const releaseAllowed = yield* Deferred.make<void>()
        const releaseFinished = yield* Deferred.make<void>()
        const releaseStarted = yield* Deferred.make<void>()
        const baseStore = yield* makeInMemoryProgramStore()
        const store: ProgramStoreService = {
          ...baseStore,
          observeAcceptedMessageOccurrences: scope =>
            baseStore.observeAcceptedMessageOccurrences(scope).pipe(
              Stream.ensuring(
                Effect.gen(function* () {
                  yield* Deferred.succeed(releaseStarted, undefined)
                  yield* Deferred.await(releaseAllowed).pipe(
                    Effect.uninterruptible,
                  )
                  yield* Deferred.succeed(releaseFinished, undefined)
                }),
              ),
            ),
        }
        const { runtime } = yield* makeRuntime()
        const scopedProcessor = Effect.scoped(
          Effect.gen(function* () {
            const processor = yield* makeProcessor(store, runtime)
            yield* processor.connect
            yield* processor.disconnect.pipe(Effect.timeout('1 second'))
            expect((yield* processor.readSnapshot).connection).toEqual({
              _tag: 'Detached',
            })
          }),
        )
        const scopeFiber = yield* Effect.forkChild(scopedProcessor)

        yield* Deferred.await(releaseStarted)
        expect(scopeFiber.pollUnsafe()).toBeUndefined()

        yield* Deferred.succeed(releaseAllowed, undefined)
        yield* Fiber.join(scopeFiber).pipe(Effect.timeout('1 second'))
        expect(yield* Deferred.isDone(releaseFinished)).toBe(true)
      }),
    ),
  )

  it.effect(
    'waits for an accepted application before starting a replacement transport',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const appliedCount = yield* SubscriptionRef.make(0)
          const model = yield* SubscriptionRef.make(Model.make({ count: 0 }))
          const runAllowed = yield* Deferred.make<void>()
          const runStarted = yield* Deferred.make<void>()
          const runtime: SharedProgramRuntime<Model, Message, Envelope, never> =
            {
              project: (currentModel, messages) =>
                Model.make({
                  count: currentModel.count + Array.length(messages),
                }),
              readModel: () => Effect.runSync(SubscriptionRef.get(model)),
              replay: {
                inspect: frame => Effect.succeed(Model.make({ count: frame })),
              },
              run: () =>
                Effect.gen(function* () {
                  yield* SubscriptionRef.update(
                    appliedCount,
                    count => count + 1,
                  )
                  yield* Deferred.succeed(runStarted, undefined)
                  yield* Deferred.await(runAllowed).pipe(Effect.uninterruptible)
                  return yield* SubscriptionRef.updateAndGet(model, current =>
                    Model.make({ count: current.count + 1 }),
                  )
                }),
            }
          const processor = yield* makeProcessor(store, runtime)
          const proposal = yield* processor.propose(Incremented.make({}))
          const occurrence = yield* makeOccurrence(proposal, 1)
          yield* store.appendAcceptedMessageOccurrence(occurrence)

          const firstConnectFiber = yield* Effect.forkChild(processor.connect)
          yield* Deferred.await(runStarted)
          const disconnectFiber = yield* Effect.forkChild(processor.disconnect)
          yield* Stream.runHead(
            Stream.filter(
              processor.snapshots,
              snapshot => snapshot.connection._tag === 'Detached',
            ),
          )
          const secondConnectFiber = yield* Effect.forkChild(processor.connect)
          expect(secondConnectFiber.pollUnsafe()).toBeUndefined()
          expect(yield* SubscriptionRef.get(appliedCount)).toBe(1)
          yield* Effect.promise(
            () =>
              new Promise(resolve => {
                setTimeout(resolve, lifecycleSchedulingBarrierMs)
              }),
          )

          yield* Deferred.succeed(runAllowed, undefined)
          yield* Fiber.join(disconnectFiber).pipe(Effect.timeout('1 second'))
          const firstConnectExit = yield* Fiber.await(firstConnectFiber)
          expect(Exit.isFailure(firstConnectExit)).toBe(true)
          yield* Fiber.join(secondConnectFiber).pipe(Effect.timeout('1 second'))

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 1 })
          expect(snapshot.acceptedSequence).toBe(1)
          expect(yield* SubscriptionRef.get(appliedCount)).toBe(1)
        }),
      ),
  )

  it.effect(
    'keeps shared initialization alive when one connect caller is interrupted',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const store: ProgramStoreService = {
            ...baseStore,
            observeConnectionStatus: Stream.never,
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const firstConnectFiber = yield* Effect.forkChild(processor.connect)
          yield* Stream.runHead(
            Stream.filter(
              processor.snapshots,
              snapshot => snapshot.connection._tag === 'Attached',
            ),
          )
          const secondConnectFiber = yield* Effect.forkChild(processor.connect)
          yield* Effect.yieldNow

          yield* Fiber.interrupt(firstConnectFiber).pipe(
            Effect.timeout('1 second'),
          )
          expect(secondConnectFiber.pollUnsafe()).toBeUndefined()
          expect((yield* processor.readSnapshot).connection._tag).toBe(
            'Attached',
          )

          yield* processor.disconnect.pipe(Effect.timeout('1 second'))
          const secondConnectExit = yield* Fiber.await(secondConnectFiber)
          expect(Exit.isFailure(secondConnectExit)).toBe(true)
          expect((yield* processor.readSnapshot).connection).toEqual({
            _tag: 'Detached',
          })
        }),
      ),
  )

  it.effect('completes a connect waiter when its allocation Scope closes', () =>
    Effect.gen(function* () {
      const baseStore = yield* makeInMemoryProgramStore()
      const store: ProgramStoreService = {
        ...baseStore,
        observeConnectionStatus: Stream.never,
      }
      const { runtime } = yield* makeRuntime()
      const processorScope = yield* Scope.make()
      const processor = yield* makeProcessor(store, runtime).pipe(
        Effect.provideService(Scope.Scope, processorScope),
      )
      const connectFiber = yield* Effect.forkChild(processor.connect)
      yield* Stream.runHead(
        Stream.filter(
          processor.snapshots,
          snapshot => snapshot.connection._tag === 'Attached',
        ),
      )

      yield* Scope.close(processorScope, Exit.void)
      const connectExit = yield* Fiber.await(connectFiber)
      expect(Exit.isFailure(connectExit)).toBe(true)
    }),
  )

  it.effect(
    'keeps a completed disconnect terminal after an authenticated flush fails',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const appendAllowed = yield* Deferred.make<void>()
          const blockedAppendStarted = yield* Deferred.make<void>()
          const connectionStatus = yield* SubscriptionRef.make<
            'authenticated' | 'closed'
          >('closed')
          const isAppendBlocked = yield* SubscriptionRef.make(false)
          const store: ProgramStoreService = {
            ...baseStore,
            appendMessageProposal: () =>
              SubscriptionRef.get(isAppendBlocked).pipe(
                Effect.flatMap(isBlocked => {
                  if (isBlocked) {
                    return Effect.gen(function* () {
                      yield* Deferred.succeed(blockedAppendStarted, undefined)
                      yield* Deferred.await(appendAllowed)
                      return yield* Effect.fail(
                        new ProgramStoreError({
                          cause: new Error('Temporary append failure.'),
                          operation: 'AppendMessageProposal',
                        }),
                      )
                    })
                  } else {
                    return Effect.fail(
                      new ProgramStoreError({
                        cause: new Error('Temporary append failure.'),
                        operation: 'AppendMessageProposal',
                      }),
                    )
                  }
                }),
              ),
            observeConnectionStatus: SubscriptionRef.changes(connectionStatus),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          yield* processor.connect
          yield* processor.propose(Incremented.make({}))
          expect(
            (yield* processor.readSnapshot).pendingProposals,
          ).toMatchObject([{ persistence: 'Local' }])
          expect((yield* processor.readSnapshot).displayedModel).toEqual({
            count: 1,
          })

          yield* SubscriptionRef.set(isAppendBlocked, true)
          yield* SubscriptionRef.set(connectionStatus, 'authenticated')
          yield* Deferred.await(blockedAppendStarted)
          const disconnectFiber = yield* Effect.forkChild(processor.disconnect)
          yield* Stream.runHead(
            Stream.filter(
              processor.snapshots,
              snapshot => snapshot.connection._tag === 'Detached',
            ),
          )
          yield* Deferred.succeed(appendAllowed, undefined)
          yield* Fiber.join(disconnectFiber)

          expect((yield* processor.readSnapshot).connection).toEqual({
            _tag: 'Detached',
          })
        }),
      ),
  )

  it.effect(
    'ignores a stale direct proposal append failure after disconnect',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const appendAllowed = yield* Deferred.make<void>()
          const appendStarted = yield* Deferred.make<void>()
          const store: ProgramStoreService = {
            ...baseStore,
            appendMessageProposal: () =>
              Effect.gen(function* () {
                yield* Deferred.succeed(appendStarted, undefined)
                yield* Deferred.await(appendAllowed)
                return yield* Effect.fail(
                  new ProgramStoreError({
                    cause: new Error('Temporary append failure.'),
                    operation: 'AppendMessageProposal',
                  }),
                )
              }),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          yield* processor.connect
          const proposalFiber = yield* Effect.forkChild(
            processor.propose(Incremented.make({})),
          )
          yield* Deferred.await(appendStarted)

          yield* processor.disconnect
          yield* Deferred.succeed(appendAllowed, undefined)
          yield* Fiber.join(proposalFiber)

          expect((yield* processor.readSnapshot).connection).toEqual({
            _tag: 'Detached',
          })
        }),
      ),
  )

  it.effect(
    'rejects an effect result without locally observed causal routing',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const causalStore = yield* makeInMemoryProgramStore()
          const causalOccurrence = yield* appendCausalOccurrence(causalStore)
          const request = makeEffectRequest(causalOccurrence)
          const placement = makeEffectPlacement(
            request,
            'AssignedPreferred',
            processorId,
          )
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)

          expect(
            yield* Effect.flip(
              processor.proposeEffectResult(Incremented.make({}), {
                effectAssignmentGeneration: placement.assignmentGeneration,
                effectCancellationGeneration: placement.cancellationGeneration,
                effectIdempotencyKey: request.idempotencyKey,
                effectRequestId: request.requestId,
                maybeCausationOccurrenceId: Option.some(
                  request.causalOccurrenceId,
                ),
                maybeCorrelationId: Option.some(sessionId),
              }),
            ),
          ).toBeInstanceOf(SharedProgramCausalRoutingMissing)
          expect((yield* processor.readSnapshot).pendingProposals).toEqual([])
        }),
      ),
  )

  it.effect(
    'does not leave an already accepted effect-result retry pending',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const causalOccurrence = yield* appendCausalOccurrence(store)
          const authority = yield* makeAcceptanceAuthority({
            acceptEnvelope: codec.acceptEnvelope,
            now: () => 1_753_825_100_001,
            session,
            store,
          })
          yield* authority.recoverAcceptedOccurrences([causalOccurrence])
          const request = makeEffectRequest(causalOccurrence)
          const placement = makeEffectPlacement(
            request,
            'AssignedPreferred',
            processorId,
          )
          yield* authority.recoverEffectRequests([request])
          yield* authority.recoverEffectPlacements([placement])
          yield* processor.connect

          const resultInput = {
            effectAssignmentGeneration: placement.assignmentGeneration,
            effectCancellationGeneration: placement.cancellationGeneration,
            effectIdempotencyKey: request.idempotencyKey,
            effectRequestId: request.requestId,
            maybeCausationOccurrenceId: Option.some(request.causalOccurrenceId),
            maybeCorrelationId: Option.some(sessionId),
          }
          const result = yield* processor.proposeEffectResult(
            Incremented.make({}),
            resultInput,
          )
          expect(result.messageCategory).toBe(request.causalMessageCategory)
          expect(result.policyGeneration).toBe(request.causalPolicyGeneration)
          expect(result.proposedAudience).toEqual(request.causalAudience)
          yield* authority.admit(result)
          yield* Stream.runHead(
            Stream.filter(
              processor.snapshots,
              snapshot => snapshot.acceptedSequence === 2,
            ),
          )

          yield* processor.proposeEffectResult(
            Incremented.make({}),
            resultInput,
          )
          const snapshot = yield* processor.readSnapshot
          const proposals = yield* Stream.runHead(
            store.observeMessageProposals({ sessionId, subjectId }),
          )
          expect(snapshot.pendingProposals).toEqual([])
          expect(Option.getOrThrow(proposals)).toHaveLength(2)
        }),
      ),
  )

  it.effect(
    'does not append an effect-result retry that races with acceptance',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const encodeRetryStarted = yield* Deferred.make<void>()
          const encodeRetryAllowed = yield* Deferred.make<void>()
          const encodeCount = yield* SubscriptionRef.make(0)
          const racingCodec: SharedProgramMessageCodec<Message, Envelope> = {
            ...codec,
            encodeProposed: (message, input) =>
              SubscriptionRef.updateAndGet(
                encodeCount,
                count => count + 1,
              ).pipe(
                Effect.flatMap(count => {
                  if (count === 2) {
                    return Deferred.succeed(encodeRetryStarted, undefined).pipe(
                      Effect.andThen(Deferred.await(encodeRetryAllowed)),
                      Effect.andThen(codec.encodeProposed(message, input)),
                    )
                  } else {
                    return codec.encodeProposed(message, input)
                  }
                }),
              ),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime, racingCodec)
          const causalOccurrence = yield* appendCausalOccurrence(store)
          yield* processor.connect
          const request = makeEffectRequest(causalOccurrence)
          const placement = makeEffectPlacement(
            request,
            'AssignedPreferred',
            processorId,
          )
          const resultInput = {
            effectAssignmentGeneration: placement.assignmentGeneration,
            effectCancellationGeneration: placement.cancellationGeneration,
            effectIdempotencyKey: request.idempotencyKey,
            effectRequestId: request.requestId,
            maybeCausationOccurrenceId: Option.some(request.causalOccurrenceId),
            maybeCorrelationId: Option.some(sessionId),
          }
          const firstResult = yield* processor.proposeEffectResult(
            Incremented.make({}),
            resultInput,
          )
          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(firstResult, 2),
          )
          const retry = yield* Effect.forkChild(
            processor.proposeEffectResult(Incremented.make({}), resultInput),
          )
          yield* Deferred.await(encodeRetryStarted)

          yield* Deferred.succeed(encodeRetryAllowed, undefined)
          yield* Fiber.join(retry)

          const snapshot = yield* processor.readSnapshot
          const proposals = yield* Stream.runHead(
            store.observeMessageProposals({ sessionId, subjectId }),
          )
          expect(snapshot.acceptedModel).toEqual({ count: 1 })
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.pendingProposals).toEqual([])
          expect(Option.getOrThrow(proposals)).toHaveLength(2)
        }),
      ),
  )

  it.effect(
    'projects unresolved effect-result aliases only once per idempotency key',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const causalOccurrence = yield* appendCausalOccurrence(store)
          yield* processor.connect
          const request = makeEffectRequest(causalOccurrence)
          const placement = makeEffectPlacement(
            request,
            'AssignedPreferred',
            processorId,
          )
          const resultInput = {
            effectAssignmentGeneration: placement.assignmentGeneration,
            effectCancellationGeneration: placement.cancellationGeneration,
            effectIdempotencyKey: request.idempotencyKey,
            effectRequestId: request.requestId,
            maybeCausationOccurrenceId: Option.some(request.causalOccurrenceId),
            maybeCorrelationId: Option.some(sessionId),
          }

          yield* processor.proposeEffectResult(
            Incremented.make({}),
            resultInput,
          )
          yield* processor.proposeEffectResult(
            Incremented.make({}),
            resultInput,
          )

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.pendingProposals).toHaveLength(2)
        }),
      ),
  )

  it.effect(
    'recovers this Client durable proposals without re-creating them',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime: firstRuntime } = yield* makeRuntime()
          const firstProcessor = yield* makeProcessor(store, firstRuntime)
          const proposal = yield* firstProcessor.propose(Incremented.make({}))
          const { runtime: recoveredRuntime } = yield* makeRuntime()
          const recoveredProcessor = yield* makeProcessor(
            store,
            recoveredRuntime,
          )

          yield* recoveredProcessor.connect

          const snapshot = yield* recoveredProcessor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.pendingProposals).toEqual([
            {
              persistence: 'Enqueued',
              proposal,
            },
          ])
        }),
      ),
  )

  it.effect(
    'does not project durable proposals created by a different Client',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime: originatingRuntime } = yield* makeRuntime()
          const originatingProcessor = yield* makeProcessor(
            store,
            originatingRuntime,
          )
          yield* originatingProcessor.propose(Incremented.make({}))
          const { runtime: otherRuntime } = yield* makeRuntime()
          const otherProcessor = yield* makeProcessor(
            store,
            otherRuntime,
            codec,
            'client-native',
          )

          yield* otherProcessor.connect

          const snapshot = yield* otherProcessor.readSnapshot
          expect(snapshot.acceptedModel).toEqual({ count: 0 })
          expect(snapshot.displayedModel).toEqual({ count: 0 })
          expect(snapshot.pendingProposals).toEqual([])
        }),
      ),
  )

  it.effect(
    'commits the cursor and clears pending only after decode and runtime application succeed',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { appliedEnvelopes, runtime } = yield* makeRuntime()
          const decodeAttempts = yield* SubscriptionRef.make(0)
          const flakyCodec: SharedProgramMessageCodec<Message, Envelope> = {
            ...codec,
            decodeAccepted: occurrence =>
              SubscriptionRef.updateAndGet(
                decodeAttempts,
                attempts => attempts + 1,
              ).pipe(
                Effect.flatMap(attempts =>
                  attempts === 1
                    ? Effect.fail(
                        new SharedProgramCodecError({
                          cause: new Error('Temporary decoder failure.'),
                          operation: 'DecodeAccepted',
                        }),
                      )
                    : codec.decodeAccepted(occurrence),
                ),
              ),
          }
          const processor = yield* makeProcessor(store, runtime, flakyCodec)
          const proposal = yield* processor.propose(Incremented.make({}))
          yield* store.appendAcceptedMessageOccurrence(
            yield* makeOccurrence(proposal, 1),
          )

          expect(yield* Effect.flip(processor.connect)).toBeInstanceOf(
            SharedProgramCodecError,
          )
          expect((yield* processor.readSnapshot).acceptedSequence).toBe(0)
          const failedSnapshot = yield* processor.readSnapshot
          expect(failedSnapshot.displayedModel).toEqual({ count: 1 })
          expect(failedSnapshot.pendingProposals).toHaveLength(1)

          yield* processor.connect

          const snapshot = yield* processor.readSnapshot
          expect(snapshot.acceptedSequence).toBe(1)
          expect(snapshot.displayedModel).toEqual({ count: 1 })
          expect(snapshot.pendingProposals).toEqual([])
          expect(yield* SubscriptionRef.get(appliedEnvelopes)).toHaveLength(1)
          expect(yield* SubscriptionRef.get(decodeAttempts)).toBe(2)
        }),
      ),
  )

  it.effect(
    'retries only Local proposals when the live transport authenticates again',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const connectionStatus = yield* SubscriptionRef.make<
            'authenticated' | 'closed'
          >('closed')
          const isAppendFailing = yield* SubscriptionRef.make(true)
          const store: ProgramStoreService = {
            ...baseStore,
            appendMessageProposal: proposal =>
              SubscriptionRef.get(isAppendFailing).pipe(
                Effect.flatMap(isFailing =>
                  isFailing
                    ? Effect.fail(
                        new ProgramStoreError({
                          cause: new Error('Temporary append failure.'),
                          operation: 'AppendMessageProposal',
                        }),
                      )
                    : baseStore.appendMessageProposal(proposal),
                ),
              ),
            observeConnectionStatus: SubscriptionRef.changes(connectionStatus),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          yield* processor.connect
          yield* processor.propose(Incremented.make({}))
          expect(
            (yield* processor.readSnapshot).pendingProposals,
          ).toMatchObject([{ persistence: 'Local' }])

          yield* SubscriptionRef.set(isAppendFailing, false)
          yield* SubscriptionRef.set(connectionStatus, 'authenticated')
          yield* Stream.runHead(
            Stream.filter(processor.snapshots, snapshot =>
              Array.some(
                snapshot.pendingProposals,
                pending => pending.persistence === 'Synced',
              ),
            ),
          )

          expect(
            (yield* processor.readSnapshot).pendingProposals,
          ).toMatchObject([{ persistence: 'Synced' }])
          expect((yield* processor.readSnapshot).displayedModel).toEqual({
            count: 1,
          })
        }),
      ),
  )

  it.effect(
    'retains optimistic projection for authority resolution after Instant rejects its mutation',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const rejectAppend = yield* Deferred.make<void>()
          const store: ProgramStoreService = {
            ...baseStore,
            appendMessageProposal: () =>
              Deferred.await(rejectAppend).pipe(
                Effect.andThen(
                  Effect.fail(
                    new ProgramStoreProposalMutationRejected({
                      cause: new Error('Instant rejected the mutation.'),
                    }),
                  ),
                ),
              ),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          yield* processor.connect
          const proposalFiber = yield* Effect.forkChild(
            processor.propose(Incremented.make({})),
          )
          yield* Stream.runHead(
            Stream.filter(
              processor.snapshots,
              snapshot => snapshot.displayedModel.count === 1,
            ),
          )

          expect((yield* processor.readSnapshot).displayedModel).toEqual({
            count: 1,
          })
          yield* Deferred.succeed(rejectAppend, undefined)
          yield* Fiber.join(proposalFiber)

          const retained = yield* processor.readSnapshot
          expect(retained.acceptedModel).toEqual({ count: 0 })
          expect(retained.displayedModel).toEqual({ count: 1 })
          expect(retained.pendingProposals).toMatchObject([
            { persistence: 'Local' },
          ])
          expect(retained.connection).toEqual({
            _tag: 'Attached',
            transportStatus: 'errored',
          })
        }),
      ),
  )
})

describe('acceptance authority', () => {
  it.effect(
    'orders a recovered proposal snapshot deterministically with one contiguous sequence each',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const generatorStore = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const programProcessor = yield* makeProcessor(generatorStore, runtime)
          const firstProposal = yield* programProcessor.propose(
            Incremented.make({}),
          )
          const secondProposal = yield* programProcessor.propose(
            Incremented.make({}),
          )
          const authorityStore = yield* makeInMemoryProgramStore()
          yield* authorityStore.appendProgramSession(session)
          yield* authorityStore.appendMessageProposal(secondProposal)
          yield* authorityStore.appendMessageProposal(firstProposal)
          const authority = yield* makeAcceptanceAuthority({
            acceptEnvelope: codec.acceptEnvelope,
            now: () => 1_753_825_100_001,
            session,
            store: authorityStore,
          })
          const authorityFiber = yield* Effect.forkChild(authority.run)
          const maybeAccepted = yield* Stream.runHead(
            Stream.filter(
              authorityStore.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
              occurrences => Array.length(occurrences) === 2,
            ),
          )
          yield* Fiber.interrupt(authorityFiber)

          expect(
            Array.map(
              Option.getOrThrow(maybeAccepted),
              occurrence => occurrence.proposalId,
            ),
          ).toEqual([firstProposal.proposalId, secondProposal.proposalId])
          expect(
            Array.map(
              Option.getOrThrow(maybeAccepted),
              occurrence => occurrence.acceptedSequence,
            ),
          ).toEqual([1, 2])
        }),
      ),
  )

  it.effect('rejects an optimistic authority write without advancing', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const baseStore = yield* makeInMemoryProgramStore()
        const isSynchronized = yield* SubscriptionRef.make(false)
        const store: ProgramStoreService = {
          ...baseStore,
          appendAcceptedMessageOccurrence: occurrence =>
            SubscriptionRef.get(isSynchronized).pipe(
              Effect.flatMap(isSynced =>
                isSynced
                  ? baseStore.appendAcceptedMessageOccurrence(occurrence)
                  : Effect.succeed(
                      enqueuedTransactionOutcome('offline-authority'),
                    ),
              ),
            ),
        }
        const { runtime } = yield* makeRuntime()
        const processor = yield* makeProcessor(store, runtime)
        const firstProposal = yield* processor.propose(Incremented.make({}))
        const secondProposal = yield* processor.propose(Incremented.make({}))
        const authority = yield* makeAcceptanceAuthority({
          acceptEnvelope: codec.acceptEnvelope,
          now: () => 1_753_825_100_001,
          session,
          store,
        })

        expect(
          yield* Effect.flip(authority.admit(firstProposal)),
        ).toBeInstanceOf(ProgramStoreError)
        yield* SubscriptionRef.set(isSynchronized, true)

        expect((yield* authority.admit(secondProposal)).acceptedSequence).toBe(
          1,
        )
      }),
    ),
  )

  it.effect(
    'admits run proposals only after the live transport authenticates',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const connectionStatus = yield* SubscriptionRef.make<
            'authenticated' | 'closed'
          >('closed')
          const store: ProgramStoreService = {
            ...baseStore,
            observeConnectionStatus: SubscriptionRef.changes(connectionStatus),
          }
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(store, runtime)
          const proposal = yield* processor.propose(Incremented.make({}))
          yield* store.appendProgramSession(session)
          const authority = yield* makeAcceptanceAuthority({
            acceptEnvelope: codec.acceptEnvelope,
            now: () => 1_753_825_100_001,
            session,
            store,
          })
          const fiber = yield* Effect.forkChild(authority.run)
          const beforeAuthentication = yield* Stream.runHead(
            store.observeAcceptedMessageOccurrences({ sessionId, subjectId }),
          )
          expect(Option.getOrThrow(beforeAuthentication)).toEqual([])

          yield* SubscriptionRef.set(connectionStatus, 'authenticated')
          const afterAuthentication = yield* Stream.runHead(
            Stream.filter(
              store.observeAcceptedMessageOccurrences({ sessionId, subjectId }),
              occurrences => Option.isSome(Array.head(occurrences)),
            ),
          )
          yield* Fiber.interrupt(fiber)

          expect(Option.getOrThrow(afterAuthentication)).toMatchObject([
            { proposalId: proposal.proposalId },
          ])
        }),
      ),
  )

  it.effect(
    'reports a rejected proposal and continues with the next valid proposal',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const generatorStore = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const processor = yield* makeProcessor(generatorStore, runtime)
          const firstProposal = yield* processor.propose(Incremented.make({}))
          const validProposal = yield* processor.propose(Incremented.make({}))
          const invalidProposal = InstantMessageProposalRecord.make({
            ...firstProposal,
            effectAssignmentGeneration: 1,
            effectCancellationGeneration: 0,
            effectIdempotencyKey: 'malicious-message-effect-key',
            effectRequestId: 'malicious-message-effect-request',
            executorProcessorId: processorId,
          })
          const store = yield* makeInMemoryProgramStore()
          const rejections = yield* SubscriptionRef.make<ReadonlyArray<string>>(
            [],
          )
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposal(invalidProposal)
          yield* store.appendMessageProposal(validProposal)
          const authority = yield* makeAcceptanceAuthority({
            acceptEnvelope: codec.acceptEnvelope,
            now: () => 1_753_825_100_001,
            onProposalRejected: (_proposal, rejection) =>
              SubscriptionRef.update(rejections, Array.append(rejection._tag)),
            session,
            store,
          })
          const fiber = yield* Effect.forkChild(authority.run)
          const maybeAccepted = yield* Stream.runHead(
            Stream.filter(
              store.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
              occurrences => Option.isSome(Array.head(occurrences)),
            ),
          )
          yield* Fiber.interrupt(fiber)

          expect(Option.getOrThrow(maybeAccepted)).toMatchObject([
            { proposalId: validProposal.proposalId },
          ])
          expect(yield* SubscriptionRef.get(rejections)).toContain(
            'AcceptanceAuthorityProposalKindMismatch',
          )
          expect(
            yield* Effect.flip(authority.admit(invalidProposal)),
          ).toBeInstanceOf(AcceptanceAuthorityProposalKindMismatch)
        }),
      ),
  )

  it.effect('stops run admission when the current session is revoked', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        yield* store.appendProgramSession(session)
        const authority = yield* makeAcceptanceAuthority({
          acceptEnvelope: codec.acceptEnvelope,
          now: () => 1_753_825_100_001,
          session,
          store,
        })
        const fiber = yield* Effect.forkChild(authority.run)
        yield* store.appendProgramSession(
          InstantProgramSessionRecord.make({
            ...session,
            isRevoked: true,
          }),
        )

        expect(yield* Effect.flip(Fiber.join(fiber))).toBeInstanceOf(
          AcceptanceAuthoritySessionRevoked,
        )
      }),
    ),
  )

  it.effect('fences run admission after the session authority rotates', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        yield* store.appendProgramSession(session)
        const authority = yield* makeAcceptanceAuthority({
          acceptEnvelope: codec.acceptEnvelope,
          now: () => 1_753_825_100_001,
          session,
          store,
        })
        const fiber = yield* Effect.forkChild(authority.run)
        yield* store.appendProgramSession(
          InstantProgramSessionRecord.make({
            ...session,
            authorityProcessorId: 'processor-next-authority',
          }),
        )

        expect(yield* Effect.flip(Fiber.join(fiber))).toBeInstanceOf(
          AcceptanceAuthorityChanged,
        )
      }),
    ),
  )

  it.effect('recovers after restart and admits each proposal once', () =>
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore()
      const { runtime } = yield* makeRuntime()
      const programProcessor = yield* Effect.scoped(
        makeProcessor(store, runtime),
      )
      const proposal = yield* programProcessor.propose(Incremented.make({}))
      const firstAuthority = yield* makeAcceptanceAuthority({
        acceptEnvelope: codec.acceptEnvelope,
        now: () => 1_753_825_100_001,
        session,
        store,
      })
      yield* firstAuthority.recoverEffectRequests([])
      const accepted = yield* firstAuthority.admit(proposal)

      const restartedAuthority = yield* makeAcceptanceAuthority({
        acceptEnvelope: codec.acceptEnvelope,
        now: () => 1_753_825_100_999,
        session,
        store,
      })
      yield* restartedAuthority.recoverAcceptedOccurrences([accepted])
      yield* restartedAuthority.recoverEffectRequests([])
      expect(yield* restartedAuthority.admit(proposal)).toEqual(accepted)
    }),
  )

  it.effect(
    'does not roll back authority state for a stale store snapshot',
    () =>
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        const { runtime } = yield* makeRuntime()
        const programProcessor = yield* Effect.scoped(
          makeProcessor(store, runtime),
        )
        const firstProposal = yield* programProcessor.propose(
          Incremented.make({}),
        )
        const secondProposal = yield* programProcessor.propose(
          Incremented.make({}),
        )
        const authority = yield* makeAcceptanceAuthority({
          acceptEnvelope: codec.acceptEnvelope,
          now: () => 1_753_825_100_001,
          session,
          store,
        })
        yield* authority.recoverEffectRequests([])
        yield* authority.admit(firstProposal)
        yield* authority.recoverAcceptedOccurrences([])

        const secondAccepted = yield* authority.admit(secondProposal)

        expect(secondAccepted.acceptedSequence).toBe(2)
      }),
  )

  it.effect('rejects authenticated scope and reused proposal conflicts', () =>
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore()
      const { runtime } = yield* makeRuntime()
      const programProcessor = yield* Effect.scoped(
        makeProcessor(store, runtime),
      )
      const proposal = yield* programProcessor.propose(Incremented.make({}))
      const authority = yield* makeAcceptanceAuthority({
        acceptEnvelope: codec.acceptEnvelope,
        now: () => 1_753_825_100_001,
        session,
        store,
      })
      yield* authority.recoverEffectRequests([])

      const mismatched = InstantMessageProposalRecord.make({
        ...proposal,
        subjectId: 'subject-other',
      })
      expect(yield* Effect.flip(authority.admit(mismatched))).toBeInstanceOf(
        AcceptanceAuthorityScopeMismatch,
      )

      const accepted = yield* authority.admit(proposal)
      const restarted = yield* makeAcceptanceAuthority({
        acceptEnvelope: codec.acceptEnvelope,
        now: () => 1_753_825_100_002,
        session,
        store,
      })
      yield* restarted.recoverAcceptedOccurrences([accepted])
      yield* restarted.recoverEffectRequests([])
      const conflict = InstantMessageProposalRecord.make({
        ...proposal,
        originDeviceId: 'device-other',
      })
      expect(yield* Effect.flip(restarted.admit(conflict))).toBeInstanceOf(
        AcceptanceAuthorityIdentityConflict,
      )
    }),
  )

  it.effect('rejects revoked sessions and history from another authority', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        const { runtime } = yield* makeRuntime()
        const programProcessor = yield* makeProcessor(store, runtime)
        const proposal = yield* programProcessor.propose(Incremented.make({}))
        const revokedAuthority = yield* makeAcceptanceAuthority({
          acceptEnvelope: codec.acceptEnvelope,
          now: () => 1_753_825_100_001,
          session: InstantProgramSessionRecord.make({
            ...session,
            isRevoked: true,
          }),
          store,
        })
        expect(
          yield* Effect.flip(revokedAuthority.admit(proposal)),
        ).toBeInstanceOf(AcceptanceAuthoritySessionRevoked)

        const occurrence = yield* makeOccurrence(proposal, 1)
        const recoveringAuthority = yield* makeAcceptanceAuthority({
          acceptEnvelope: codec.acceptEnvelope,
          now: () => 1_753_825_100_002,
          session,
          store,
        })
        const otherAuthorityOccurrence =
          InstantAcceptedMessageOccurrenceRecord.make({
            ...occurrence,
            acceptingProcessorId: 'processor-other-authority',
          })
        expect(
          yield* Effect.flip(
            recoveringAuthority.recoverAcceptedOccurrences([
              otherAuthorityOccurrence,
            ]),
          ),
        ).toBeInstanceOf(AcceptanceAuthorityProcessorMismatch)
      }),
    ),
  )

  it.effect(
    'accepts a re-placed effect only at its latest assignment and cancellation generations',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const programProcessor = yield* makeProcessor(store, runtime)
          const causalOccurrence = yield* appendCausalOccurrence(store)
          yield* programProcessor.connect
          const request = makeEffectRequest(causalOccurrence)
          const waitingPlacement = makeEffectPlacement(request, 'Waiting', null)
          const assignedPlacement = InstantEffectPlacementRecord.make({
            ...makeEffectPlacement(request, 'AssignedPreferred', processorId),
            assignmentGeneration: 2,
            id: '00000000-0000-4000-8000-000000000002',
            positionKey: makeInstantEffectPlacementPositionKey(
              request.requestId,
              2,
              0,
            ),
          })
          const authority = yield* makeAcceptanceAuthority({
            acceptEnvelope: codec.acceptEnvelope,
            now: () => 1_753_825_100_001,
            session,
            store,
          })
          yield* authority.recoverAcceptedOccurrences([causalOccurrence])
          yield* authority.recoverEffectRequests([request])
          yield* authority.recoverEffectPlacements([
            assignedPlacement,
            waitingPlacement,
          ])
          const staleResult = yield* programProcessor.proposeEffectResult(
            Incremented.make({}),
            {
              effectAssignmentGeneration: waitingPlacement.assignmentGeneration,
              effectCancellationGeneration:
                waitingPlacement.cancellationGeneration,
              effectIdempotencyKey: request.idempotencyKey,
              effectRequestId: request.requestId,
              maybeCausationOccurrenceId: Option.some(
                request.causalOccurrenceId,
              ),
              maybeCorrelationId: Option.some(sessionId),
            },
          )
          expect(
            yield* Effect.flip(authority.admit(staleResult)),
          ).toBeInstanceOf(AcceptanceAuthorityEffectResultMismatch)

          const currentResult = yield* programProcessor.proposeEffectResult(
            Incremented.make({}),
            {
              effectAssignmentGeneration:
                assignedPlacement.assignmentGeneration,
              effectCancellationGeneration:
                assignedPlacement.cancellationGeneration,
              effectIdempotencyKey: request.idempotencyKey,
              effectRequestId: request.requestId,
              maybeCausationOccurrenceId: Option.some(
                request.causalOccurrenceId,
              ),
              maybeCorrelationId: Option.some(sessionId),
            },
          )
          expect((yield* authority.admit(currentResult)).acceptedSequence).toBe(
            2,
          )
        }),
      ),
  )

  it.effect(
    'accepts an effect result only from the durably assigned Processor and idempotency key',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const { runtime } = yield* makeRuntime()
          const programProcessor = yield* makeProcessor(store, runtime)
          const causalOccurrence = yield* appendCausalOccurrence(store)
          yield* programProcessor.connect
          const authority = yield* makeAcceptanceAuthority({
            acceptEnvelope: codec.acceptEnvelope,
            now: () => 1_753_825_100_001,
            session,
            store,
          })
          yield* authority.recoverAcceptedOccurrences([causalOccurrence])
          const assignedRequest = makeEffectRequest(causalOccurrence)
          const assignedPlacement = makeEffectPlacement(
            assignedRequest,
            'AssignedPreferred',
            processorId,
          )
          yield* authority.recoverEffectRequests([assignedRequest])
          yield* authority.recoverEffectPlacements([assignedPlacement])
          const result = yield* programProcessor.proposeEffectResult(
            Incremented.make({}),
            {
              effectAssignmentGeneration:
                assignedPlacement.assignmentGeneration,
              effectCancellationGeneration:
                assignedPlacement.cancellationGeneration,
              effectIdempotencyKey: assignedRequest.idempotencyKey,
              effectRequestId: assignedRequest.requestId,
              maybeCausationOccurrenceId: Option.some(
                assignedRequest.causalOccurrenceId,
              ),
              maybeCorrelationId: Option.some(sessionId),
            },
          )

          const accepted = yield* authority.admit(result)
          const duplicateResult = InstantMessageProposalRecord.make({
            ...result,
            actorSequence: result.actorSequence + 1,
            envelopeJson: makeProposedEnvelopeJson('effect-result-duplicate'),
            id: 'effect-result-duplicate',
            occurrenceId: 'effect-result-duplicate',
            proposalId: 'effect-result-duplicate',
          })
          expect(yield* authority.admit(duplicateResult)).toEqual(accepted)

          const failedRequest = InstantEffectRequestRecord.make({
            ...assignedRequest,
            id: 'effect-request-failed',
            idempotencyKey: 'effect-idempotency-failed',
            requestId: 'effect-request-failed',
          })
          const outOfRangeRequest = InstantEffectRequestRecord.make({
            ...assignedRequest,
            id: 'effect-request-out-of-range',
            idempotencyKey: 'effect-idempotency-out-of-range',
            requestId: 'effect-request-out-of-range',
          })
          const failedPlacement = makeEffectPlacement(
            failedRequest,
            'AssignedPreferred',
            processorId,
          )
          const outOfRangePlacement = makeEffectPlacement(
            outOfRangeRequest,
            'AssignedPreferred',
            processorId,
          )
          yield* authority.recoverEffectRequests([
            assignedRequest,
            failedRequest,
            outOfRangeRequest,
          ])
          yield* authority.recoverEffectPlacements([
            assignedPlacement,
            failedPlacement,
            outOfRangePlacement,
          ])
          const failedResult = InstantMessageProposalRecord.make({
            ...result,
            actorSequence: result.actorSequence + 2,
            effectIdempotencyKey: failedRequest.idempotencyKey,
            effectRequestId: failedRequest.requestId,
            envelopeJson: makeProposedEnvelopeJson('effect-result-failed'),
            eventId: 'counter.incremented',
            eventVersion: 1,
            id: 'effect-result-failed',
            occurrenceId: 'effect-result-failed',
            proposalId: 'effect-result-failed',
          })
          expect((yield* authority.admit(failedResult)).acceptedSequence).toBe(
            3,
          )

          const outOfRangeResult = InstantMessageProposalRecord.make({
            ...result,
            actorSequence: result.actorSequence + 3,
            effectIdempotencyKey: outOfRangeRequest.idempotencyKey,
            effectRequestId: outOfRangeRequest.requestId,
            envelopeJson: makeProposedEnvelopeJson(
              'effect-result-out-of-range',
            ),
            eventId: 'counter.failed',
            eventVersion: 3,
            id: 'effect-result-out-of-range',
            occurrenceId: 'effect-result-out-of-range',
            proposalId: 'effect-result-out-of-range',
          })
          expect(
            yield* Effect.flip(authority.admit(outOfRangeResult)),
          ).toBeInstanceOf(AcceptanceAuthorityEffectResultMismatch)

          const wrongIdempotencyResult = InstantMessageProposalRecord.make({
            ...outOfRangeResult,
            effectIdempotencyKey: 'wrong-idempotency-key',
            envelopeJson: makeProposedEnvelopeJson(
              'effect-result-wrong-idempotency',
            ),
            eventVersion: 1,
            id: 'effect-result-wrong-idempotency',
            occurrenceId: 'effect-result-wrong-idempotency',
            proposalId: 'effect-result-wrong-idempotency',
          })
          expect(
            yield* Effect.flip(authority.admit(wrongIdempotencyResult)),
          ).toBeInstanceOf(AcceptanceAuthorityEffectResultMismatch)

          const waitingAuthority = yield* makeAcceptanceAuthority({
            acceptEnvelope: codec.acceptEnvelope,
            now: () => 1_753_825_100_002,
            session,
            store,
          })
          yield* waitingAuthority.recoverAcceptedOccurrences([causalOccurrence])
          const waitingRequest = InstantEffectRequestRecord.make({
            ...makeEffectRequest(causalOccurrence),
            id: 'waiting-request',
            requestId: 'waiting-request',
          })
          const waitingPlacement = makeEffectPlacement(
            waitingRequest,
            'Waiting',
            null,
          )
          yield* waitingAuthority.recoverEffectRequests([waitingRequest])
          yield* waitingAuthority.recoverEffectPlacements([waitingPlacement])
          const waitingResult = InstantMessageProposalRecord.make({
            ...result,
            effectAssignmentGeneration: waitingPlacement.assignmentGeneration,
            effectCancellationGeneration:
              waitingPlacement.cancellationGeneration,
            effectRequestId: 'waiting-request',
            envelopeJson: makeProposedEnvelopeJson('waiting-result'),
            id: 'waiting-result',
            occurrenceId: 'waiting-result',
            proposalId: 'waiting-result',
          })
          expect(
            yield* Effect.flip(waitingAuthority.admit(waitingResult)),
          ).toBeInstanceOf(AcceptanceAuthorityEffectResultMismatch)
        }),
      ),
  )
})
