import {
  Array,
  Effect,
  Fiber,
  Latch,
  Option,
  Stream,
  SubscriptionRef,
} from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import {
  AcceptanceAuthorityProposalKindMismatch,
  AdmissionSequencerCapability,
  AdmissionSequencerCapabilityRequirement,
  AdmissionSequencerResolutionProcessorMismatch,
  AdmissionSequencerResolutionWriteNotSynced,
  InstantMessageProposalRecord,
  InstantMessageProposalResolutionRecord,
  InstantProgramSessionRecord,
  ProgramStoreError,
  type ProgramStoreService,
  enqueuedTransactionOutcome,
  makeAdmissionSequencer,
  makeInMemoryProgramStore,
  makeMessageProposalRejectionResolution,
} from '../index.js'

const sessionId = 'session-001'
const subjectId = 'subject-001'

const session = InstantProgramSessionRecord.make({
  authorityProcessorId: 'processor-sequencer',
  createdAtMs: 1_753_825_000_000,
  id: sessionId,
  isRevoked: false,
  processorRoomId: 'room-4ec724f1c3584d679b8a3b88f470e372',
  programId: 'counter',
  programVersion: 1,
  sessionId,
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
    occurrenceId: proposalId,
    originDeviceId: 'device-browser',
    originatingProcessorId: 'processor-browser',
    payloadJson: '{"_tag":"Incremented"}',
    programId: session.programId,
    programVersion: session.programVersion,
    proposalId,
    proposalKind: 'Message',
    sessionId,
    subjectId,
  })

describe('admission sequencer proposal resolution', () => {
  it('advertises sequencing as a portable Processor capability', () => {
    expect(AdmissionSequencerCapability).toEqual({
      id: ['Foldkit', 'Admission', 'Sequence'],
      version: 1,
    })
    expect(AdmissionSequencerCapabilityRequirement).toEqual({
      id: AdmissionSequencerCapability.id,
      minimumVersion: 1,
    })
  })

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
            id: rejectedProposal.proposalId,
            programId: session.programId,
            programVersion: session.programVersion,
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
    'rejects terminal resolutions from a Processor other than the designated sequencer',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeInMemoryProgramStore()
          const proposal = makeProposal('proposal-wrong-sequencer', 1)
          yield* store.appendProgramSession(session)
          yield* store.appendMessageProposalResolution(
            InstantMessageProposalResolutionRecord.make({
              id: proposal.proposalId,
              programId: session.programId,
              programVersion: session.programVersion,
              proposalId: proposal.proposalId,
              rejectedAtMs: 1_753_825_200_000,
              rejectingProcessorId: 'processor-not-the-sequencer',
              rejectionReason: 'EnvelopeInvalid',
              sessionId,
              subjectId,
            }),
          )
          const sequencer = yield* makeAdmissionSequencer({
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
    'admits a proposal after an observed but unconfirmed resolution is removed',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const baseStore = yield* makeInMemoryProgramStore()
          const acceptedFirst = makeProposal('proposal-accepted-first', 1)
          const temporarilyResolved = makeProposal(
            'proposal-temporarily-resolved',
            2,
          )
          const resolutions = yield* SubscriptionRef.make<
            ReadonlyArray<InstantMessageProposalResolutionRecord>
          >([
            InstantMessageProposalResolutionRecord.make({
              id: temporarilyResolved.proposalId,
              programId: session.programId,
              programVersion: session.programVersion,
              proposalId: temporarilyResolved.proposalId,
              rejectedAtMs: 1_753_825_200_000,
              rejectingProcessorId: session.authorityProcessorId,
              rejectionReason: 'EnvelopeInvalid',
              sessionId,
              subjectId,
            }),
          ])
          const store: ProgramStoreService = {
            ...baseStore,
            observeMessageProposalResolutions: () =>
              SubscriptionRef.changes(resolutions),
          }
          yield* baseStore.appendProgramSession(session)
          yield* baseStore.appendMessageProposal(acceptedFirst)
          yield* baseStore.appendMessageProposal(temporarilyResolved)
          const sequencer = yield* makeAdmissionSequencer({
            acceptEnvelope: proposal => Effect.succeed(proposal.envelopeJson),
            now: () => 1_753_825_200_001,
            session,
            store,
          })
          const sequencerFiber = yield* Effect.forkChild(sequencer.run)

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
                    occurrence.proposalId === acceptedFirst.proposalId,
                ),
            ),
          )
          yield* SubscriptionRef.set(resolutions, [])
          const maybeAcceptedAfterRemoval = yield* Stream.runHead(
            Stream.filter(
              baseStore.observeAcceptedMessageOccurrences({
                sessionId,
                subjectId,
              }),
              occurrences =>
                Array.some(
                  occurrences,
                  occurrence =>
                    occurrence.proposalId === temporarilyResolved.proposalId,
                ),
            ),
          )
          yield* Fiber.interrupt(sequencerFiber)

          expect(Option.isSome(maybeAcceptedAfterRemoval)).toBe(true)
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
          const store: ProgramStoreService = {
            ...baseStore,
            appendMessageProposalResolution: resolution =>
              SubscriptionRef.update(
                resolutionAppendCount,
                count => count + 1,
              ).pipe(
                Effect.andThen(
                  baseStore.appendMessageProposalResolution(resolution),
                ),
              ),
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
          }
          yield* baseStore.appendProgramSession(session)
          const sequencer = yield* makeAdmissionSequencer({
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

  it.effect('reports a rejection only after its resolution synchronizes', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* makeInMemoryProgramStore(
          enqueuedTransactionOutcome('offline-sequencer'),
        )
        const rejectedProposal = InstantMessageProposalRecord.make({
          ...makeProposal('proposal-enqueued-resolution', 1),
          effectRequestId: 'effect-request-invalid-for-message',
        })
        const rejectionCount = yield* SubscriptionRef.make(0)
        yield* store.appendProgramSession(session)
        yield* store.appendMessageProposal(rejectedProposal)
        const sequencer = yield* makeAdmissionSequencer({
          acceptEnvelope: proposal => Effect.succeed(proposal.envelopeJson),
          now: () => 1_753_825_200_000,
          onProposalRejected: () =>
            SubscriptionRef.update(rejectionCount, count => count + 1),
          session,
          store,
        })
        const failure = yield* Effect.flip(sequencer.run)

        expect(failure).toBeInstanceOf(
          AdmissionSequencerResolutionWriteNotSynced,
        )
        expect(yield* SubscriptionRef.get(rejectionCount)).toBe(0)
      }),
    ),
  )
})
