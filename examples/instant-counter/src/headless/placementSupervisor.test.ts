import {
  Array,
  Deferred,
  Effect,
  Fiber,
  Option,
  Stream,
  SubscriptionRef,
} from 'effect'
import { Processor, Synchronization } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  type IdempotentCorrelatedProposalInput,
  InstantAcceptedMessageOccurrenceRecord,
  InstantEffectPlacementRecord,
  InstantMessageProposalRecord,
  InstantMessageProposalResolutionRecord,
  type InstantProcessorPresence,
  InstantProgramSessionRecord,
  type ProcessorRoomService,
  ProgramStoreError,
  type ProgramAuthorityStoreService as ProgramStoreService,
  type SharedProgramMessageCodec,
  type SharedProgramProcessorService,
  instantProgramProtocolVersion,
  makeAcceptedOccurrencePositionKey,
  makeAdmissionSequencer,
  makeInMemoryProgramAuthorityStore as makeInMemoryProgramStore,
} from '@foldkit/instant'

import {
  AssignedEffect,
  ClickedIncrement,
  type Message,
  RequestedEffect,
  WaitedForEffectProcessor,
} from '../domain/message.js'
import type { Model } from '../domain/model.js'
import { makeMessageCodec } from '../transport/codec.js'
import {
  makeEffectPlacementRecord,
  makeEffectRequestRecord,
} from './placement.js'
import {
  EffectPlacementAcceptedHistoryConflict,
  EffectPlacementAcceptedOccurrenceMismatch,
  EffectPlacementRecordScopeMismatch,
  EffectPlacementResolutionMismatch,
  runEffectPlacementSupervisor,
} from './placementSupervisor.js'

const authorityProcessorId = 'processor-authority'
const sessionId = 'session-1'
const subjectId = 'subject-1'

const mirrorPolicy = (generation: number) =>
  Synchronization.SessionPolicy.make({
    generation,
    mode: Synchronization.Mirror.make({}),
  })

const sharedDomainPolicy = (generation: number) =>
  Synchronization.SessionPolicy.make({
    generation,
    mode: Synchronization.SharedDomain.make({}),
  })

const makeSession = (
  sessionPolicy: Synchronization.SessionPolicy = mirrorPolicy(0),
) =>
  InstantProgramSessionRecord.make({
    authorityProcessorId,
    createdAtMs: 1,
    id: sessionId,
    isRevoked: false,
    processorRoomId: 'room-4ec724f1c3584d679b8a3b88f470e372',
    programId: 'instant-counter',
    programVersion: 1,
    protocolVersion: instantProgramProtocolVersion,
    sessionId,
    sessionPolicy,
    subjectId,
  })

const room: ProcessorRoomService = {
  observePresence: Stream.succeed([]).pipe(Stream.concat(Stream.never)),
  publishActivity: () => Effect.void,
  publishPresence: () => Effect.void,
}

type ProposalFixture = Readonly<{
  actorId: string
  actorSequence: number
  clientId: string
  codec: SharedProgramMessageCodec<Message, Processor.MessageEnvelope>
  message: Message
  messageIdempotencyKey: string | null
  maybeCausationOccurrenceId: Option.Option<string>
  maybeCorrelationId: Option.Option<string>
  originatingProcessorId: string
  proposalId: string
  session: InstantProgramSessionRecord
  sessionPolicy: Synchronization.SessionPolicy
}>

const makeProposal = ({
  actorId,
  actorSequence,
  clientId,
  codec,
  message,
  messageIdempotencyKey,
  maybeCausationOccurrenceId,
  maybeCorrelationId,
  originatingProcessorId,
  proposalId,
  session,
  sessionPolicy,
}: ProposalFixture) =>
  Effect.map(
    codec.encodeProposed(message, {
      actorSequence,
      clientId,
      createdAtMs: 10 + actorSequence,
      maybeCausationOccurrenceId,
      maybeCorrelationId,
      occurrenceId: proposalId,
      originDeviceId: 'device-1',
      originatingProcessorId,
      programId: session.programId,
      programVersion: session.programVersion,
      sessionId: session.sessionId,
      subjectId: session.subjectId,
    }),
    encoded =>
      InstantMessageProposalRecord.make({
        actorId,
        actorSequence,
        causationOccurrenceId: Option.getOrNull(maybeCausationOccurrenceId),
        clientId,
        correlationId: Option.getOrNull(maybeCorrelationId),
        createdAtMs: 10 + actorSequence,
        effectAssignmentGeneration: null,
        effectCancellationGeneration: null,
        effectIdempotencyKey: null,
        effectRequestId: null,
        envelopeJson: encoded.envelopeJson,
        envelopeVersion: encoded.envelopeVersion,
        eventId: encoded.eventId,
        eventVersion: encoded.eventVersion,
        executorProcessorId: null,
        id: proposalId,
        messageCategory: 'Domain',
        messageIdempotencyKey,
        occurrenceId: proposalId,
        originDeviceId: 'device-1',
        originatingProcessorId,
        payloadJson: encoded.payloadJson,
        programId: session.programId,
        programVersion: session.programVersion,
        protocolVersion: session.protocolVersion,
        proposalId,
        proposalKind: 'Message',
        proposedAudience: Synchronization.SessionAudience.make({}),
        policyGeneration: sessionPolicy.generation,
        sessionId: session.sessionId,
        subjectId: session.subjectId,
      }),
  )

