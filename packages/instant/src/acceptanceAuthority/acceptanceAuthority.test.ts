import {
  Array,
  Effect,
  Fiber,
  Latch,
  Option,
  Schema as S,
  Stream,
  SubscriptionRef,
} from 'effect'
import { Command, Processor, Synchronization } from 'foldkit'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  AcceptanceAuthorityAcceptedOccurrenceInvalid,
  AcceptanceAuthorityEffectResultMismatch,
  AcceptanceAuthorityEnvelopeError,
  AcceptanceAuthorityIdentityConflict,
  AcceptanceAuthorityMessageCategoryError,
  AcceptanceAuthorityProposalDeferred,
  AcceptanceAuthorityProposalKindMismatch,
  AcceptanceAuthorityScopeMismatch,
  AcceptanceAuthoritySessionPolicyChanged,
  AcceptanceAuthoritySynchronizationPolicyMismatch,
  AdmissionSequencerCapability,
  AdmissionSequencerCapabilityRequirement,
  AdmissionSequencerResolutionProcessorMismatch,
  AdmissionSequencerTerminalConflict,
  InstantAcceptedMessageOccurrenceRecord,
  InstantAcceptedMessageOccurrenceValidationIssue,
  InstantEffectPlacementRecord,
  InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  InstantMessageProposalResolutionRecord,
  InstantProgramSessionRecord,
  ProgramStoreError,
  type ProgramAuthorityStoreService as ProgramStoreService,
  instantProgramProtocolVersion,
  makeAcceptedOccurrencePositionKey,
  makeAdmissionSequencer,
  makeInMemoryProgramAuthorityStore as makeInMemoryProgramStore,
  makeInstantCapabilityIdIndex,
  makeInstantEffectPlacementPositionKey,
  makeMessageProposalRejectionResolution,
} from '../index.js'

const sessionId = 'session-001'
const subjectId = 'subject-001'

const Incremented = S.TaggedStruct('Incremented', {})
const SelectedCounter = S.TaggedStruct('SelectedCounter', {
  counterId: S.String,
})
const CompletedEffect = S.TaggedStruct('CompletedEffect', {})
const Message = S.Union([Incremented, SelectedCounter, CompletedEffect])
type Message = typeof Message.Type
const MessageJson = S.fromJsonString(Message)

const mirrorPolicy = Synchronization.SessionPolicy.make({
  generation: 0,
  mode: Synchronization.Mirror.make({}),
})

const programAdmission = {
  decodeAcceptedMessage: (occurrence: InstantAcceptedMessageOccurrenceRecord) =>
    Effect.try(() => S.decodeUnknownSync(MessageJson)(occurrence.payloadJson)),
  decodeProposedMessage: (proposal: InstantMessageProposalRecord) =>
    Effect.try(() => S.decodeUnknownSync(MessageJson)(proposal.payloadJson)),
  messageCategory: (message: Message): Synchronization.MessageCategory =>
    message._tag === 'SelectedCounter' ? 'Navigation' : 'Domain',
}

const session = InstantProgramSessionRecord.make({
  authorityProcessorId: 'processor-sequencer',
  createdAtMs: 1_753_825_000_000,
  id: sessionId,
  isRevoked: false,
  processorRoomId: 'room-4ec724f1c3584d679b8a3b88f470e372',
  programId: 'counter',
  programVersion: 1,
  protocolVersion: instantProgramProtocolVersion,
  sessionId,
  sessionPolicy: mirrorPolicy,
  subjectId,
})

const makeProposal = (
  proposalId: string,
  actorSequence: number,
): InstantMessageProposalRecord =>
  InstantMessageProposalRecord.make({
    actorId: subjectId,
    actorSequence,
    causationOccurrenceId: null,
    clientId: 'client-browser',
    correlationId: null,
    createdAtMs: 1_753_825_100_000 + actorSequence,
    effectAssignmentGeneration: null,
    effectCancellationGeneration: null,
    effectIdempotencyKey: null,
    effectRequestId: null,
    envelopeJson: '{"protocol":"foldkit-message"}',
    envelopeVersion: 1,
    eventId: 'counter.incremented',
    eventVersion: 1,
    executorProcessorId: null,
    id: proposalId,
    messageCategory: 'Domain',
    messageIdempotencyKey: null,
    occurrenceId: proposalId,
    originDeviceId: 'device-browser',
    originatingProcessorId: 'processor-browser',
    payloadJson: '{"_tag":"Incremented"}',
    programId: session.programId,
    programVersion: session.programVersion,
    protocolVersion: session.protocolVersion,
    proposalId,
    proposalKind: 'Message',
    proposedAudience: Synchronization.SessionAudience.make({}),
    policyGeneration: session.sessionPolicy.generation,
    sessionId,
    subjectId,
  })

