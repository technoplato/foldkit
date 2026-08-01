import { Deferred, Effect, Option, Stream } from 'effect'
import { Processor, Runtime, Synchronization } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  InstantProgramSessionRecord,
  type ProcessorRoomService,
  instantProgramProtocolVersion,
  makeInMemoryProgramStore,
} from '@foldkit/instant'

import { commandForEffect } from '../domain/effect.js'
import {
  type Message,
  RequestedEffect,
  SucceededEffect,
} from '../domain/message.js'
import {
  makeEffectPlacementRecord,
  makeEffectRequestRecord,
} from '../headless/placement.js'
import { DelegatedEffectScheduler } from './effectScheduler.js'

const session = InstantProgramSessionRecord.make({
  authorityProcessorId: 'processor-authority',
  createdAtMs: 1,
  id: 'session-1',
  isRevoked: false,
  processorRoomId: 'room-4ec724f1c3584d679b8a3b88f470e372',
  programId: 'instant-counter',
  programVersion: 1,
  protocolVersion: instantProgramProtocolVersion,
  sessionId: 'session-1',
  sessionPolicy: Synchronization.legacyMirrorSessionPolicy(),
  subjectId: 'subject-1',
})

const causalAudience = Synchronization.SessionAudience.make({})

const room: ProcessorRoomService = {
  observePresence: Stream.never,
  publishActivity: () => Effect.void,
  publishPresence: () => Effect.void,
}

const acceptedEnvelope = Processor.MessageEnvelope.make({
  acceptedAtMs: Option.some(20),
  acceptedSequence: Option.some(1),
  actor: Processor.AuthenticatedActor.make({ subjectId: 'subject-1' }),
  causationOccurrenceId: Option.none(),
  correlationId: Option.some('timer-1'),
  createdAtMs: 10,
  eventId: 'InstantCounter.RequestedEffect',
  eventVersion: 1,
  formatVersion: 1,
  ingressProcessorId: 'processor-authority',
  occurrenceId: 'occurrence-request',
  originClientId: 'client-browser',
  originDeviceId: 'device-browser',
  originSequence: 1,
  programId: 'instant-counter',
  programVersion: 1,
  sessionId: 'session-1',
})