const makeAcceptedOccurrence = (
  codec: SharedProgramMessageCodec<Message, Processor.MessageEnvelope>,
  proposal: InstantMessageProposalRecord,
  acceptedSequence: number,
  session: InstantProgramSessionRecord,
  sessionPolicy: Synchronization.SessionPolicy = session.sessionPolicy,
) =>
  Effect.map(
    codec.acceptEnvelope(proposal, {
      acceptedAtMs: 100 + acceptedSequence,
      acceptedSequence,
      acceptingProcessorId: session.authorityProcessorId,
    }),
    envelopeJson =>
      InstantAcceptedMessageOccurrenceRecord.make({
        acceptedAtMs: 100 + acceptedSequence,
        acceptedSequence,
        acceptingProcessorId: session.authorityProcessorId,
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
          session.sessionId,
          acceptedSequence,
        ),
        programId: proposal.programId,
        programVersion: proposal.programVersion,
        protocolVersion: proposal.protocolVersion,
        proposedEnvelopeJson: proposal.envelopeJson,
        proposalId: proposal.proposalId,
        proposalKind: proposal.proposalKind,
        policyGeneration: proposal.policyGeneration,
        sessionId: proposal.sessionId,
        sessionPolicy,
        subjectId: proposal.subjectId,
      }),
  )

const makeAuthenticatedProposal = (
  message: Message,
  proposalId: string,
  actorSequence: number,
  session: InstantProgramSessionRecord,
  sessionPolicy: Synchronization.SessionPolicy = session.sessionPolicy,
) => {
  const codec = makeMessageCodec({
    actor: Processor.AuthenticatedActor.make({ subjectId }),
  })
  return makeProposal({
    actorId: subjectId,
    actorSequence,
    clientId: 'client-browser',
    codec,
    message,
    messageIdempotencyKey: null,
    maybeCausationOccurrenceId: Option.none(),
    maybeCorrelationId:
      message._tag === 'RequestedEffect'
        ? Option.some(message.requestId)
        : Option.none(),
    originatingProcessorId: 'processor-browser',
    proposalId,
    session,
    sessionPolicy,
  })
}

const makeSystemProposal = (
  message: Message,
  proposalId: string,
  actorSequence: number,
  session: InstantProgramSessionRecord,
  input: IdempotentCorrelatedProposalInput,
) => {
  const codec = makeMessageCodec({
    actor: Processor.SystemActor.make({ processorId: authorityProcessorId }),
  })
  return makeProposal({
    actorId: authorityProcessorId,
    actorSequence,
    clientId: 'client-authority',
    codec,
    message,
    messageIdempotencyKey: input.messageIdempotencyKey,
    maybeCausationOccurrenceId: input.maybeCausationOccurrenceId,
    maybeCorrelationId: input.maybeCorrelationId,
    originatingProcessorId: authorityProcessorId,
    proposalId,
    session,
    sessionPolicy: session.sessionPolicy,
  })
}

const makeProcessor = (
  session: InstantProgramSessionRecord,
  proposed: Deferred.Deferred<
    Readonly<{
      input: IdempotentCorrelatedProposalInput
      message: Message
    }>
  >,
): SharedProgramProcessorService<Model, Message> => ({
  connect: Effect.void,
  disconnect: Effect.void,
  inspectReplay: () => Effect.void,
  propose: () => Effect.die('Unexpected uncorrelated proposal.'),
  proposeCorrelated: () => Effect.die('Unexpected correlated proposal.'),
  proposeIdempotentCorrelated: (message, input) =>
    Effect.gen(function* () {
      yield* Deferred.succeed(proposed, { input, message })
      return yield* makeSystemProposal(
        message,
        'proposal-reported-placement',
        100,
        session,
        input,
      )
    }),
  proposeEffectResult: () => Effect.die('Unexpected effect-result proposal.'),
  readSnapshot: Effect.die('Unexpected snapshot read.'),
  returnLive: Effect.void,
  snapshots: Stream.never,
})

type RecordedPlacementProposal = Readonly<{
  input: IdempotentCorrelatedProposalInput
  message: Message
  proposal: InstantMessageProposalRecord
}>

const makeRecordingProcessor = (
  session: InstantProgramSessionRecord,
  proposalId: string,
  actorSequence: number,
  recorded: SubscriptionRef.SubscriptionRef<
    ReadonlyArray<RecordedPlacementProposal>
  >,
): SharedProgramProcessorService<Model, Message> => ({
  connect: Effect.void,
  disconnect: Effect.void,
  inspectReplay: () => Effect.void,
  propose: () => Effect.die('Unexpected uncorrelated proposal.'),
  proposeCorrelated: () => Effect.die('Unexpected correlated proposal.'),
  proposeIdempotentCorrelated: (message, input) =>
    Effect.gen(function* () {
      const proposal = yield* makeSystemProposal(
        message,
        proposalId,
        actorSequence,
        session,
        input,
      )
      yield* SubscriptionRef.update(
        recorded,
        Array.append({ input, message, proposal }),
      )
      return proposal
    }),
  proposeEffectResult: () => Effect.die('Unexpected effect-result proposal.'),
  readSnapshot: Effect.die('Unexpected snapshot read.'),
  returnLive: Effect.void,
  snapshots: Stream.never,
})