const makeTestSequencer = (
  store: ProgramStoreService,
  configuredSession: InstantProgramSessionRecord,
) =>
  makeAdmissionSequencer({
    ...programAdmission,
    acceptEnvelope: proposal => Effect.succeed(proposal.envelopeJson),
    now: () => 1_753_825_200_000,
    session: configuredSession,
    store,
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

const makeResolution = (
  proposal: InstantMessageProposalRecord,
): InstantMessageProposalResolutionRecord =>
  InstantMessageProposalResolutionRecord.make({
    actorId: proposal.actorId,
    actorSequence: proposal.actorSequence,
    clientId: proposal.clientId,
    id: proposal.proposalId,
    programId: proposal.programId,
    programVersion: proposal.programVersion,
    protocolVersion: proposal.protocolVersion,
    proposalId: proposal.proposalId,
    rejectedAtMs: 1_753_825_200_000,
    rejectingProcessorId: session.authorityProcessorId,
    rejectionReason: 'EnvelopeInvalid',
    sessionId: proposal.sessionId,
    subjectId: proposal.subjectId,
  })

const leaderProcessorId = 'processor-leader'
const followerProcessorId = 'processor-follower'
const executorProcessorId = 'processor-executor'

const makeFollowPolicy = (
  control: Synchronization.FollowControl,
  generation: number,
): Synchronization.SessionPolicy =>
  Synchronization.SessionPolicy.make({
    generation,
    mode: Synchronization.Follow.make({
      followers: [
        Synchronization.Follower.make({
          control,
          processorId: followerProcessorId,
        }),
      ],
      leaderProcessorId,
    }),
  })

const followedAudience = Synchronization.ProcessorAudience.make({
  processorIds: [followerProcessorId, leaderProcessorId],
})

const makeEffectResultFixture = (fixtureId: string) =>
  Effect.gen(function* () {
    const generatorStore = yield* makeInMemoryProgramStore()
    const generator = yield* makeTestSequencer(generatorStore, session)
    const causalOccurrence = yield* generator.admit(
      makeProposal(`${fixtureId}-causal`, 1),
    )
    const capability = Processor.CapabilityRequirement.make({
      id: ['Device', 'Persist'],
      minimumVersion: 1,
    })
    const effectRequest = InstantEffectRequestRecord.make({
      causalAudience: causalOccurrence.audience,
      causalMessageCategory: causalOccurrence.messageCategory,
      causalOccurrenceId: causalOccurrence.occurrenceId,
      causalPolicyGeneration: causalOccurrence.policyGeneration,
      effectId: 'persist-counter',
      effectVersion: 1,
      id: `${fixtureId}-request`,
      idempotencyKey: `${fixtureId}-idempotency`,
      minimumCapabilityVersion: capability.minimumVersion,
      originatingProcessorId: causalOccurrence.originatingProcessorId,
      placement: Processor.Placement.make({
        affinity: Processor.AnyProcessor.make({}),
        capability,
        cardinality: 'One',
        unavailable: 'Wait',
        version: 1,
      }),
      programId: session.programId,
      programVersion: session.programVersion,
      protocolVersion: session.protocolVersion,
      publicArguments: {},
      permittedResultEvents: [
        Command.ResultEventRange.make({
          eventId: 'counter.effect-completed',
          maximumVersion: 1,
          minimumVersion: 1,
        }),
      ],
      requestId: `${fixtureId}-request`,
      requestedAtMs: 1_753_825_300_000,
      requiredCapabilityIdJson: makeInstantCapabilityIdIndex(capability.id),
      sessionId,
      subjectId,
    })
    const effectPlacement = InstantEffectPlacementRecord.make({
      assignedProcessorId: executorProcessorId,
      assignmentGeneration: 1,
      cancellationGeneration: 0,
      decidedAtMs: 1_753_825_300_001,
      id: '44444444-4444-4444-8444-444444444444',
      placementDecision: Processor.AssignedPreferred.make({
        processorId: executorProcessorId,
      }),
      placementStatus: 'AssignedPreferred',
      positionKey: makeInstantEffectPlacementPositionKey(
        effectRequest.requestId,
        1,
        0,
      ),
      programId: session.programId,
      programVersion: session.programVersion,
      protocolVersion: session.protocolVersion,
      requestId: effectRequest.requestId,
      sessionId,
      subjectId,
    })
    const effectResultProposal = InstantMessageProposalRecord.make({
      ...makeProposal(`${fixtureId}-result`, 2),
      causationOccurrenceId: causalOccurrence.occurrenceId,
      effectAssignmentGeneration: effectPlacement.assignmentGeneration,
      effectCancellationGeneration: effectPlacement.cancellationGeneration,
      effectIdempotencyKey: effectRequest.idempotencyKey,
      effectRequestId: effectRequest.requestId,
      eventId: 'counter.effect-completed',
      executorProcessorId,
      messageCategory: causalOccurrence.messageCategory,
      originatingProcessorId: executorProcessorId,
      payloadJson: S.encodeSync(MessageJson)(CompletedEffect.make({})),
      policyGeneration: causalOccurrence.policyGeneration,
      proposalKind: 'EffectResult',
      proposedAudience: causalOccurrence.audience,
    })
    return {
      causalOccurrence,
      effectPlacement,
      effectRequest,
      effectResultProposal,
    }
  })

describe('admission sequencer proposal resolution', () => {
  it('advertises sequencing as a portable Processor capability', () => {
    expect(AdmissionSequencerCapability).toEqual({
      id: ['Foldkit', 'Admission', 'Sequence'],
      version: 2,
    })
    expect(AdmissionSequencerCapabilityRequirement).toEqual({
      id: AdmissionSequencerCapability.id,
      minimumVersion: 2,
    })
  })

  it.effect(
    'admits concurrent ordinary-Message aliases once and durably resolves the retry',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const messageIdempotencyKey = 'placement-request-1:1:0'
          const original = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-idempotent-original', 1),
            messageIdempotencyKey,
          })
          const alias = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-idempotent-alias', 2),
            messageIdempotencyKey,
          })
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposal(original)
          yield* store.appendMessageProposal(alias)
          const sequencer = yield* makeTestSequencer(store, session)
          const sequencerFiber = yield* Effect.forkChild(sequencer.run)

          const resolutions = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                store.observeMessageProposalResolutions({
                  sessionId,
                  subjectId,
                }),
                candidates =>
                  Array.some(
                    candidates,
                    resolution => resolution.proposalId === alias.proposalId,
                  ),
              ),
            ),
          )
          yield* Fiber.interrupt(sequencerFiber)

          const occurrences = Option.getOrThrow(
            yield* Stream.runHead(
              store.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
            ),
          )
          expect(occurrences).toHaveLength(1)
          expect(Option.getOrThrow(Array.head(occurrences))).toEqual(
            expect.objectContaining({
              messageIdempotencyKey,
              proposalId: original.proposalId,
            }),
          )
          expect(resolutions).toContainEqual(
            expect.objectContaining({
              actorId: alias.actorId,
              actorSequence: alias.actorSequence,
              clientId: alias.clientId,
              proposalId: alias.proposalId,
              rejectionReason: 'DuplicateMessage',
            }),
          )
        }),
      ),
  )

  it.effect(
    'does not advance actor high water until an alias resolution synchronizes',
    () =>
      Effect.gen(function* () {
        const sequencer = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          session,
        )
        const messageIdempotencyKey = 'placement-request-unsynced:1:0'
        yield* sequencer.admit(
          InstantMessageProposalRecord.make({
            ...makeProposal('proposal-unsynced-original', 1),
            messageIdempotencyKey,
          }),
        )
        const alias = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-unsynced-alias', 3),
          messageIdempotencyKey,
        })

        yield* sequencer.admit(alias)
        const intervening = yield* sequencer.admit(
          makeProposal('proposal-before-alias-resolution', 2),
        )

        expect(intervening.actorSequence).toBe(2)
        expect(intervening.acceptedSequence).toBe(2)
      }),
  )

  it.effect(
    'reconsiders an ordinary-Message alias after a server-confirmed resolution failure',
    () =>
      Effect.gen(function* () {
        const generator = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          session,
        )
        const messageIdempotencyKey = 'placement-request-crash:1:0'
        const accepted = yield* generator.admit(
          InstantMessageProposalRecord.make({
            ...makeProposal('proposal-crash-original', 1),
            messageIdempotencyKey,
          }),
        )
        const alias = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-crash-alias', 2),
          messageIdempotencyKey,
        })
        const baseStore = yield* makeInMemoryProgramStore()
        const resolutionAppendCount = yield* SubscriptionRef.make(0)
        const store: ProgramStoreService = {
          ...baseStore,
          appendServerConfirmedMessageProposalResolution: () =>
            SubscriptionRef.update(
              resolutionAppendCount,
              count => count + 1,
            ).pipe(
              Effect.andThen(
                Effect.fail(
                  new ProgramStoreError({
                    cause: new Error('Resolution write failed.'),
                    operation: 'AppendMessageProposalResolution',
                  }),
                ),
              ),
            ),
        }
        yield* baseStore.appendProgramSession(session)
        yield* baseStore.appendAcceptedMessageOccurrence(accepted)
        yield* baseStore.appendMessageProposal(alias)

        const first = yield* makeTestSequencer(store, session)
        expect(yield* Effect.flip(first.run)).toEqual(
          new ProgramStoreError({
            cause: new Error('Resolution write failed.'),
            operation: 'AppendMessageProposalResolution',
          }),
        )
        const restarted = yield* makeTestSequencer(store, session)
        expect(yield* Effect.flip(restarted.run)).toEqual(
          new ProgramStoreError({
            cause: new Error('Resolution write failed.'),
            operation: 'AppendMessageProposalResolution',
          }),
        )
        expect(yield* SubscriptionRef.get(resolutionAppendCount)).toBe(2)
      }),
  )

  it.effect(
    'fails closed when an ordinary-Message idempotency key changes semantics or scope',
    () =>
      Effect.gen(function* () {
        const sequencer = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          session,
        )
        const messageIdempotencyKey = 'placement-request-2:1:0'
        const original = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-key-contract-original', 1),
          messageIdempotencyKey,
        })
        yield* sequencer.admit(original)

        const changedMessage = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-key-contract-message', 2),
          eventId: 'counter.selected',
          messageCategory: 'Navigation',
          messageIdempotencyKey,
          payloadJson: S.encodeSync(MessageJson)(
            SelectedCounter.make({ counterId: 'counter-004' }),
          ),
        })
        const changedRouting = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-key-contract-routing', 3),
          messageIdempotencyKey,
          proposedAudience: Synchronization.ProcessorAudience.make({
            processorIds: ['processor-browser'],
          }),
        })
        const changedPolicy = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-key-contract-policy', 4),
          messageIdempotencyKey,
          policyGeneration: 1,
        })
        const changedScope = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-key-contract-scope', 5),
          messageIdempotencyKey,
          sessionId: 'session-other',
        })

        expect(yield* Effect.flip(sequencer.admit(changedMessage))).toEqual(
          new AcceptanceAuthorityIdentityConflict({
            identity: messageIdempotencyKey,
            identityKind: 'MessageIdempotencyKey',
          }),
        )
        expect(yield* Effect.flip(sequencer.admit(changedRouting))).toEqual(
          new AcceptanceAuthoritySynchronizationPolicyMismatch({
            proposalId: changedRouting.proposalId,
            reason: 'AudienceClaim',
          }),
        )
        expect(yield* Effect.flip(sequencer.admit(changedPolicy))).toEqual(
          new AcceptanceAuthoritySynchronizationPolicyMismatch({
            proposalId: changedPolicy.proposalId,
            reason: 'PolicyGenerationClaim',
          }),
        )
        expect(yield* Effect.flip(sequencer.admit(changedScope))).toEqual(
          new AcceptanceAuthorityScopeMismatch({
            actualProgramId: changedScope.programId,
            actualProgramVersion: changedScope.programVersion,
            actualProtocolVersion: changedScope.protocolVersion,
            actualSessionId: changedScope.sessionId,
            actualSubjectId: changedScope.subjectId,
            expectedProgramId: session.programId,
            expectedProgramVersion: session.programVersion,
            expectedProtocolVersion: session.protocolVersion,
            expectedSessionId: session.sessionId,
            expectedSubjectId: session.subjectId,
          }),
        )
      }),
  )

  it.effect(
    'rejects malicious aliases in the run loop without poisoning actor high water',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const invalidEnvelope = new Error('The alias envelope is invalid.')
          const store = yield* makeInMemoryProgramStore()
          const sequencer = yield* makeAdmissionSequencer({
            ...programAdmission,
            acceptEnvelope: proposal =>
              proposal.envelopeJson === 'malformed-envelope'
                ? Effect.fail(invalidEnvelope)
                : Effect.succeed(proposal.envelopeJson),
            now: () => 1_753_825_200_000,
            session,
            store,
          })
          const messageIdempotencyKey = 'malicious-alias-high-water:1:0'
          const original = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-malicious-alias-original', 1),
            messageIdempotencyKey,
          })
          const forgedProvenance = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-malicious-alias-provenance', 999),
            messageIdempotencyKey,
            originDeviceId: 'device-attacker',
            originatingProcessorId: 'processor-attacker',
          })
          const legitimateSecond = makeProposal(
            'proposal-after-forged-alias',
            2,
          )
          const malformedEnvelopeAlias = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-malicious-alias-envelope', 1_000),
            envelopeJson: 'malformed-envelope',
            messageIdempotencyKey,
          })
          const legitimateThird = makeProposal(
            'proposal-after-malformed-alias',
            3,
          )

          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposal(original)
          const sequencerFiber = yield* Effect.forkChild(sequencer.run)
          yield* Stream.runHead(
            Stream.filter(
              store.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
              occurrences =>
                Array.some(
                  occurrences,
                  occurrence => occurrence.proposalId === original.proposalId,
                ),
            ),
          )

          yield* store.appendMessageProposal(forgedProvenance)
          const forgedResolutions = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                store.observeMessageProposalResolutions({
                  sessionId,
                  subjectId,
                }),
                resolutions =>
                  Array.some(
                    resolutions,
                    resolution =>
                      resolution.proposalId === forgedProvenance.proposalId,
                  ),
              ),
            ),
          )
          yield* store.appendMessageProposal(legitimateSecond)
          yield* Stream.runHead(
            Stream.filter(
              store.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
              occurrences =>
                Array.some(
                  occurrences,
                  occurrence =>
                    occurrence.proposalId === legitimateSecond.proposalId,
                ),
            ),
          )

          yield* store.appendMessageProposal(malformedEnvelopeAlias)
          const malformedResolutions = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                store.observeMessageProposalResolutions({
                  sessionId,
                  subjectId,
                }),
                resolutions =>
                  Array.some(
                    resolutions,
                    resolution =>
                      resolution.proposalId ===
                      malformedEnvelopeAlias.proposalId,
                  ),
              ),
            ),
          )
          yield* store.appendMessageProposal(legitimateThird)
          const accepted = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                store.observeAcceptedMessageOccurrences({
                  sessionId,
                  subjectId,
                }),
                occurrences =>
                  Array.some(
                    occurrences,
                    occurrence =>
                      occurrence.proposalId === legitimateThird.proposalId,
                  ),
              ),
            ),
          )
          yield* Fiber.interrupt(sequencerFiber)

          expect(forgedResolutions).toContainEqual(
            expect.objectContaining({
              proposalId: forgedProvenance.proposalId,
              rejectionReason: 'IdentityConflict',
            }),
          )
          expect(malformedResolutions).toContainEqual(
            expect.objectContaining({
              proposalId: malformedEnvelopeAlias.proposalId,
              rejectionReason: 'EnvelopeInvalid',
            }),
          )
          expect(
            Array.map(accepted, occurrence => occurrence.proposalId),
          ).toEqual([
            original.proposalId,
            legitimateSecond.proposalId,
            legitimateThird.proposalId,
          ])
        }),
      ),
  )

  it.effect(
    'defers effect results until causal request and placement snapshots catch up',
    () =>
      Effect.gen(function* () {
        const {
          causalOccurrence,
          effectPlacement,
          effectRequest,
          effectResultProposal,
        } = yield* makeEffectResultFixture('proposal-deferred-effect')
        const sequencer = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          session,
        )
        yield* sequencer.recoverEffectRequests([effectRequest])
        expect(
          yield* Effect.flip(sequencer.admit(effectResultProposal)),
        ).toEqual(
          new AcceptanceAuthorityProposalDeferred({
            effectRequestId: effectRequest.requestId,
            proposalId: effectResultProposal.proposalId,
            reason: 'EffectRequestPending',
          }),
        )
        yield* sequencer.recoverAcceptedOccurrences([causalOccurrence])

        expect(
          yield* Effect.flip(sequencer.admit(effectResultProposal)),
        ).toEqual(
          new AcceptanceAuthorityProposalDeferred({
            effectRequestId: effectRequest.requestId,
            proposalId: effectResultProposal.proposalId,
            reason: 'EffectRequestPending',
          }),
        )

        yield* sequencer.recoverEffectRequests([effectRequest])
        expect(
          yield* Effect.flip(sequencer.admit(effectResultProposal)),
        ).toEqual(
          new AcceptanceAuthorityProposalDeferred({
            effectRequestId: effectRequest.requestId,
            proposalId: effectResultProposal.proposalId,
            reason: 'EffectPlacementPending',
          }),
        )

        const priorPlacement = InstantEffectPlacementRecord.make({
          ...effectPlacement,
          assignmentGeneration: 0,
          id: '33333333-3333-4333-8333-333333333333',
          positionKey: makeInstantEffectPlacementPositionKey(
            effectRequest.requestId,
            0,
            0,
          ),
        })
        yield* sequencer.recoverEffectPlacements([priorPlacement])
        expect(
          yield* Effect.flip(sequencer.admit(effectResultProposal)),
        ).toEqual(
          new AcceptanceAuthorityProposalDeferred({
            effectRequestId: effectRequest.requestId,
            proposalId: effectResultProposal.proposalId,
            reason: 'PlacementGenerationPending',
          }),
        )

        const futureCancellation = InstantMessageProposalRecord.make({
          ...effectResultProposal,
          effectCancellationGeneration: 1,
          id: `${effectResultProposal.proposalId}-future-cancellation`,
          occurrenceId: `${effectResultProposal.occurrenceId}-future-cancellation`,
          proposalId: `${effectResultProposal.proposalId}-future-cancellation`,
        })
        yield* sequencer.recoverEffectPlacements([
          priorPlacement,
          effectPlacement,
        ])
        expect(yield* Effect.flip(sequencer.admit(futureCancellation))).toEqual(
          new AcceptanceAuthorityProposalDeferred({
            effectRequestId: effectRequest.requestId,
            proposalId: futureCancellation.proposalId,
            reason: 'PlacementGenerationPending',
          }),
        )

        const accepted = yield* sequencer.admit(effectResultProposal)
        expect(accepted.proposalId).toBe(effectResultProposal.proposalId)
      }),
  )

  it.effect(
    'keeps a skewed effect result pending in the run loop until every stream catches up',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const {
            causalOccurrence,
            effectPlacement,
            effectRequest,
            effectResultProposal,
          } = yield* makeEffectResultFixture('proposal-skewed-effect')
          const baseStore = yield* makeInMemoryProgramStore()
          const acceptedSnapshots = yield* SubscriptionRef.make<
            ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>
          >([causalOccurrence])
          const requestSnapshots = yield* SubscriptionRef.make<
            ReadonlyArray<InstantEffectRequestRecord>
          >([])
          const placementSnapshots = yield* SubscriptionRef.make<
            ReadonlyArray<InstantEffectPlacementRecord>
          >([])
          const proposalSnapshots = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalRecord>
          >([])
          const laterSameStreamProposal = makeProposal(
            'proposal-after-skewed-effect',
            3,
          )
          const makeSignalProposal = (actorSequence: number) =>
            InstantMessageProposalRecord.make({
              ...makeProposal(
                `proposal-skew-signal-${actorSequence}`,
                actorSequence,
              ),
              actorId: 'actor-skew-signal',
              clientId: 'client-skew-signal',
              originDeviceId: 'device-skew-signal',
              originatingProcessorId: 'processor-skew-signal',
            })
          const waitForAccepted = (proposalId: string) =>
            Stream.runHead(
              Stream.filter(
                baseStore.observeAcceptedMessageOccurrences({
                  sessionId,
                  subjectId,
                }),
                occurrences =>
                  Array.some(
                    occurrences,
                    occurrence => occurrence.proposalId === proposalId,
                  ),
              ),
            )
          const store = withServerConfirmedObservations(baseStore, {
            observeAcceptedMessageOccurrences: () =>
              SubscriptionRef.changes(acceptedSnapshots),
            observeEffectPlacements: () =>
              SubscriptionRef.changes(placementSnapshots),
            observeEffectRequests: () =>
              SubscriptionRef.changes(requestSnapshots),
            observeMessageProposals: () =>
              SubscriptionRef.changes(proposalSnapshots),
          })
          yield* baseStore.appendProgramSession(session)
          const sequencer = yield* makeTestSequencer(store, session)
          const sequencerFiber = yield* Effect.forkChild(sequencer.run)

          const requestPendingSignal = makeSignalProposal(100)
          yield* SubscriptionRef.set(proposalSnapshots, [
            effectResultProposal,
            laterSameStreamProposal,
            requestPendingSignal,
          ])
          yield* waitForAccepted(requestPendingSignal.proposalId)

          const placementPendingSignal = makeSignalProposal(101)
          yield* SubscriptionRef.set(requestSnapshots, [effectRequest])
          yield* SubscriptionRef.set(proposalSnapshots, [
            effectResultProposal,
            laterSameStreamProposal,
            requestPendingSignal,
            placementPendingSignal,
          ])
          yield* waitForAccepted(placementPendingSignal.proposalId)

          const priorPlacement = InstantEffectPlacementRecord.make({
            ...effectPlacement,
            assignmentGeneration: 0,
            id: '33333333-3333-4333-8333-333333333333',
            positionKey: makeInstantEffectPlacementPositionKey(
              effectRequest.requestId,
              0,
              0,
            ),
          })
          const generationPendingSignal = makeSignalProposal(102)
          yield* SubscriptionRef.set(placementSnapshots, [priorPlacement])
          yield* SubscriptionRef.set(proposalSnapshots, [
            effectResultProposal,
            laterSameStreamProposal,
            requestPendingSignal,
            placementPendingSignal,
            generationPendingSignal,
          ])
          yield* waitForAccepted(generationPendingSignal.proposalId)

          yield* SubscriptionRef.set(placementSnapshots, [
            priorPlacement,
            effectPlacement,
          ])
          yield* waitForAccepted(effectResultProposal.proposalId)
          yield* waitForAccepted(laterSameStreamProposal.proposalId)
          yield* Fiber.interrupt(sequencerFiber)

          const accepted = Option.getOrThrow(
            yield* Stream.runHead(
              baseStore.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
            ),
          )
          const effectResultOccurrence = Option.getOrThrow(
            Array.findFirst(
              accepted,
              occurrence =>
                occurrence.proposalId === effectResultProposal.proposalId,
            ),
          )
          const laterOccurrence = Option.getOrThrow(
            Array.findFirst(
              accepted,
              occurrence =>
                occurrence.proposalId === laterSameStreamProposal.proposalId,
            ),
          )
          expect(effectResultOccurrence.acceptedSequence).toBeLessThan(
            laterOccurrence.acceptedSequence,
          )
          const resolutions = Option.getOrThrow(
            yield* Stream.runHead(
              baseStore.observeMessageProposalResolutions({
                sessionId,
                subjectId,
              }),
            ),
          )
          expect(
            Array.some(
              resolutions,
              resolution =>
                resolution.proposalId === effectResultProposal.proposalId,
            ),
          ).toBe(false)
        }),
      ),
  )

  it.effect('rejects every noncanonical accepted-row invariant', () =>
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore()
      const sequencer = yield* makeTestSequencer(store, session)
      const accepted = yield* sequencer.admit(
        makeProposal('proposal-valid-accepted-row', 1),
      )
      const cases = [
        {
          occurrence: InstantAcceptedMessageOccurrenceRecord.make({
            ...accepted,
            acceptedSequence: 0,
            positionKey: makeAcceptedOccurrencePositionKey(sessionId, 0),
          }),
          reason:
            InstantAcceptedMessageOccurrenceValidationIssue.make(
              'AcceptedSequence',
            ),
        },
        {
          occurrence: InstantAcceptedMessageOccurrenceRecord.make({
            ...accepted,
            id: 'different-row-id',
          }),
          reason:
            InstantAcceptedMessageOccurrenceValidationIssue.make(
              'OccurrenceIdentity',
            ),
        },
        {
          occurrence: InstantAcceptedMessageOccurrenceRecord.make({
            ...accepted,
            positionKey: 'wrong-position-key',
          }),
          reason:
            InstantAcceptedMessageOccurrenceValidationIssue.make('PositionKey'),
        },
        {
          occurrence: InstantAcceptedMessageOccurrenceRecord.make({
            ...accepted,
            effectRequestId: 'unexpected-effect-request',
          }),
          reason:
            InstantAcceptedMessageOccurrenceValidationIssue.make(
              'ProposalKind',
            ),
        },
        {
          occurrence: InstantAcceptedMessageOccurrenceRecord.make({
            ...accepted,
            effectAssignmentGeneration: 1,
            effectCancellationGeneration: 0,
            effectIdempotencyKey: 'effect-result-key',
            effectRequestId: 'effect-request-key',
            executorProcessorId: executorProcessorId,
            messageIdempotencyKey: 'ordinary-message-key',
            proposalKind: 'EffectResult',
          }),
          reason:
            InstantAcceptedMessageOccurrenceValidationIssue.make(
              'ProposalKind',
            ),
        },
      ]

      yield* Effect.forEach(
        cases,
        ({ occurrence, reason }) =>
          Effect.gen(function* () {
            const recovering = yield* makeTestSequencer(
              yield* makeInMemoryProgramStore(),
              session,
            )
            expect(
              yield* Effect.flip(
                recovering.recoverAcceptedOccurrences([occurrence]),
              ),
            ).toEqual(
              new AcceptanceAuthorityAcceptedOccurrenceInvalid({
                occurrenceId: occurrence.occurrenceId,
                reason,
              }),
            )
          }),
        { concurrency: 1, discard: true },
      )
    }),
  )

  it.effect(
    'fails historical recovery when accepted ordinary Messages reuse an idempotency key',
    () =>
      Effect.gen(function* () {
        const generator = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          session,
        )
        const messageIdempotencyKey = 'placement-request-history:1:0'
        const original = yield* generator.admit(
          InstantMessageProposalRecord.make({
            ...makeProposal('proposal-key-history-original', 1),
            messageIdempotencyKey,
          }),
        )
        const duplicate = InstantAcceptedMessageOccurrenceRecord.make({
          ...original,
          acceptedSequence: 2,
          actorSequence: 2,
          id: 'occurrence-key-history-duplicate',
          occurrenceId: 'occurrence-key-history-duplicate',
          positionKey: makeAcceptedOccurrencePositionKey(sessionId, 2),
          proposalId: 'proposal-key-history-duplicate',
        })
        const recovering = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          session,
        )

        expect(
          yield* Effect.flip(
            recovering.recoverAcceptedOccurrences([original, duplicate]),
          ),
        ).toEqual(
          new AcceptanceAuthorityIdentityConflict({
            identity: messageIdempotencyKey,
            identityKind: 'MessageIdempotencyKey',
          }),
        )
      }),
  )

  it.effect('durably rejects a proposal once across a sequencer restart', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        const rejectedProposal = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-rejected', 1),
          effectRequestId: 'effect-request-invalid-for-message',
        })
        const rejectionObserved = yield* Latch.make()
        const rejectionCount = yield* SubscriptionRef.make(0)
        yield* store.appendProgramSession(session)
        yield* store.appendMessageProposal(rejectedProposal)

        const sequencer = yield* makeAdmissionSequencer({
          ...programAdmission,
          acceptEnvelope: proposal => Effect.succeed(proposal.envelopeJson),
          now: () => 1_753_825_200_000,
          onProposalRejected: () =>
            SubscriptionRef.update(rejectionCount, count => count + 1).pipe(
              Effect.andThen(rejectionObserved.open),
            ),
          session,
          store,
        })
        const sequencerFiber = yield* Effect.forkChild(sequencer.run)
        yield* rejectionObserved.await
        yield* Fiber.interrupt(sequencerFiber)

        const maybeResolutions = yield* Stream.runHead(
          store.observeMessageProposalResolutions({ sessionId, subjectId }),
        )
        const resolutions = Option.getOrThrow(maybeResolutions)
        expect(resolutions).toEqual([
          {
            actorId: rejectedProposal.actorId,
            actorSequence: rejectedProposal.actorSequence,
            clientId: rejectedProposal.clientId,
            id: rejectedProposal.proposalId,
            programId: session.programId,
            programVersion: session.programVersion,
            protocolVersion: session.protocolVersion,
            proposalId: rejectedProposal.proposalId,
            rejectedAtMs: 1_753_825_200_000,
            rejectingProcessorId: session.authorityProcessorId,
            rejectionReason: 'ProposalKindMismatch',
            sessionId,
            subjectId,
          },
        ])
        expect(yield* SubscriptionRef.get(rejectionCount)).toBe(1)

        const acceptedProposal = makeProposal('proposal-accepted', 2)
        const restartedRejectionCount = yield* SubscriptionRef.make(0)
        const restarted = yield* makeAdmissionSequencer({
          ...programAdmission,
          acceptEnvelope: proposal => Effect.succeed(proposal.envelopeJson),
          now: () => 1_753_825_200_001,
          onProposalRejected: () =>
            SubscriptionRef.update(restartedRejectionCount, count => count + 1),
          session,
          store,
        })
        const restartedFiber = yield* Effect.forkChild(restarted.run)
        yield* store.appendMessageProposal(acceptedProposal)
        const maybeAccepted = yield* Stream.runHead(
          Stream.filter(
            store.observeAcceptedMessageOccurrences({ sessionId, subjectId }),
            occurrences =>
              Array.some(
                occurrences,
                occurrence =>
                  occurrence.proposalId === acceptedProposal.proposalId,
              ),
          ),
        )
        yield* Fiber.interrupt(restartedFiber)

        expect(Option.isSome(maybeAccepted)).toBe(true)
        expect(yield* SubscriptionRef.get(restartedRejectionCount)).toBe(0)
        expect(
          Option.getOrThrow(
            yield* Stream.runHead(
              store.observeMessageProposalResolutions({
                sessionId,
                subjectId,
              }),
            ),
          ),
        ).toEqual(resolutions)
      }),
    ),
  )

  it.effect(
    'admits a reordered higher actor nonce and terminally rejects the late lower nonce',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const acceptedEnvelopeCount = yield* SubscriptionRef.make(0)
          const higherNonceProposal = makeProposal('proposal-nonce-two', 2)
          const lateLowerNonceProposal = makeProposal('proposal-nonce-one', 1)
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposal(higherNonceProposal)
          const sequencer = yield* makeAdmissionSequencer({
            ...programAdmission,
            acceptEnvelope: proposal =>
              SubscriptionRef.update(
                acceptedEnvelopeCount,
                count => count + 1,
              ).pipe(Effect.as(proposal.envelopeJson)),
            now: () => 1_753_825_200_000,
            session,
            store,
          })
          const sequencerFiber = yield* Effect.forkChild(sequencer.run)

          yield* Stream.runHead(
            Stream.filter(
              store.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
              occurrences =>
                Array.some(
                  occurrences,
                  occurrence =>
                    occurrence.proposalId === higherNonceProposal.proposalId,
                ),
            ),
          )
          yield* store.appendMessageProposal(lateLowerNonceProposal)
          const resolutions = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                store.observeMessageProposalResolutions({
                  sessionId,
                  subjectId,
                }),
                candidates =>
                  Array.some(
                    candidates,
                    resolution =>
                      resolution.proposalId ===
                      lateLowerNonceProposal.proposalId,
                  ),
              ),
            ),
          )
          yield* Fiber.interrupt(sequencerFiber)

          const accepted = Option.getOrThrow(
            yield* Stream.runHead(
              store.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
            ),
          )
          expect(
            Array.map(accepted, occurrence => occurrence.proposalId),
          ).toEqual([higherNonceProposal.proposalId])
          expect(resolutions).toContainEqual(
            expect.objectContaining({
              proposalId: lateLowerNonceProposal.proposalId,
              rejectionReason: 'IdentityConflict',
            }),
          )
          expect(yield* SubscriptionRef.get(acceptedEnvelopeCount)).toBe(1)
        }),
      ),
  )

  it.effect(
    'does not consume a synchronized rejection nonce before a later valid proposal',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const rejectedHigherNonce = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-rejected-nonce-two', 2),
            effectRequestId: 'invalid-message-effect-request',
          })
          const lateLowerNonce = makeProposal(
            'proposal-after-rejected-nonce',
            1,
          )
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposal(rejectedHigherNonce)
          const sequencer = yield* makeTestSequencer(store, session)
          const sequencerFiber = yield* Effect.forkChild(sequencer.run)

          yield* Stream.runHead(
            Stream.filter(
              store.observeMessageProposalResolutions({
                sessionId,
                subjectId,
              }),
              resolutions =>
                Array.some(
                  resolutions,
                  resolution =>
                    resolution.proposalId === rejectedHigherNonce.proposalId,
                ),
            ),
          )
          yield* store.appendMessageProposal(lateLowerNonce)
          const accepted = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                store.observeAcceptedMessageOccurrences({
                  sessionId,
                  subjectId,
                }),
                candidates =>
                  Array.some(
                    candidates,
                    occurrence =>
                      occurrence.proposalId === lateLowerNonce.proposalId,
                  ),
              ),
            ),
          )
          yield* Fiber.interrupt(sequencerFiber)

          expect(accepted).toContainEqual(
            expect.objectContaining({
              proposalId: lateLowerNonce.proposalId,
              actorSequence: lateLowerNonce.actorSequence,
            }),
          )
          expect(
            Option.getOrThrow(
              yield* Stream.runHead(
                store.observeMessageProposalResolutions({
                  sessionId,
                  subjectId,
                }),
              ),
            ),
          ).toContainEqual(
            expect.objectContaining({
              proposalId: rejectedHigherNonce.proposalId,
              rejectionReason: 'ProposalKindMismatch',
            }),
          )
        }),
      ),
  )

  it.effect('strictly appends one immutable resolution per proposal', () =>
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore()
      const proposal = makeProposal('proposal-strict', 1)
      const rejection = new AcceptanceAuthorityProposalKindMismatch({
        proposalId: proposal.proposalId,
      })
      const resolution = makeMessageProposalRejectionResolution({
        proposal,
        rejectedAtMs: 1_753_825_200_000,
        rejection,
        session,
      })

      yield* store.appendMessageProposalResolution(resolution)
      yield* store.appendMessageProposalResolution(resolution)
      const changedResolution = InstantMessageProposalResolutionRecord.make({
        ...resolution,
        rejectionReason: 'EnvelopeInvalid',
      })
      expect(
        yield* Effect.flip(
          store.appendMessageProposalResolution(changedResolution),
        ),
      ).toBeInstanceOf(ProgramStoreError)
    }),
  )

  it.effect(
    'fails closed when an accepted terminal is followed by a rejection terminal',
    () =>
      Effect.gen(function* () {
        const proposal = makeProposal('proposal-terminal-accepted-first', 1)
        const generator = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          session,
        )
        const accepted = yield* generator.admit(proposal)
        const store = yield* makeInMemoryProgramStore()
        yield* store.appendProgramSession(session)
        yield* store.appendMessageProposal(proposal)
        yield* store.appendAcceptedMessageOccurrence(accepted)
        yield* store.appendMessageProposalResolution(makeResolution(proposal))

        expect(
          yield* Effect.flip((yield* makeTestSequencer(store, session)).run),
        ).toEqual(
          new AdmissionSequencerTerminalConflict({
            proposalId: proposal.proposalId,
          }),
        )
      }),
  )

  it.effect(
    'fails closed when a rejection terminal is followed by an accepted terminal',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const proposal = makeProposal('proposal-terminal-rejected-first', 1)
          const generator = yield* makeTestSequencer(
            yield* makeInMemoryProgramStore(),
            session,
          )
          const accepted = yield* generator.admit(proposal)
          const signalProposal = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-terminal-rejected-first-signal', 1),
            actorId: 'actor-terminal-signal',
            clientId: 'client-terminal-signal',
            effectRequestId: 'invalid-effect-field',
          })
          const resolutionProcessed = yield* Latch.make()
          const store = yield* makeInMemoryProgramStore()
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposal(proposal)
          yield* store.appendMessageProposal(signalProposal)
          yield* store.appendMessageProposalResolution(makeResolution(proposal))
          const sequencer = yield* makeAdmissionSequencer({
            ...programAdmission,
            acceptEnvelope: candidate => Effect.succeed(candidate.envelopeJson),
            now: () => 1_753_825_200_001,
            onProposalRejected: rejected =>
              rejected.proposalId === signalProposal.proposalId
                ? resolutionProcessed.open
                : Effect.void,
            session,
            store,
          })
          const failureFiber = yield* Effect.forkChild(
            Effect.flip(sequencer.run),
          )
          yield* resolutionProcessed.await
          yield* store.appendAcceptedMessageOccurrence(accepted)

          expect(yield* Fiber.join(failureFiber)).toEqual(
            new AdmissionSequencerTerminalConflict({
              proposalId: proposal.proposalId,
            }),
          )
        }),
      ),
  )

  it.effect(
    'detects contradictory terminal evidence again after a sequencer restart',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const proposal = makeProposal('proposal-terminal-restart', 1)
          const generator = yield* makeTestSequencer(
            yield* makeInMemoryProgramStore(),
            session,
          )
          const accepted = yield* generator.admit(proposal)
          const signalProposal = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-terminal-restart-signal', 1),
            actorId: 'actor-terminal-restart-signal',
            clientId: 'client-terminal-restart-signal',
            effectRequestId: 'invalid-effect-field',
          })
          const resolutionProcessed = yield* Latch.make()
          const store = yield* makeInMemoryProgramStore()
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposal(proposal)
          yield* store.appendMessageProposal(signalProposal)
          yield* store.appendMessageProposalResolution(makeResolution(proposal))
          const first = yield* makeAdmissionSequencer({
            ...programAdmission,
            acceptEnvelope: candidate => Effect.succeed(candidate.envelopeJson),
            now: () => 1_753_825_200_001,
            onProposalRejected: rejected =>
              rejected.proposalId === signalProposal.proposalId
                ? resolutionProcessed.open
                : Effect.void,
            session,
            store,
          })
          const firstFiber = yield* Effect.forkChild(first.run)
          yield* resolutionProcessed.await
          yield* Fiber.interrupt(firstFiber)
          yield* store.appendAcceptedMessageOccurrence(accepted)

          expect(
            yield* Effect.flip((yield* makeTestSequencer(store, session)).run),
          ).toEqual(
            new AdmissionSequencerTerminalConflict({
              proposalId: proposal.proposalId,
            }),
          )
        }),
      ),
  )

  it.effect(
    'rejects terminal resolutions from a Processor other than the designated sequencer',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const proposal = makeProposal('proposal-wrong-sequencer', 1)
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposalResolution(
            InstantMessageProposalResolutionRecord.make({
              actorId: proposal.actorId,
              actorSequence: proposal.actorSequence,
              clientId: proposal.clientId,
              id: proposal.proposalId,
              programId: session.programId,
              programVersion: session.programVersion,
              protocolVersion: session.protocolVersion,
              proposalId: proposal.proposalId,
              rejectedAtMs: 1_753_825_200_000,
              rejectingProcessorId: 'processor-not-the-sequencer',
              rejectionReason: 'EnvelopeInvalid',
              sessionId,
              subjectId,
            }),
          )
          const sequencer = yield* makeAdmissionSequencer({
            ...programAdmission,
            acceptEnvelope: candidate => Effect.succeed(candidate.envelopeJson),
            now: () => 1_753_825_200_001,
            session,
            store,
          })

          const failure = yield* Effect.flip(sequencer.run)

          expect(failure).toEqual(
            new AdmissionSequencerResolutionProcessorMismatch({
              actualProcessorId: 'processor-not-the-sequencer',
              expectedProcessorId: session.authorityProcessorId,
              proposalId: proposal.proposalId,
            }),
          )
        }),
      ),
  )

  it.effect(
    'does not reconstruct forged alias high water from a durable resolution after restart',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const messageIdempotencyKey = 'restart-forged-alias:1:0'
          const original = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-restart-alias-original', 1),
            messageIdempotencyKey,
          })
          const forgedAlias = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-restart-forged-alias', 999),
            messageIdempotencyKey,
            originDeviceId: 'device-attacker',
            originatingProcessorId: 'processor-attacker',
          })
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposal(original)
          yield* store.appendMessageProposal(forgedAlias)
          const firstSequencer = yield* makeTestSequencer(store, session)
          const firstFiber = yield* Effect.forkChild(firstSequencer.run)
          const firstResolutions = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                store.observeMessageProposalResolutions({
                  sessionId,
                  subjectId,
                }),
                resolutions =>
                  Array.some(
                    resolutions,
                    resolution =>
                      resolution.proposalId === forgedAlias.proposalId,
                  ),
              ),
            ),
          )
          const firstOccurrences = Option.getOrThrow(
            yield* Stream.runHead(
              store.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
            ),
          )
          const originalOccurrence = Option.getOrThrow(
            Array.findFirst(
              firstOccurrences,
              occurrence => occurrence.proposalId === original.proposalId,
            ),
          )
          const durableResolution = Option.getOrThrow(
            Array.findFirst(
              firstResolutions,
              resolution => resolution.proposalId === forgedAlias.proposalId,
            ),
          )
          yield* Fiber.interrupt(firstFiber)

          const restartedStore = yield* makeInMemoryProgramStore()
          yield* restartedStore.appendProgramSession(session)
          yield* restartedStore.appendMessageProposal(original)
          yield* restartedStore.appendMessageProposal(forgedAlias)
          yield* restartedStore.appendAcceptedMessageOccurrence(
            originalOccurrence,
          )
          yield* restartedStore.appendMessageProposalResolution(
            durableResolution,
          )
          const legitimateSecond = makeProposal(
            'proposal-restart-legitimate-two',
            2,
          )
          yield* restartedStore.appendMessageProposal(legitimateSecond)
          const restartedSequencer = yield* makeTestSequencer(
            restartedStore,
            session,
          )
          const restartedFiber = yield* Effect.forkChild(restartedSequencer.run)
          const accepted = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                restartedStore.observeAcceptedMessageOccurrences({
                  sessionId,
                  subjectId,
                }),
                candidates =>
                  Array.some(
                    candidates,
                    occurrence =>
                      occurrence.proposalId === legitimateSecond.proposalId,
                  ),
              ),
            ),
          )
          yield* Fiber.interrupt(restartedFiber)

          expect(
            Array.map(accepted, occurrence => occurrence.proposalId),
          ).toEqual([original.proposalId, legitimateSecond.proposalId])
        }),
      ),
  )

  it.effect(
    'does not recover rejected actor high water when proposal and resolution snapshots regress',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const resolvedHigherNonce = makeProposal(
            'proposal-restart-snapshot-nonce-two',
            2,
          )
          const durableResolution = makeMessageProposalRejectionResolution({
            proposal: resolvedHigherNonce,
            rejectedAtMs: 1_753_825_200_000,
            rejection: new AcceptanceAuthorityProposalKindMismatch({
              proposalId: resolvedHigherNonce.proposalId,
            }),
            session,
          })
          const synchronizationSignal = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-restart-snapshot-signal', 1),
            actorId: 'actor-restart-snapshot-signal',
            clientId: 'client-restart-snapshot-signal',
            originDeviceId: 'device-restart-snapshot-signal',
            originatingProcessorId: 'processor-restart-snapshot-signal',
          })
          const proposals = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalRecord>
          >([resolvedHigherNonce, synchronizationSignal])
          const resolutions = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalResolutionRecord>
          >([durableResolution])
          const store = withServerConfirmedObservations(baseStore, {
            observeMessageProposalResolutions: () =>
              SubscriptionRef.changes(resolutions),
            observeMessageProposals: () => SubscriptionRef.changes(proposals),
          })
          yield* baseStore.appendProgramSession(session)
          const restartedSequencer = yield* makeTestSequencer(store, session)
          const sequencerFiber = yield* Effect.forkChild(restartedSequencer.run)
          yield* Stream.runHead(
            Stream.filter(
              baseStore.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
              occurrences =>
                Array.some(
                  occurrences,
                  occurrence =>
                    occurrence.proposalId === synchronizationSignal.proposalId,
                ),
            ),
          )

          yield* SubscriptionRef.set(resolutions, [])
          yield* SubscriptionRef.set(proposals, [
            resolvedHigherNonce,
            synchronizationSignal,
          ])
          const lateLowerNonce = makeProposal(
            'proposal-restart-snapshot-nonce-one',
            1,
          )
          yield* SubscriptionRef.set(proposals, [
            resolvedHigherNonce,
            synchronizationSignal,
            lateLowerNonce,
          ])
          const accepted = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                baseStore.observeAcceptedMessageOccurrences({
                  sessionId,
                  subjectId,
                }),
                candidates =>
                  Array.some(
                    candidates,
                    occurrence =>
                      occurrence.proposalId === lateLowerNonce.proposalId,
                  ),
              ),
            ),
          )
          yield* Fiber.interrupt(sequencerFiber)

          expect(accepted).toContainEqual(
            expect.objectContaining({
              proposalId: lateLowerNonce.proposalId,
              actorSequence: lateLowerNonce.actorSequence,
            }),
          )
        }),
      ),
  )

  it.effect(
    'does not rewrite a synchronized rejection while its query snapshot is stale',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const rejectedProposal = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-stale-resolution', 1),
            effectRequestId: 'effect-request-invalid-for-message',
          })
          const acceptedProposal = makeProposal('proposal-after-rejection', 2)
          const rejectionObserved = yield* Latch.make()
          const resolutionAppendCount = yield* SubscriptionRef.make(0)
          const store = withServerConfirmedObservations(
            {
              ...baseStore,
              appendServerConfirmedMessageProposalResolution: resolution =>
                SubscriptionRef.update(
                  resolutionAppendCount,
                  count => count + 1,
                ).pipe(
                  Effect.andThen(
                    baseStore.appendServerConfirmedMessageProposalResolution(
                      resolution,
                    ),
                  ),
                ),
            },
            {
              observeMessageProposalResolutions: () =>
                Stream.succeed<
                  ReadonlyArray<InstantMessageProposalResolutionRecord>
                >([]).pipe(Stream.concat(Stream.never)),
              observeMessageProposals: () =>
                Stream.succeed<ReadonlyArray<InstantMessageProposalRecord>>([
                  rejectedProposal,
                ]).pipe(
                  Stream.concat(
                    Stream.fromEffect(
                      rejectionObserved.await.pipe(
                        Effect.as([rejectedProposal, acceptedProposal]),
                      ),
                    ),
                  ),
                  Stream.concat(Stream.never),
                ),
            },
          )
          yield* baseStore.appendProgramSession(session)
          const sequencer = yield* makeAdmissionSequencer({
            ...programAdmission,
            acceptEnvelope: proposal => Effect.succeed(proposal.envelopeJson),
            now: () => 1_753_825_200_000,
            onProposalRejected: () => rejectionObserved.open,
            session,
            store,
          })
          const sequencerFiber = yield* Effect.forkChild(sequencer.run)

          const maybeAccepted = yield* Stream.runHead(
            Stream.filter(
              baseStore.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
              occurrences =>
                Array.some(
                  occurrences,
                  occurrence =>
                    occurrence.proposalId === acceptedProposal.proposalId,
                ),
            ),
          )
          yield* Fiber.interrupt(sequencerFiber)

          expect(Option.isSome(maybeAccepted)).toBe(true)
          expect(yield* SubscriptionRef.get(resolutionAppendCount)).toBe(1)
        }),
      ),
  )

  it.effect(
    'keeps a compact resolution tombstone after acknowledgment and later snapshot regression',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const rejectedHigherNonce = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-acknowledged-nonce-two', 2),
            effectRequestId: 'effect-request-invalid-for-message',
          })
          const proposals = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalRecord>
          >([rejectedHigherNonce])
          const resolutions = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalResolutionRecord>
          >([])
          const resolutionAppendCount = yield* SubscriptionRef.make(0)
          const store = withServerConfirmedObservations(
            {
              ...baseStore,
              appendServerConfirmedMessageProposalResolution: resolution =>
                SubscriptionRef.update(
                  resolutionAppendCount,
                  count => count + 1,
                ).pipe(
                  Effect.andThen(
                    baseStore.appendServerConfirmedMessageProposalResolution(
                      resolution,
                    ),
                  ),
                ),
            },
            {
              observeMessageProposalResolutions: () =>
                SubscriptionRef.changes(resolutions),
              observeMessageProposals: () => SubscriptionRef.changes(proposals),
            },
          )
          yield* baseStore.appendProgramSession(session)
          const sequencer = yield* makeTestSequencer(store, session)
          const sequencerFiber = yield* Effect.forkChild(sequencer.run)
          const durableResolution = Array.findFirst(
            Option.getOrThrow(
              yield* Stream.runHead(
                Stream.filter(
                  baseStore.observeMessageProposalResolutions({
                    sessionId,
                    subjectId,
                  }),
                  candidates =>
                    Array.some(
                      candidates,
                      resolution =>
                        resolution.proposalId ===
                        rejectedHigherNonce.proposalId,
                    ),
                ),
              ),
            ),
            resolution =>
              resolution.proposalId === rejectedHigherNonce.proposalId,
          )
          const synchronizationSignal = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-acknowledgment-signal', 1),
            actorId: 'actor-acknowledgment-signal',
            clientId: 'client-acknowledgment-signal',
            originDeviceId: 'device-acknowledgment-signal',
            originatingProcessorId: 'processor-acknowledgment-signal',
          })
          yield* SubscriptionRef.set(resolutions, [
            Option.getOrThrow(durableResolution),
          ])
          yield* SubscriptionRef.set(proposals, [
            rejectedHigherNonce,
            synchronizationSignal,
          ])
          yield* Stream.runHead(
            Stream.filter(
              baseStore.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
              occurrences =>
                Array.some(
                  occurrences,
                  occurrence =>
                    occurrence.proposalId === synchronizationSignal.proposalId,
                ),
            ),
          )

          yield* SubscriptionRef.set(resolutions, [])
          const lateLowerNonce = makeProposal(
            'proposal-after-acknowledged-nonce-one',
            1,
          )
          yield* SubscriptionRef.set(proposals, [
            rejectedHigherNonce,
            synchronizationSignal,
            lateLowerNonce,
          ])
          const accepted = Option.getOrThrow(
            yield* Stream.runHead(
              Stream.filter(
                baseStore.observeAcceptedMessageOccurrences({
                  sessionId,
                  subjectId,
                }),
                candidates =>
                  Array.some(
                    candidates,
                    occurrence =>
                      occurrence.proposalId === lateLowerNonce.proposalId,
                  ),
              ),
            ),
          )
          yield* Fiber.interrupt(sequencerFiber)

          expect(yield* SubscriptionRef.get(resolutionAppendCount)).toBe(1)
          expect(accepted).toContainEqual(
            expect.objectContaining({
              proposalId: lateLowerNonce.proposalId,
              actorSequence: lateLowerNonce.actorSequence,
            }),
          )
        }),
      ),
  )

  it.effect(
    'reports no rejection after a server-confirmed resolution failure',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const store: ProgramStoreService = {
            ...baseStore,
            appendServerConfirmedMessageProposalResolution: () =>
              Effect.fail(
                new ProgramStoreError({
                  cause: new Error('Resolution write failed.'),
                  operation: 'AppendMessageProposalResolution',
                }),
              ),
          }
          const rejectedProposal = InstantMessageProposalRecord.make({
            ...makeProposal('proposal-enqueued-resolution', 1),
            effectRequestId: 'effect-request-invalid-for-message',
          })
          const rejectionCount = yield* SubscriptionRef.make(0)
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposal(rejectedProposal)
          const sequencer = yield* makeAdmissionSequencer({
            ...programAdmission,
            acceptEnvelope: proposal => Effect.succeed(proposal.envelopeJson),
            now: () => 1_753_825_200_000,
            onProposalRejected: () =>
              SubscriptionRef.update(rejectionCount, count => count + 1),
            session,
            store,
          })
          const failure = yield* Effect.flip(sequencer.run)

          expect(failure).toBeInstanceOf(ProgramStoreError)
          expect(yield* SubscriptionRef.get(rejectionCount)).toBe(0)
        }),
      ),
  )
})