describe('delegated effect scheduler', () => {
  it('claims before execution and returns exact causal placement provenance', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const requestMessage = RequestedEffect({
          durationMs: Option.some(1),
          kind: 'DeviceTimer',
          requestId: 'timer-1',
        })
        const request = makeEffectRequestRecord(
          session,
          requestMessage,
          {
            causalAudience,
            causalMessageCategory: 'Domain',
            causalOccurrenceId: acceptedEnvelope.occurrenceId,
            causalPolicyGeneration: session.sessionPolicy.generation,
            ingressProcessorId: acceptedEnvelope.ingressProcessorId,
            originClientId: acceptedEnvelope.originClientId,
            originatingProcessorId: 'processor-browser',
          },
          21,
        )
        const placement = makeEffectPlacementRecord(
          request,
          Processor.AssignedFallback.make({
            processorId: 'processor-executor',
          }),
          3,
          1,
          22,
        )
        const store = yield* makeInMemoryProgramStore()
        yield* store.appendEffectRequest(request)
        yield* store.appendEffectPlacement(placement)

        const proposed = yield* Deferred.make<
          Readonly<{
            input: import('@foldkit/instant').EffectResultProposalInput
            message: Message
          }>
        >()
        let isClaimed = false
        let executionCount = 0
        const scheduler = new DelegatedEffectScheduler({
          attemptRegistry: {
            claim: () => {
              isClaimed = true
              return true
            },
          },
          processorId: 'processor-executor',
          room,
          scope: {
            sessionId: session.sessionId,
            subjectId: session.subjectId,
          },
          store,
        })
        scheduler.attach({
          proposeEffectResult: (message, input) =>
            Deferred.succeed(proposed, {
              input,
              message,
            }),
        })
        const command = commandForEffect(requestMessage)
        const manifest = command.effectManifest
        if (manifest === undefined) {
          return yield* Effect.die('Expected a portable effect manifest.')
        }
        const result = SucceededEffect({
          kind: requestMessage.kind,
          processorId: 'processor-executor',
          requestId: requestMessage.requestId,
          summary: 'Completed by the assigned Processor.',
        })
        const schedule = scheduler.commandScheduler.schedule({
          commandIndex: 0,
          cause: Runtime.MessageCommandCause.make({
            envelope: Option.some(acceptedEnvelope),
            source: Runtime.fromAcceptedMessage(acceptedEnvelope.occurrenceId),
          }),
          effectManifest: manifest,
          execute: Effect.sync(() => {
            expect(isClaimed).toBe(true)
            executionCount += 1
            return result
          }),
          name: command.name,
          programId: session.programId,
          programVersion: session.programVersion,
        })
        yield* Effect.forkScoped(schedule)
        const proposal = yield* Deferred.await(proposed)

        expect(proposal.message).toStrictEqual(result)
        expect(proposal.input).toStrictEqual({
          effectAssignmentGeneration: 3,
          effectCancellationGeneration: 1,
          effectIdempotencyKey: 'session-1:timer-1',
          effectRequestId: 'timer-1',
          maybeCausationOccurrenceId: Option.some('occurrence-request'),
          maybeCorrelationId: Option.some('timer-1'),
        })
        expect(executionCount).toBe(1)
      }),
    ))

  it('completes without executing when sticky placement selects another Processor', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const requestMessage = RequestedEffect({
          durationMs: Option.some(1),
          kind: 'DeviceTimer',
          requestId: 'timer-remote',
        })
        const request = makeEffectRequestRecord(
          session,
          requestMessage,
          {
            causalAudience,
            causalMessageCategory: 'Domain',
            causalOccurrenceId: acceptedEnvelope.occurrenceId,
            causalPolicyGeneration: session.sessionPolicy.generation,
            ingressProcessorId: acceptedEnvelope.ingressProcessorId,
            originClientId: acceptedEnvelope.originClientId,
            originatingProcessorId: 'processor-browser',
          },
          21,
        )
        const placement = makeEffectPlacementRecord(
          request,
          Processor.AssignedFallback.make({
            processorId: 'processor-remote',
          }),
          1,
          0,
          22,
        )
        const store = yield* makeInMemoryProgramStore()
        yield* store.appendEffectRequest(request)
        yield* store.appendEffectPlacement(placement)

        const started = yield* Deferred.make<void>()
        const completed = yield* Deferred.make<void>()
        let executionCount = 0
        let proposalCount = 0
        const scheduler = new DelegatedEffectScheduler({
          attemptRegistry: {
            claim: () => true,
          },
          processorId: 'processor-local',
          room: {
            ...room,
            publishActivity: activity =>
              activity.activity === 'WaitingForProcessor'
                ? Deferred.succeed(started, undefined).pipe(Effect.asVoid)
                : Effect.void,
          },
          scope: {
            sessionId: session.sessionId,
            subjectId: session.subjectId,
          },
          store,
        })
        scheduler.attach({
          proposeEffectResult: () =>
            Effect.sync(() => {
              proposalCount += 1
            }),
        })
        const command = commandForEffect(requestMessage)
        const manifest = command.effectManifest
        if (manifest === undefined) {
          return yield* Effect.die('Expected a portable effect manifest.')
        }
        const schedule = scheduler.commandScheduler.schedule({
          commandIndex: 0,
          cause: Runtime.MessageCommandCause.make({
            envelope: Option.some(acceptedEnvelope),
            source: Runtime.fromAcceptedMessage(acceptedEnvelope.occurrenceId),
          }),
          effectManifest: manifest,
          execute: Effect.sync(() => {
            executionCount += 1
            return SucceededEffect({
              kind: requestMessage.kind,
              processorId: 'processor-local',
              requestId: requestMessage.requestId,
              summary: 'Should not execute.',
            })
          }),
          name: command.name,
          programId: session.programId,
          programVersion: session.programVersion,
        })
        yield* Effect.forkScoped(
          Effect.andThen(schedule, Deferred.succeed(completed, undefined)).pipe(
            Effect.asVoid,
          ),
        )
        yield* Deferred.await(started)
        yield* Deferred.await(completed).pipe(Effect.timeout('1 second'))

        expect(executionCount).toBe(0)
        expect(proposalCount).toBe(0)
      }),
    ))
})