const makePlacementFixture = Effect.gen(function* () {
  const session = makeSession()
  const authenticatedCodec = makeMessageCodec({
    actor: Processor.AuthenticatedActor.make({ subjectId }),
  })
  const systemCodec = makeMessageCodec({
    actor: Processor.SystemActor.make({ processorId: authorityProcessorId }),
  })
  const requestMessage = RequestedEffect({
    durationMs: Option.some(250),
    kind: 'BackgroundTimer',
    requestId: 'timer-1',
  })
  const requestProposal = yield* makeAuthenticatedProposal(
    requestMessage,
    'proposal-request',
    1,
    session,
  )
  const requestOccurrence = yield* makeAcceptedOccurrence(
    authenticatedCodec,
    requestProposal,
    1,
    session,
  )
  const request = makeEffectRequestRecord(
    session,
    requestMessage,
    {
      causalAudience: requestOccurrence.audience,
      causalMessageCategory: requestOccurrence.messageCategory,
      causalOccurrenceId: requestOccurrence.occurrenceId,
      causalPolicyGeneration: requestOccurrence.policyGeneration,
      ingressProcessorId: requestOccurrence.acceptingProcessorId,
      originClientId: requestOccurrence.clientId,
      originatingProcessorId: requestOccurrence.originatingProcessorId,
    },
    20,
  )
  const waitingPlacement = makeEffectPlacementRecord(
    request,
    Processor.Waiting.make({ reason: 'NoCapableProcessor' }),
    1,
    0,
    21,
  )
  const assignedPlacement = makeEffectPlacementRecord(
    request,
    Processor.AssignedFallback.make({ processorId: 'processor-headless' }),
    2,
    0,
    22,
  )
  return {
    assignedPlacement,
    authenticatedCodec,
    request,
    requestMessage,
    requestOccurrence,
    session,
    systemCodec,
    waitingPlacement,
  }
})

const appendPlacementFixture = (
  store: ProgramStoreService,
  fixture: Effect.Success<typeof makePlacementFixture>,
) =>
  Effect.gen(function* () {
    yield* store.appendAcceptedMessageOccurrence(fixture.requestOccurrence)
    yield* store.appendEffectRequest(fixture.request)
    yield* store.appendEffectPlacement(fixture.waitingPlacement)
    yield* store.appendEffectPlacement(fixture.assignedPlacement)
  })

const awaitPlacementProposal = (
  store: ProgramStoreService,
  fixture: Effect.Success<typeof makePlacementFixture>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const proposed = yield* Deferred.make<
        Readonly<{
          input: IdempotentCorrelatedProposalInput
          message: Message
        }>
      >()
      const fiber = yield* Effect.forkChild(
        runEffectPlacementSupervisor({
          codec: fixture.systemCodec,
          processor: makeProcessor(fixture.session, proposed),
          room,
          session: fixture.session,
          store,
        }),
      )
      const result = yield* Deferred.await(proposed)
      yield* Fiber.interrupt(fiber)
      return result
    }),
  )

const itEffect = (
  name: string,
  test: () => Effect.Effect<void, unknown>,
): void => {
  it(name, () => Effect.runPromise(test()))
}

const withWriteCounters = (
  store: ProgramStoreService,
  placementWriteCount: SubscriptionRef.SubscriptionRef<number>,
  requestWriteCount: SubscriptionRef.SubscriptionRef<number>,
): ProgramStoreService => ({
  ...store,
  appendServerConfirmedEffectPlacement: placement =>
    SubscriptionRef.update(placementWriteCount, count => count + 1).pipe(
      Effect.andThen(store.appendServerConfirmedEffectPlacement(placement)),
    ),
  appendServerConfirmedEffectRequest: request =>
    SubscriptionRef.update(requestWriteCount, count => count + 1).pipe(
      Effect.andThen(store.appendServerConfirmedEffectRequest(request)),
    ),
})

const withServerConfirmedObservations = (
  store: ProgramStoreService,
  observations: Partial<ProgramStoreService['serverConfirmed']>,
): ProgramStoreService => ({
  ...store,
  ...observations,
  serverConfirmed: {
    ...store.serverConfirmed,
    ...observations,
  },
})

const withProposalCounter = (
  processor: SharedProgramProcessorService<Model, Message>,
  proposalCount: SubscriptionRef.SubscriptionRef<number>,
): SharedProgramProcessorService<Model, Message> => ({
  ...processor,
  proposeIdempotentCorrelated: (message, input) =>
    SubscriptionRef.update(proposalCount, count => count + 1).pipe(
      Effect.andThen(processor.proposeIdempotentCorrelated(message, input)),
    ),
})