describe('admission sequencer protocol v2 routing', () => {
  it.effect('durably rejects a forged Audience claim', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const sessionPolicy = Synchronization.SessionPolicy.make({
          generation: 3,
          mode: Synchronization.SharedDomain.make({}),
        })
        const configuredSession = InstantProgramSessionRecord.make({
          ...session,
          sessionPolicy,
        })
        const proposal = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-forged-audience', 1),
          policyGeneration: sessionPolicy.generation,
          proposedAudience: Synchronization.ProcessorAudience.make({
            processorIds: ['processor-browser'],
          }),
        })
        const store = yield* makeInMemoryProgramStore()
        yield* store.appendProgramSession(configuredSession)
        yield* store.appendMessageProposal(proposal)
        const sequencer = yield* makeTestSequencer(store, configuredSession)
        const sequencerFiber = yield* Effect.forkChild(sequencer.run)

        const maybeResolutions = yield* Stream.runHead(
          Stream.filter(
            store.observeMessageProposalResolutions({ sessionId, subjectId }),
            resolutions =>
              Array.some(
                resolutions,
                resolution => resolution.proposalId === proposal.proposalId,
              ),
          ),
        )
        yield* Fiber.interrupt(sequencerFiber)

        expect(Option.getOrThrow(maybeResolutions)).toContainEqual(
          expect.objectContaining({
            proposalId: proposal.proposalId,
            rejectionReason: 'SynchronizationPolicyMismatch',
          }),
        )
      }),
    ),
  )

  it.effect('durably rejects navigation from an observe-only follower', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const sessionPolicy = makeFollowPolicy('Observe', 4)
        const configuredSession = InstantProgramSessionRecord.make({
          ...session,
          sessionPolicy,
        })
        const proposal = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-observe-only-navigation', 1),
          messageCategory: 'Navigation',
          originatingProcessorId: followerProcessorId,
          payloadJson: S.encodeSync(MessageJson)(
            SelectedCounter.make({ counterId: 'counter-002' }),
          ),
          policyGeneration: sessionPolicy.generation,
          proposedAudience: Synchronization.ProcessorAudience.make({
            processorIds: [followerProcessorId],
          }),
        })
        const store = yield* makeInMemoryProgramStore()
        yield* store.appendProgramSession(configuredSession)
        yield* store.appendMessageProposal(proposal)
        const sequencer = yield* makeTestSequencer(store, configuredSession)
        const sequencerFiber = yield* Effect.forkChild(sequencer.run)

        const maybeResolutions = yield* Stream.runHead(
          Stream.filter(
            store.observeMessageProposalResolutions({ sessionId, subjectId }),
            resolutions =>
              Array.some(
                resolutions,
                resolution => resolution.proposalId === proposal.proposalId,
              ),
          ),
        )
        yield* Fiber.interrupt(sequencerFiber)

        expect(Option.getOrThrow(maybeResolutions)).toContainEqual(
          expect.objectContaining({
            proposalId: proposal.proposalId,
            rejectionReason: 'SynchronizationPolicyMismatch',
          }),
        )
      }),
    ),
  )

  it.effect(
    'accepts remote-control navigation with the canonical audience',
    () =>
      Effect.gen(function* () {
        const sessionPolicy = makeFollowPolicy('RemoteControl', 5)
        const configuredSession = InstantProgramSessionRecord.make({
          ...session,
          sessionPolicy,
        })
        const proposal = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-remote-control-navigation', 1),
          messageCategory: 'Navigation',
          originatingProcessorId: followerProcessorId,
          payloadJson: S.encodeSync(MessageJson)(
            SelectedCounter.make({ counterId: 'counter-002' }),
          ),
          policyGeneration: sessionPolicy.generation,
          proposedAudience: followedAudience,
        })
        const store = yield* makeInMemoryProgramStore()
        const sequencer = yield* makeTestSequencer(store, configuredSession)

        const accepted = yield* sequencer.admit(proposal)

        expect(accepted.audience).toEqual(followedAudience)
        expect(accepted.messageCategory).toBe('Navigation')
        expect(accepted.policyGeneration).toBe(sessionPolicy.generation)
        expect(accepted.sessionPolicy).toEqual(sessionPolicy)
      }),
  )

  it.effect(
    'recovers frozen Follow routing after the session policy advances',
    () =>
      Effect.gen(function* () {
        const priorPolicy = makeFollowPolicy('RemoteControl', 7)
        const currentFollowerProcessorId = 'processor-current-follower'
        const currentPolicy = Synchronization.SessionPolicy.make({
          generation: 8,
          mode: Synchronization.Follow.make({
            followers: [
              Synchronization.Follower.make({
                control: 'Observe',
                processorId: currentFollowerProcessorId,
              }),
            ],
            leaderProcessorId,
          }),
        })
        const priorSession = InstantProgramSessionRecord.make({
          ...session,
          sessionPolicy: priorPolicy,
        })
        const currentSession = InstantProgramSessionRecord.make({
          ...session,
          sessionPolicy: currentPolicy,
        })
        const store = yield* makeInMemoryProgramStore()
        const priorSequencer = yield* makeTestSequencer(store, priorSession)
        const priorProposal = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-prior-follow-navigation', 1),
          messageCategory: 'Navigation',
          originatingProcessorId: leaderProcessorId,
          payloadJson: S.encodeSync(MessageJson)(
            SelectedCounter.make({ counterId: 'counter-prior' }),
          ),
          policyGeneration: priorPolicy.generation,
          proposedAudience: followedAudience,
        })
        const priorOccurrence = yield* priorSequencer.admit(priorProposal)
        const currentSequencer = yield* makeTestSequencer(store, currentSession)

        yield* currentSequencer.recoverAcceptedOccurrences([priorOccurrence])

        const currentAudience = Synchronization.ProcessorAudience.make({
          processorIds: [currentFollowerProcessorId, leaderProcessorId],
        })
        const currentProposal = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-current-follow-navigation', 2),
          messageCategory: 'Navigation',
          originatingProcessorId: leaderProcessorId,
          payloadJson: S.encodeSync(MessageJson)(
            SelectedCounter.make({ counterId: 'counter-current' }),
          ),
          policyGeneration: currentPolicy.generation,
          proposedAudience: currentAudience,
        })
        const currentOccurrence = yield* currentSequencer.admit(currentProposal)

        expect(priorOccurrence.acceptedSequence).toBe(1)
        expect(priorOccurrence.audience).toEqual(followedAudience)
        expect(priorOccurrence.sessionPolicy).toEqual(priorPolicy)
        expect(currentOccurrence.acceptedSequence).toBe(2)
        expect(currentOccurrence.audience).toEqual(currentAudience)
        expect(currentOccurrence.sessionPolicy).toEqual(currentPolicy)

        const downgradedPolicy = makeFollowPolicy('RemoteControl', 6)
        const downgradedSession = InstantProgramSessionRecord.make({
          ...session,
          sessionPolicy: downgradedPolicy,
        })
        const downgradedSequencer = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          downgradedSession,
        )
        expect(
          yield* Effect.flip(
            downgradedSequencer.recoverAcceptedOccurrences([priorOccurrence]),
          ),
        ).toEqual(
          new AcceptanceAuthoritySynchronizationPolicyMismatch({
            proposalId: priorOccurrence.proposalId,
            reason: 'PolicyGenerationClaim',
          }),
        )

        const reusedGenerationPolicy = Synchronization.SessionPolicy.make({
          generation: priorPolicy.generation,
          mode: Synchronization.SharedDomain.make({}),
        })
        const reusedGenerationSession = InstantProgramSessionRecord.make({
          ...session,
          sessionPolicy: reusedGenerationPolicy,
        })
        const reusedGenerationSequencer = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          reusedGenerationSession,
        )
        expect(
          yield* Effect.flip(
            reusedGenerationSequencer.recoverAcceptedOccurrences([
              priorOccurrence,
            ]),
          ),
        ).toEqual(
          new AcceptanceAuthoritySynchronizationPolicyMismatch({
            proposalId: priorOccurrence.proposalId,
            reason: 'SessionPolicyClaim',
          }),
        )
      }),
  )

  it.effect(
    'fences decreasing, future, and noncanonical accepted policy history',
    () =>
      Effect.gen(function* () {
        const currentPolicy = Synchronization.SessionPolicy.make({
          generation: 2,
          mode: Synchronization.SharedDomain.make({}),
        })
        const configuredSession = InstantProgramSessionRecord.make({
          ...session,
          sessionPolicy: currentPolicy,
        })
        const admitting = yield* makeTestSequencer(
          yield* makeInMemoryProgramStore(),
          configuredSession,
        )
        const currentOccurrence = yield* admitting.admit(
          InstantMessageProposalRecord.make({
            ...makeProposal('proposal-policy-history-seed', 1),
            policyGeneration: currentPolicy.generation,
          }),
        )
        const priorPolicy = Synchronization.SessionPolicy.make({
          generation: 1,
          mode: Synchronization.Mirror.make({}),
        })
        const priorOccurrence = InstantAcceptedMessageOccurrenceRecord.make({
          ...currentOccurrence,
          policyGeneration: priorPolicy.generation,
          sessionPolicy: priorPolicy,
        })
        const decreasedOccurrence = InstantAcceptedMessageOccurrenceRecord.make(
          {
            ...priorOccurrence,
            acceptedSequence: 2,
            actorSequence: 2,
            id: 'occurrence-policy-decreased',
            occurrenceId: 'occurrence-policy-decreased',
            positionKey: makeAcceptedOccurrencePositionKey(sessionId, 2),
            proposalId: 'proposal-policy-decreased',
          },
        )
        const futurePolicy = Synchronization.SessionPolicy.make({
          generation: 3,
          mode: Synchronization.Mirror.make({}),
        })
        const futureOccurrence = InstantAcceptedMessageOccurrenceRecord.make({
          ...currentOccurrence,
          policyGeneration: futurePolicy.generation,
          sessionPolicy: futurePolicy,
        })
        const noncanonicalOccurrence =
          InstantAcceptedMessageOccurrenceRecord.make({
            ...decreasedOccurrence,
            sessionPolicy: Synchronization.SessionPolicy.make({
              generation: priorPolicy.generation,
              mode: Synchronization.SharedDomain.make({}),
            }),
          })

        const recoverFailure = (
          occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
        ) =>
          Effect.gen(function* () {
            const recovering = yield* makeTestSequencer(
              yield* makeInMemoryProgramStore(),
              configuredSession,
            )
            return yield* Effect.flip(
              recovering.recoverAcceptedOccurrences(occurrences),
            )
          })

        expect(
          yield* recoverFailure([currentOccurrence, decreasedOccurrence]),
        ).toEqual(
          new AcceptanceAuthoritySynchronizationPolicyMismatch({
            proposalId: decreasedOccurrence.proposalId,
            reason: 'PolicyGenerationClaim',
          }),
        )
        expect(yield* recoverFailure([futureOccurrence])).toEqual(
          new AcceptanceAuthoritySynchronizationPolicyMismatch({
            proposalId: futureOccurrence.proposalId,
            reason: 'PolicyGenerationClaim',
          }),
        )
        expect(
          yield* recoverFailure([priorOccurrence, noncanonicalOccurrence]),
        ).toEqual(
          new AcceptanceAuthoritySynchronizationPolicyMismatch({
            proposalId: noncanonicalOccurrence.proposalId,
            reason: 'SessionPolicyClaim',
          }),
        )
      }),
  )

  it.effect('inherits effect-result routing from the causal occurrence', () =>
    Effect.gen(function* () {
      const sessionPolicy = makeFollowPolicy('RemoteControl', 6)
      const configuredSession = InstantProgramSessionRecord.make({
        ...session,
        sessionPolicy,
      })
      const store = yield* makeInMemoryProgramStore()
      const sequencer = yield* makeTestSequencer(store, configuredSession)
      const causalProposal = InstantMessageProposalRecord.make({
        ...makeProposal('proposal-causal-navigation', 1),
        messageCategory: 'Navigation',
        originatingProcessorId: leaderProcessorId,
        payloadJson: S.encodeSync(MessageJson)(
          SelectedCounter.make({ counterId: 'counter-003' }),
        ),
        policyGeneration: sessionPolicy.generation,
        proposedAudience: followedAudience,
      })
      const causalOccurrence = yield* sequencer.admit(causalProposal)
      const capability = Processor.CapabilityRequirement.make({
        id: ['Device', 'Persist'],
        minimumVersion: 1,
      })
      const effectRequest = InstantEffectRequestRecord.make({
        causalAudience: causalOccurrence.audience,
        causalMessageCategory: causalOccurrence.messageCategory,
        causalOccurrenceId: causalOccurrence.occurrenceId,
        causalPolicyGeneration: causalOccurrence.policyGeneration,
        effectId: 'persist-counter',
        effectVersion: 1,
        id: 'effect-request-routing',
        idempotencyKey: 'effect-routing-idempotency',
        minimumCapabilityVersion: capability.minimumVersion,
        originatingProcessorId: leaderProcessorId,
        placement: Processor.Placement.make({
          affinity: Processor.AnyProcessor.make({}),
          capability,
          cardinality: 'One',
          unavailable: 'Wait',
          version: 1,
        }),
        programId: configuredSession.programId,
        programVersion: configuredSession.programVersion,
        protocolVersion: configuredSession.protocolVersion,
        publicArguments: {},
        permittedResultEvents: [
          Command.ResultEventRange.make({
            eventId: 'counter.effect-completed',
            maximumVersion: 1,
            minimumVersion: 1,
          }),
        ],
        requestId: 'effect-request-routing',
        requestedAtMs: 1_753_825_300_000,
        requiredCapabilityIdJson: makeInstantCapabilityIdIndex(capability.id),
        sessionId,
        subjectId,
      })
      const placement = InstantEffectPlacementRecord.make({
        assignedProcessorId: executorProcessorId,
        assignmentGeneration: 1,
        cancellationGeneration: 0,
        decidedAtMs: 1_753_825_300_001,
        id: '55555555-5555-4555-8555-555555555555',
        placementDecision: Processor.AssignedPreferred.make({
          processorId: executorProcessorId,
        }),
        placementStatus: 'AssignedPreferred',
        positionKey: makeInstantEffectPlacementPositionKey(
          effectRequest.requestId,
          1,
          0,
        ),
        programId: configuredSession.programId,
        programVersion: configuredSession.programVersion,
        protocolVersion: configuredSession.protocolVersion,
        requestId: effectRequest.requestId,
        sessionId,
        subjectId,
      })
      yield* sequencer.recoverEffectRequests([effectRequest])
      yield* sequencer.recoverEffectPlacements([placement])
      const effectProposal = InstantMessageProposalRecord.make({
        ...makeProposal('proposal-effect-result-routing', 2),
        causationOccurrenceId: causalOccurrence.occurrenceId,
        effectAssignmentGeneration: placement.assignmentGeneration,
        effectCancellationGeneration: placement.cancellationGeneration,
        effectIdempotencyKey: effectRequest.idempotencyKey,
        effectRequestId: effectRequest.requestId,
        eventId: 'counter.effect-completed',
        executorProcessorId,
        messageCategory: causalOccurrence.messageCategory,
        originatingProcessorId: executorProcessorId,
        payloadJson: S.encodeSync(MessageJson)(CompletedEffect.make({})),
        policyGeneration: causalOccurrence.policyGeneration,
        proposalKind: 'EffectResult',
        proposedAudience: causalOccurrence.audience,
      })

      const accepted = yield* sequencer.admit(effectProposal)

      expect(accepted.audience).toEqual(causalOccurrence.audience)
      expect(accepted.messageCategory).toBe(causalOccurrence.messageCategory)
      expect(accepted.policyGeneration).toBe(causalOccurrence.policyGeneration)
      expect(accepted.sessionPolicy).toEqual(causalOccurrence.sessionPolicy)
      expect(accepted.originatingProcessorId).toBe(executorProcessorId)

      const duplicateAcceptedEffectResult =
        InstantAcceptedMessageOccurrenceRecord.make({
          ...accepted,
          acceptedSequence: 3,
          actorSequence: 3,
          id: 'occurrence-duplicate-effect-result',
          occurrenceId: 'occurrence-duplicate-effect-result',
          positionKey: makeAcceptedOccurrencePositionKey(sessionId, 3),
          proposalId: 'proposal-duplicate-effect-result',
        })
      const duplicateRecoverySequencer = yield* makeTestSequencer(
        yield* makeInMemoryProgramStore(),
        configuredSession,
      )
      expect(
        yield* Effect.flip(
          duplicateRecoverySequencer.recoverAcceptedOccurrences([
            causalOccurrence,
            accepted,
            duplicateAcceptedEffectResult,
          ]),
        ),
      ).toEqual(
        new AcceptanceAuthorityIdentityConflict({
          identity: effectRequest.idempotencyKey,
          identityKind: 'EffectIdempotencyKey',
        }),
      )

      const recoveryStore = yield* makeInMemoryProgramStore()
      const recoveringSequencer = yield* makeAdmissionSequencer({
        ...programAdmission,
        acceptEnvelope: proposal => Effect.succeed(proposal.envelopeJson),
        decodeAcceptedMessage: occurrence =>
          occurrence.proposalKind === 'EffectResult'
            ? Effect.fail(new Error('Malformed accepted effect result.'))
            : programAdmission.decodeAcceptedMessage(occurrence),
        now: () => 1_753_825_400_000,
        session: configuredSession,
        store: recoveryStore,
      })

      expect(
        yield* Effect.flip(
          recoveringSequencer.recoverAcceptedOccurrences([
            causalOccurrence,
            accepted,
          ]),
        ),
      ).toBeInstanceOf(AcceptanceAuthorityEnvelopeError)

      const tamperedEffectResult = InstantAcceptedMessageOccurrenceRecord.make({
        ...accepted,
        sessionPolicy: Synchronization.SessionPolicy.make({
          generation: sessionPolicy.generation,
          mode: Synchronization.SharedDomain.make({}),
        }),
      })
      const tamperStore = yield* makeInMemoryProgramStore()
      const tamperRecoveringSequencer = yield* makeTestSequencer(
        tamperStore,
        configuredSession,
      )
      const tamperFailure = yield* Effect.flip(
        tamperRecoveringSequencer.recoverAcceptedOccurrences([
          causalOccurrence,
          tamperedEffectResult,
        ]),
      )

      expect(tamperFailure).toEqual(
        new AcceptanceAuthoritySynchronizationPolicyMismatch({
          proposalId: tamperedEffectResult.proposalId,
          reason: 'SessionPolicyClaim',
        }),
      )

      const admissionAfterRecovery = (
        requests: ReadonlyArray<InstantEffectRequestRecord>,
        placements: ReadonlyArray<InstantEffectPlacementRecord>,
        nextProposalId: string,
      ) =>
        Effect.gen(function* () {
          const restartStore = yield* makeInMemoryProgramStore()
          const restartedSequencer = yield* makeTestSequencer(
            restartStore,
            configuredSession,
          )
          yield* restartedSequencer.recoverAcceptedOccurrences([
            causalOccurrence,
            accepted,
          ])
          yield* restartedSequencer.recoverEffectRequests(requests)
          yield* restartedSequencer.recoverEffectPlacements(placements)
          return yield* restartedSequencer.admit(
            InstantMessageProposalRecord.make({
              ...makeProposal(nextProposalId, 3),
              policyGeneration: configuredSession.sessionPolicy.generation,
            }),
          )
        })

      expect(
        (yield* admissionAfterRecovery(
          [],
          [],
          'proposal-after-missing-request',
        )).proposalId,
      ).toBe('proposal-after-missing-request')
      expect(
        (yield* admissionAfterRecovery(
          [effectRequest],
          [],
          'proposal-after-missing-placement',
        )).proposalId,
      ).toBe('proposal-after-missing-placement')

      const mismatchedRequest = InstantEffectRequestRecord.make({
        ...effectRequest,
        idempotencyKey: 'mismatched-effect-idempotency',
      })
      expect(
        yield* Effect.flip(
          admissionAfterRecovery(
            [mismatchedRequest],
            [placement],
            'proposal-after-mismatched-request',
          ),
        ),
      ).toEqual(
        new AcceptanceAuthorityEffectResultMismatch({
          effectRequestId: effectRequest.requestId,
          proposalId: accepted.proposalId,
          reason: 'WrongIdempotencyKey',
        }),
      )

      const otherExecutorProcessorId = 'processor-other-executor'
      const mismatchedPlacement = InstantEffectPlacementRecord.make({
        ...placement,
        assignedProcessorId: otherExecutorProcessorId,
        placementDecision: Processor.AssignedPreferred.make({
          processorId: otherExecutorProcessorId,
        }),
      })
      expect(
        yield* Effect.flip(
          admissionAfterRecovery(
            [effectRequest],
            [mismatchedPlacement],
            'proposal-after-mismatched-placement',
          ),
        ),
      ).toEqual(
        new AcceptanceAuthorityEffectResultMismatch({
          effectRequestId: effectRequest.requestId,
          proposalId: accepted.proposalId,
          reason: 'WrongProcessor',
        }),
      )
    }),
  )

  it.effect('fences the sequencer when the persisted policy changes', () =>
    Effect.gen(function* () {
      const persistedSession = InstantProgramSessionRecord.make({
        ...session,
        sessionPolicy: Synchronization.SessionPolicy.make({
          generation: 1,
          mode: Synchronization.SharedDomain.make({}),
        }),
      })
      const baseStore = yield* makeInMemoryProgramStore()
      const store = withServerConfirmedObservations(baseStore, {
        observeProgramSessions: () =>
          Stream.make([persistedSession]).pipe(Stream.concat(Stream.never)),
      })
      const sequencer = yield* makeTestSequencer(store, session)

      const failure = yield* Effect.flip(sequencer.run)

      expect(failure).toEqual(
        new AcceptanceAuthoritySessionPolicyChanged({
          actualPolicy: persistedSession.sessionPolicy,
          expectedPolicy: session.sessionPolicy,
          sessionId,
        }),
      )
    }),
  )

  it.effect(
    'fences on a trusted Program classifier failure without resolving the proposal',
    () =>
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore()
        const proposal = makeProposal('proposal-classifier-failure', 1)
        yield* store.appendProgramSession(session)
        yield* store.appendMessageProposal(proposal)
        const sequencer = yield* makeAdmissionSequencer({
          ...programAdmission,
          acceptEnvelope: candidate => Effect.succeed(candidate.envelopeJson),
          messageCategory: () => {
            throw new Error('Program classifier failed.')
          },
          now: () => 1_753_825_200_000,
          session,
          store,
        })

        const failure = yield* Effect.flip(sequencer.run)
        const resolutions = Option.getOrThrow(
          yield* Stream.runHead(
            store.observeMessageProposalResolutions({
              sessionId,
              subjectId,
            }),
          ),
        )

        expect(failure).toBeInstanceOf(AcceptanceAuthorityMessageCategoryError)
        expect(resolutions).toEqual([])
      }),
  )

  it.effect('reports the precise in-memory routing mismatch', () =>
    Effect.gen(function* () {
      const sessionPolicy = Synchronization.SessionPolicy.make({
        generation: 2,
        mode: Synchronization.SharedDomain.make({}),
      })
      const configuredSession = InstantProgramSessionRecord.make({
        ...session,
        sessionPolicy,
      })
      const proposal = InstantMessageProposalRecord.make({
        ...makeProposal('proposal-policy-generation-mismatch', 1),
        policyGeneration: 1,
      })
      const store = yield* makeInMemoryProgramStore()
      const sequencer = yield* makeTestSequencer(store, configuredSession)

      const failure = yield* Effect.flip(sequencer.admit(proposal))

      expect(failure).toEqual(
        new AcceptanceAuthoritySynchronizationPolicyMismatch({
          proposalId: proposal.proposalId,
          reason: 'PolicyGenerationClaim',
        }),
      )
    }),
  )
})