describe('effect placement supervisor', () => {
  itEffect(
    'fails closed when one proposal has both accepted and rejected terminals',
    () =>
      Effect.gen(function* () {
        const session = makeSession()
        const authenticatedCodec = makeMessageCodec({
          actor: Processor.AuthenticatedActor.make({ subjectId }),
        })
        const systemCodec = makeMessageCodec({
          actor: Processor.SystemActor.make({
            processorId: authorityProcessorId,
          }),
        })
        const proposal = yield* makeAuthenticatedProposal(
          ClickedIncrement(),
          'proposal-contradictory-terminal',
          1,
          session,
        )
        const occurrence = yield* makeAcceptedOccurrence(
          authenticatedCodec,
          proposal,
          1,
          session,
        )
        const store = yield* makeInMemoryProgramStore()
        yield* store.appendMessageProposal(proposal)
        yield* store.appendAcceptedMessageOccurrence(occurrence)
        yield* store.appendMessageProposalResolution(
          InstantMessageProposalResolutionRecord.make({
            actorId: proposal.actorId,
            actorSequence: proposal.actorSequence,
            clientId: proposal.clientId,
            id: proposal.proposalId,
            programId: proposal.programId,
            programVersion: proposal.programVersion,
            protocolVersion: proposal.protocolVersion,
            proposalId: proposal.proposalId,
            rejectedAtMs: 200,
            rejectingProcessorId: session.authorityProcessorId,
            rejectionReason: 'EnvelopeInvalid',
            sessionId: proposal.sessionId,
            subjectId: proposal.subjectId,
          }),
        )
        const proposed = yield* Deferred.make<
          Readonly<{
            input: IdempotentCorrelatedProposalInput
            message: Message
          }>
        >()

        expect(
          yield* Effect.flip(
            runEffectPlacementSupervisor({
              codec: systemCodec,
              processor: makeProcessor(session, proposed),
              room,
              session,
              store,
            }),
          ),
        ).toEqual(
          new EffectPlacementResolutionMismatch({
            proposalId: proposal.proposalId,
            reason: 'AcceptedAndRejected',
          }),
        )
      }),
  )

  itEffect(
    'retries a request after server confirmation fails without local suppression',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* makePlacementFixture
          const baseStore = yield* makeInMemoryProgramStore()
          yield* baseStore.appendAcceptedMessageOccurrence(
            fixture.requestOccurrence,
          )
          const requestWriteCount = yield* SubscriptionRef.make(0)
          const failedWrite = new ProgramStoreError({
            cause: new Error('Server confirmation failed.'),
            operation: 'AppendEffectRequest',
          })
          const store: ProgramStoreService = {
            ...baseStore,
            appendServerConfirmedEffectRequest: request =>
              Effect.gen(function* () {
                const count = yield* SubscriptionRef.updateAndGet(
                  requestWriteCount,
                  current => current + 1,
                )
                if (count === 1) {
                  return yield* Effect.fail(failedWrite)
                } else {
                  return yield* baseStore.appendServerConfirmedEffectRequest(
                    request,
                  )
                }
              }),
          }
          const firstProposed = yield* Deferred.make<
            Readonly<{
              input: IdempotentCorrelatedProposalInput
              message: Message
            }>
          >()
          expect(
            yield* Effect.flip(
              runEffectPlacementSupervisor({
                codec: fixture.systemCodec,
                processor: makeProcessor(fixture.session, firstProposed),
                room,
                session: fixture.session,
                store,
              }),
            ),
          ).toEqual(failedWrite)
          expect(yield* Deferred.isDone(firstProposed)).toBe(false)

          const retryProposed = yield* Deferred.make<
            Readonly<{
              input: IdempotentCorrelatedProposalInput
              message: Message
            }>
          >()
          const retryFiber = yield* Effect.forkChild(
            runEffectPlacementSupervisor({
              codec: fixture.systemCodec,
              processor: makeProcessor(fixture.session, retryProposed),
              room,
              session: fixture.session,
              store,
            }),
          )
          yield* Deferred.await(retryProposed)
          expect(yield* SubscriptionRef.get(requestWriteCount)).toBe(2)
          yield* Fiber.interrupt(retryFiber)
        }),
      ),
  )

  itEffect(
    'buffers a RequestedEffect behind a sequence gap without durable writes',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const session = makeSession()
          const authenticatedCodec = makeMessageCodec({
            actor: Processor.AuthenticatedActor.make({ subjectId }),
          })
          const systemCodec = makeMessageCodec({
            actor: Processor.SystemActor.make({
              processorId: authorityProcessorId,
            }),
          })
          const sequenceOneProposal = yield* makeAuthenticatedProposal(
            ClickedIncrement(),
            'proposal-sequence-1',
            1,
            session,
          )
          const sequenceOneOccurrence = yield* makeAcceptedOccurrence(
            authenticatedCodec,
            sequenceOneProposal,
            1,
            session,
          )
          const sequenceTwoProposal = yield* makeAuthenticatedProposal(
            RequestedEffect({
              durationMs: Option.some(1),
              kind: 'BackgroundTimer',
              requestId: 'request-behind-gap',
            }),
            'proposal-sequence-2',
            2,
            session,
          )
          const sequenceTwoOccurrence = yield* makeAcceptedOccurrence(
            authenticatedCodec,
            sequenceTwoProposal,
            2,
            session,
          )
          const baseStore = yield* makeInMemoryProgramStore()
          const observedGap = yield* Deferred.make<void>()
          const placementWriteCount = yield* SubscriptionRef.make(0)
          const requestWriteCount = yield* SubscriptionRef.make(0)
          const proposalCount = yield* SubscriptionRef.make(0)
          const store = withWriteCounters(
            withServerConfirmedObservations(baseStore, {
              observeAcceptedMessageOccurrences: scope =>
                baseStore
                  .observeAcceptedMessageOccurrences(scope)
                  .pipe(
                    Stream.tap(occurrences =>
                      Array.some(
                        occurrences,
                        occurrence => occurrence.acceptedSequence === 2,
                      ) &&
                      !Array.some(
                        occurrences,
                        occurrence => occurrence.acceptedSequence === 1,
                      )
                        ? Deferred.succeed(observedGap, undefined).pipe(
                            Effect.asVoid,
                          )
                        : Effect.void,
                    ),
                  ),
            }),
            placementWriteCount,
            requestWriteCount,
          )
          const proposed = yield* Deferred.make<
            Readonly<{
              input: IdempotentCorrelatedProposalInput
              message: Message
            }>
          >()
          const processor = withProposalCounter(
            makeProcessor(session, proposed),
            proposalCount,
          )
          const fiber = yield* Effect.forkChild(
            runEffectPlacementSupervisor({
              codec: systemCodec,
              processor,
              room,
              session,
              store,
            }),
          )

          yield* baseStore.appendAcceptedMessageOccurrence(
            sequenceTwoOccurrence,
          )
          yield* Deferred.await(observedGap)
          yield* Effect.sleep('25 millis')

          expect(yield* SubscriptionRef.get(requestWriteCount)).toBe(0)
          expect(yield* SubscriptionRef.get(placementWriteCount)).toBe(0)
          expect(yield* SubscriptionRef.get(proposalCount)).toBe(0)
          expect(yield* Deferred.isDone(proposed)).toBe(false)

          yield* baseStore.appendAcceptedMessageOccurrence(
            sequenceOneOccurrence,
          )
          expect((yield* Deferred.await(proposed)).message._tag).toBe(
            'WaitedForEffectProcessor',
          )
          expect(yield* SubscriptionRef.get(requestWriteCount)).toBe(1)
          expect(yield* SubscriptionRef.get(placementWriteCount)).toBe(1)
          expect(yield* SubscriptionRef.get(proposalCount)).toBe(1)

          yield* baseStore.appendAcceptedMessageOccurrence(
            sequenceOneOccurrence,
          )
          yield* Effect.sleep('25 millis')

          expect(yield* SubscriptionRef.get(requestWriteCount)).toBe(1)
          expect(yield* SubscriptionRef.get(placementWriteCount)).toBe(1)
          expect(yield* SubscriptionRef.get(proposalCount)).toBe(1)
          yield* Fiber.interrupt(fiber)
        }),
      ),
  )

  itEffect('fails closed on every accepted-history identity conflict', () =>
    Effect.gen(function* () {
      const session = makeSession()
      const codec = makeMessageCodec({
        actor: Processor.AuthenticatedActor.make({ subjectId }),
      })
      const unkeyedFirstProposal = yield* makeAuthenticatedProposal(
        ClickedIncrement(),
        'proposal-conflict-1',
        1,
        session,
      )
      const firstProposal = InstantMessageProposalRecord.make({
        ...unkeyedFirstProposal,
        messageIdempotencyKey: 'accepted-history-conflict:1:0',
      })
      const secondProposal = yield* makeAuthenticatedProposal(
        RequestedEffect({
          durationMs: Option.some(1),
          kind: 'BackgroundTimer',
          requestId: 'request-conflict-2',
        }),
        'proposal-conflict-2',
        2,
        session,
      )
      const firstOccurrence = yield* makeAcceptedOccurrence(
        codec,
        firstProposal,
        1,
        session,
      )
      const secondOccurrence = yield* makeAcceptedOccurrence(
        codec,
        secondProposal,
        2,
        session,
      )
      const cases: ReadonlyArray<
        readonly [
          EffectPlacementAcceptedHistoryConflict['identityKind'],
          InstantAcceptedMessageOccurrenceRecord,
        ]
      > = [
        [
          'AcceptedSequence',
          InstantAcceptedMessageOccurrenceRecord.make({
            ...secondOccurrence,
            acceptedSequence: firstOccurrence.acceptedSequence,
            positionKey: firstOccurrence.positionKey,
          }),
        ],
        [
          'Occurrence',
          InstantAcceptedMessageOccurrenceRecord.make({
            ...secondOccurrence,
            id: firstOccurrence.occurrenceId,
            occurrenceId: firstOccurrence.occurrenceId,
          }),
        ],
        [
          'Proposal',
          InstantAcceptedMessageOccurrenceRecord.make({
            ...secondOccurrence,
            proposalId: firstOccurrence.proposalId,
          }),
        ],
        [
          'MessageIdempotencyKey',
          InstantAcceptedMessageOccurrenceRecord.make({
            ...secondOccurrence,
            messageIdempotencyKey: firstOccurrence.messageIdempotencyKey,
          }),
        ],
      ]

      yield* Effect.forEach(
        cases,
        ([identityKind, conflictingOccurrence]) =>
          Effect.gen(function* () {
            const baseStore = yield* makeInMemoryProgramStore()
            const acceptedRows = yield* SubscriptionRef.make<
              ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>
            >([firstOccurrence])
            const firstDecoded = yield* Deferred.make<void>()
            const placementWriteCount = yield* SubscriptionRef.make(0)
            const requestWriteCount = yield* SubscriptionRef.make(0)
            const proposalCount = yield* SubscriptionRef.make(0)
            const store = withWriteCounters(
              withServerConfirmedObservations(baseStore, {
                observeAcceptedMessageOccurrences: () =>
                  SubscriptionRef.changes(acceptedRows),
              }),
              placementWriteCount,
              requestWriteCount,
            )
            const proposed = yield* Deferred.make<
              Readonly<{
                input: IdempotentCorrelatedProposalInput
                message: Message
              }>
            >()
            const processor = withProposalCounter(
              makeProcessor(session, proposed),
              proposalCount,
            )
            const observedCodec: SharedProgramMessageCodec<
              Message,
              Processor.MessageEnvelope
            > = {
              ...codec,
              decodeAccepted: occurrence =>
                codec
                  .decodeAccepted(occurrence)
                  .pipe(
                    Effect.tap(() =>
                      occurrence.occurrenceId === firstOccurrence.occurrenceId
                        ? Deferred.succeed(firstDecoded, undefined).pipe(
                            Effect.asVoid,
                          )
                        : Effect.void,
                    ),
                  ),
            }
            const failed = yield* Effect.forkChild(
              Effect.flip(
                runEffectPlacementSupervisor({
                  codec: observedCodec,
                  processor,
                  room,
                  session,
                  store,
                }),
              ),
            )

            yield* Deferred.await(firstDecoded)
            yield* SubscriptionRef.set(acceptedRows, [conflictingOccurrence])

            expect(yield* Fiber.join(failed)).toMatchObject({
              _tag: 'EffectPlacementAcceptedHistoryConflict',
              identityKind,
            })
            expect(yield* SubscriptionRef.get(requestWriteCount)).toBe(0)
            expect(yield* SubscriptionRef.get(placementWriteCount)).toBe(0)
            expect(yield* SubscriptionRef.get(proposalCount)).toBe(0)
          }),
        { concurrency: 1, discard: true },
      )
    }),
  )

  itEffect(
    'does not let a corrupt accepted later placement fact skip the durable prefix',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makePlacementFixture
        const store = yield* makeInMemoryProgramStore()
        yield* appendPlacementFixture(store, fixture)
        const corruptFact = AssignedEffect({
          kind: fixture.requestMessage.kind,
          processorId: 'processor-headless',
          requestId: fixture.requestMessage.requestId,
        })
        const corruptProposal = yield* makeSystemProposal(
          corruptFact,
          'proposal-corrupt-accepted-placement',
          2,
          fixture.session,
          {
            messageIdempotencyKey: fixture.assignedPlacement.positionKey,
            maybeCausationOccurrenceId: Option.some(
              fixture.requestOccurrence.occurrenceId,
            ),
            maybeCorrelationId: Option.some(fixture.requestMessage.requestId),
          },
        )
        yield* store.appendAcceptedMessageOccurrence(
          yield* makeAcceptedOccurrence(
            fixture.systemCodec,
            corruptProposal,
            2,
            fixture.session,
          ),
        )

        const proposed = yield* awaitPlacementProposal(store, fixture)

        expect(proposed.message).toStrictEqual(
          WaitedForEffectProcessor({
            kind: fixture.requestMessage.kind,
            requestId: fixture.requestMessage.requestId,
          }),
        )
      }),
  )

  itEffect(
    'does not let a corrupt pending later placement fact suppress the durable prefix',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makePlacementFixture
        const store = yield* makeInMemoryProgramStore()
        yield* appendPlacementFixture(store, fixture)
        const corruptProposal = yield* makeSystemProposal(
          AssignedEffect({
            kind: fixture.requestMessage.kind,
            processorId: 'processor-headless',
            requestId: fixture.requestMessage.requestId,
          }),
          'proposal-corrupt-pending-placement',
          2,
          fixture.session,
          {
            messageIdempotencyKey: fixture.assignedPlacement.positionKey,
            maybeCausationOccurrenceId: Option.some(
              fixture.requestOccurrence.occurrenceId,
            ),
            maybeCorrelationId: Option.some(fixture.requestMessage.requestId),
          },
        )
        yield* store.appendMessageProposal(corruptProposal)

        const proposed = yield* awaitPlacementProposal(store, fixture)

        expect(proposed.message).toStrictEqual(
          WaitedForEffectProcessor({
            kind: fixture.requestMessage.kind,
            requestId: fixture.requestMessage.requestId,
          }),
        )
      }),
  )

  itEffect(
    'does not let a wrong-scope, wrong-kind, or wrong-routing proposal suppress a placement fact',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makePlacementFixture
        const validPendingProposal = yield* makeSystemProposal(
          WaitedForEffectProcessor({
            kind: fixture.requestMessage.kind,
            requestId: fixture.requestMessage.requestId,
          }),
          'proposal-pending-placement',
          2,
          fixture.session,
          {
            messageIdempotencyKey: fixture.waitingPlacement.positionKey,
            maybeCausationOccurrenceId: Option.some(
              fixture.requestOccurrence.occurrenceId,
            ),
            maybeCorrelationId: Option.some(fixture.requestMessage.requestId),
          },
        )
        const cases: ReadonlyArray<
          readonly [string, InstantMessageProposalRecord]
        > = [
          [
            'program',
            InstantMessageProposalRecord.make({
              ...validPendingProposal,
              programId: 'other-program',
            }),
          ],
          [
            'version',
            InstantMessageProposalRecord.make({
              ...validPendingProposal,
              programVersion: 2,
            }),
          ],
          [
            'session',
            InstantMessageProposalRecord.make({
              ...validPendingProposal,
              sessionId: 'other-session',
            }),
          ],
          [
            'subject',
            InstantMessageProposalRecord.make({
              ...validPendingProposal,
              subjectId: 'other-subject',
            }),
          ],
          [
            'kind',
            InstantMessageProposalRecord.make({
              ...validPendingProposal,
              effectRequestId: fixture.requestMessage.requestId,
            }),
          ],
          [
            'effect-result-kind',
            InstantMessageProposalRecord.make({
              ...validPendingProposal,
              effectAssignmentGeneration: 1,
              effectCancellationGeneration: 0,
              effectIdempotencyKey: fixture.request.idempotencyKey,
              effectRequestId: fixture.requestMessage.requestId,
              executorProcessorId: authorityProcessorId,
              proposalKind: 'EffectResult',
            }),
          ],
          [
            'category',
            InstantMessageProposalRecord.make({
              ...validPendingProposal,
              messageCategory: 'Navigation',
            }),
          ],
          [
            'generation',
            InstantMessageProposalRecord.make({
              ...validPendingProposal,
              policyGeneration: fixture.session.sessionPolicy.generation + 1,
            }),
          ],
          [
            'audience',
            InstantMessageProposalRecord.make({
              ...validPendingProposal,
              proposedAudience: Synchronization.ProcessorAudience.make({
                processorIds: [authorityProcessorId],
              }),
            }),
          ],
        ]

        yield* Effect.forEach(
          cases,
          ([caseId, pendingProposal]) =>
            Effect.gen(function* () {
              const baseStore = yield* makeInMemoryProgramStore()
              yield* appendPlacementFixture(baseStore, fixture)
              const store = withServerConfirmedObservations(baseStore, {
                observeMessageProposals: () =>
                  Stream.succeed([pendingProposal]).pipe(
                    Stream.concat(Stream.never),
                  ),
              })

              expect(
                (yield* awaitPlacementProposal(store, fixture)).message,
                caseId,
              ).toStrictEqual(
                WaitedForEffectProcessor({
                  kind: fixture.requestMessage.kind,
                  requestId: fixture.requestMessage.requestId,
                }),
              )
            }),
          { concurrency: 1, discard: true },
        )
      }),
  )

  itEffect(
    'reuses one placement identity across crash, restart, and proposal-query skew',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* makePlacementFixture
          const baseStore = yield* makeInMemoryProgramStore()
          yield* appendPlacementFixture(baseStore, fixture)
          const skewedStore = withServerConfirmedObservations(baseStore, {
            observeMessageProposals: () =>
              Stream.succeed<ReadonlyArray<InstantMessageProposalRecord>>(
                [],
              ).pipe(Stream.concat(Stream.never)),
          })
          const recorded = yield* SubscriptionRef.make<
            ReadonlyArray<RecordedPlacementProposal>
          >([])
          const runUntilProposal = (
            proposalId: string,
            actorSequence: number,
            expectedCount: number,
          ) =>
            Effect.gen(function* () {
              const supervisor = yield* Effect.forkChild(
                runEffectPlacementSupervisor({
                  codec: fixture.systemCodec,
                  processor: makeRecordingProcessor(
                    fixture.session,
                    proposalId,
                    actorSequence,
                    recorded,
                  ),
                  room,
                  session: fixture.session,
                  store: skewedStore,
                }),
              )
              yield* Stream.runHead(
                Stream.filter(
                  SubscriptionRef.changes(recorded),
                  proposals => proposals.length === expectedCount,
                ),
              )
              yield* Fiber.interrupt(supervisor)
            })

          yield* runUntilProposal('proposal-before-crash', 100, 1)
          yield* runUntilProposal('proposal-after-restart', 101, 2)

          const proposals = yield* SubscriptionRef.get(recorded)
          const first = Option.getOrThrow(Array.get(proposals, 0))
          const retry = Option.getOrThrow(Array.get(proposals, 1))
          expect(first.proposal.proposalId).not.toBe(retry.proposal.proposalId)
          expect(first.proposal.actorSequence).not.toBe(
            retry.proposal.actorSequence,
          )
          expect(first.input.messageIdempotencyKey).toBe(
            fixture.waitingPlacement.positionKey,
          )
          expect(retry.input.messageIdempotencyKey).toBe(
            fixture.waitingPlacement.positionKey,
          )
          expect(first.message).toStrictEqual(retry.message)

          const authority = yield* makeAdmissionSequencer({
            acceptEnvelope: fixture.systemCodec.acceptEnvelope,
            decodeAcceptedMessage: occurrence =>
              fixture.systemCodec
                .decodeAccepted(occurrence)
                .pipe(Effect.map(decoded => decoded.message)),
            decodeProposedMessage: proposal =>
              fixture.systemCodec
                .decodeProposed(proposal)
                .pipe(Effect.map(decoded => decoded.message)),
            messageCategory: (): Synchronization.MessageCategory => 'Domain',
            now: () => 500,
            session: fixture.session,
            store: baseStore,
          })
          yield* authority.recoverAcceptedOccurrences([
            fixture.requestOccurrence,
          ])
          const accepted = yield* authority.admit(first.proposal)
          const retried = yield* authority.admit(retry.proposal)
          const durableOccurrences = Option.getOrThrow(
            yield* Stream.runHead(
              baseStore.observeAcceptedMessageOccurrences({
                sessionId: fixture.session.sessionId,
                subjectId: fixture.session.subjectId,
              }),
            ),
          )

          expect(retried).toEqual(accepted)
          expect(durableOccurrences).toHaveLength(2)
          expect(
            Array.filter(
              durableOccurrences,
              occurrence =>
                occurrence.messageIdempotencyKey ===
                fixture.waitingPlacement.positionKey,
            ),
          ).toEqual([accepted])
        }),
      ),
  )

  itEffect('reuses accepted history across presence-only heartbeats', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makePlacementFixture
        const store = yield* makeInMemoryProgramStore()
        yield* appendPlacementFixture(store, fixture)
        const decodeCount = yield* SubscriptionRef.make(0)
        const presence = yield* SubscriptionRef.make<
          ReadonlyArray<InstantProcessorPresence>
        >([])
        const codec: SharedProgramMessageCodec<
          Message,
          Processor.MessageEnvelope
        > = {
          ...fixture.systemCodec,
          decodeAccepted: occurrence =>
            SubscriptionRef.update(decodeCount, count => count + 1).pipe(
              Effect.andThen(fixture.systemCodec.decodeAccepted(occurrence)),
            ),
        }
        const heartbeatRoom: ProcessorRoomService = {
          ...room,
          observePresence: SubscriptionRef.changes(presence),
        }
        const proposed = yield* Deferred.make<
          Readonly<{
            input: IdempotentCorrelatedProposalInput
            message: Message
          }>
        >()
        const fiber = yield* Effect.forkChild(
          runEffectPlacementSupervisor({
            codec,
            processor: makeProcessor(fixture.session, proposed),
            room: heartbeatRoom,
            session: fixture.session,
            store,
          }),
        )

        yield* Deferred.await(proposed)
        expect(yield* SubscriptionRef.get(decodeCount)).toBe(1)

        yield* SubscriptionRef.set(presence, [])
        yield* SubscriptionRef.set(presence, [])
        yield* SubscriptionRef.set(presence, [])
        yield* Effect.sleep('25 millis')

        expect(yield* SubscriptionRef.get(decodeCount)).toBe(1)
        yield* Fiber.interrupt(fiber)
      }),
    ),
  )

  itEffect('rejects every ordered policy-history violation', () =>
    Effect.gen(function* () {
      const currentPolicy = sharedDomainPolicy(1)
      const session = makeSession(currentPolicy)
      const codec = makeMessageCodec({
        actor: Processor.AuthenticatedActor.make({ subjectId }),
      })
      const cases: ReadonlyArray<
        readonly [
          string,
          ReadonlyArray<Synchronization.SessionPolicy>,
          EffectPlacementAcceptedOccurrenceMismatch['reason'],
        ]
      > = [
        [
          'decreased',
          [currentPolicy, mirrorPolicy(0)],
          'PolicyGenerationDecreased',
        ],
        ['future', [mirrorPolicy(2)], 'FuturePolicyGeneration'],
        ['wrong-current', [mirrorPolicy(1)], 'SessionPolicyClaim'],
        [
          'reused-generation',
          [mirrorPolicy(0), sharedDomainPolicy(0)],
          'SessionPolicyClaim',
        ],
      ]

      yield* Effect.forEach(
        cases,
        ([caseId, policies, expectedReason]) =>
          Effect.gen(function* () {
            const store = yield* makeInMemoryProgramStore()
            yield* Effect.forEach(
              policies,
              (policy, index) =>
                Effect.gen(function* () {
                  const sequence = index + 1
                  const proposal = yield* makeAuthenticatedProposal(
                    RequestedEffect({
                      durationMs: Option.some(1),
                      kind: 'BackgroundTimer',
                      requestId: `${caseId}-${sequence}`,
                    }),
                    `proposal-${caseId}-${sequence}`,
                    sequence,
                    session,
                    policy,
                  )
                  yield* store.appendAcceptedMessageOccurrence(
                    yield* makeAcceptedOccurrence(
                      codec,
                      proposal,
                      sequence,
                      session,
                      policy,
                    ),
                  )
                }),
              { concurrency: 1, discard: true },
            )
            const proposed = yield* Deferred.make<
              Readonly<{
                input: IdempotentCorrelatedProposalInput
                message: Message
              }>
            >()

            expect(
              yield* Effect.flip(
                runEffectPlacementSupervisor({
                  codec,
                  processor: makeProcessor(session, proposed),
                  room,
                  session,
                  store,
                }),
              ),
            ).toMatchObject({
              _tag: 'EffectPlacementAcceptedOccurrenceMismatch',
              reason: expectedReason,
            })
          }),
        { concurrency: 1, discard: true },
      )
    }),
  )

  itEffect(
    'rejects every observed placement outside the full Program scope',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makePlacementFixture
        const baseStore = yield* makeInMemoryProgramStore()
        const cases: ReadonlyArray<
          readonly [
            EffectPlacementRecordScopeMismatch['reason'],
            InstantEffectPlacementRecord,
          ]
        > = [
          [
            'ProgramId',
            InstantEffectPlacementRecord.make({
              ...fixture.waitingPlacement,
              programId: 'other-program',
            }),
          ],
          [
            'ProgramVersion',
            InstantEffectPlacementRecord.make({
              ...fixture.waitingPlacement,
              programVersion: 2,
            }),
          ],
          [
            'SessionId',
            InstantEffectPlacementRecord.make({
              ...fixture.waitingPlacement,
              sessionId: 'other-session',
            }),
          ],
          [
            'SubjectId',
            InstantEffectPlacementRecord.make({
              ...fixture.waitingPlacement,
              subjectId: 'other-subject',
            }),
          ],
        ]

        yield* Effect.forEach(
          cases,
          ([expectedReason, placement]) =>
            Effect.gen(function* () {
              const proposed = yield* Deferred.make<
                Readonly<{
                  input: IdempotentCorrelatedProposalInput
                  message: Message
                }>
              >()
              const store = withServerConfirmedObservations(baseStore, {
                observeEffectPlacements: () =>
                  Stream.succeed([placement]).pipe(Stream.concat(Stream.never)),
              })

              expect(
                yield* Effect.flip(
                  runEffectPlacementSupervisor({
                    codec: fixture.systemCodec,
                    processor: makeProcessor(fixture.session, proposed),
                    room,
                    session: fixture.session,
                    store,
                  }),
                ),
              ).toEqual(
                new EffectPlacementRecordScopeMismatch({
                  positionKey: placement.positionKey,
                  reason: expectedReason,
                }),
              )
            }),
          { concurrency: 1, discard: true },
        )
      }),
  )
})
