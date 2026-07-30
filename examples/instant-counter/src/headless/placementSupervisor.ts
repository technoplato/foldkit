import { Array, Data, Effect, Option, Order, Schema as S, Stream } from 'effect'
import { Processor } from 'foldkit'

import {
  type InstantAcceptedMessageOccurrenceRecord,
  type InstantEffectPlacementRecord,
  InstantEffectRequestRecord,
  type InstantMessageProposalRecord,
  type InstantProgramSessionRecord,
  type ProcessorRoomService,
  type ProgramStoreService,
  type SharedProgramCodecError,
  type SharedProgramMessageCodec,
  type SharedProgramProcessorService,
} from '@foldkit/instant'

import { commandForEffect } from '../domain/effect.js'
import type { Message, RequestedEffect } from '../domain/message.js'
import type { Model } from '../domain/model.js'
import { isEffectPlacementEventId } from '../domain/wire.js'
import { decodeProcessorPresence } from '../shared/presence.js'
import {
  type EffectPlacementOrigin,
  makeEffectPlacementRecord,
  makeEffectRequestRecord,
  placementFact,
} from './placement.js'
import {
  type PlacementGeneration,
  replanEffectPlacement,
} from './placementLifecycle.js'

type AcceptedEffectRequest = Readonly<{
  envelope: Processor.MessageEnvelope
  message: RequestedEffect
  occurrence: InstantAcceptedMessageOccurrenceRecord
  origin: EffectPlacementOrigin
}>

/** A durable effect request conflicts with its accepted causative Message. */
export class EffectRequestConflict extends Data.TaggedError(
  'EffectRequestConflict',
)<{
  readonly requestId: string
}> {}

/** Inputs for the authority-owned durable effect placement reconciler. */
export type EffectPlacementSupervisorConfig = Readonly<{
  codec: SharedProgramMessageCodec<Message, Processor.MessageEnvelope>
  processor: SharedProgramProcessorService<Model, Message>
  room: ProcessorRoomService
  session: InstantProgramSessionRecord
  store: ProgramStoreService
}>

const placementOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (placement: InstantEffectPlacementRecord) => placement.assignmentGeneration,
  ),
  Order.mapInput(
    Order.Number,
    (placement: InstantEffectPlacementRecord) =>
      placement.cancellationGeneration,
  ),
)

const acceptedOrder = Order.mapInput(
  Order.Number,
  (occurrence: InstantAcceptedMessageOccurrenceRecord) =>
    occurrence.acceptedSequence,
)

const requestRecordEquivalence = S.toEquivalence(InstantEffectRequestRecord)

const acceptedEffectRequests = (
  codec: SharedProgramMessageCodec<Message, Processor.MessageEnvelope>,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): Effect.Effect<
  ReadonlyArray<AcceptedEffectRequest>,
  SharedProgramCodecError
> =>
  Effect.map(
    Effect.forEach(
      Array.sort(occurrences, acceptedOrder),
      occurrence =>
        Effect.map(codec.decodeAccepted(occurrence), decoded => ({
          decoded,
          occurrence,
        })),
      { concurrency: 1 },
    ),
    decodedOccurrences => {
      const seenRequestIds = new Set<string>()
      return Array.getSomes(
        Array.map(decodedOccurrences, ({ decoded, occurrence }) => {
          if (
            decoded.message._tag !== 'RequestedEffect' ||
            seenRequestIds.has(decoded.message.requestId)
          ) {
            return Option.none()
          }
          seenRequestIds.add(decoded.message.requestId)
          return Option.some({
            envelope: decoded.envelope,
            message: decoded.message,
            occurrence,
            origin: {
              causalOccurrenceId: occurrence.occurrenceId,
              ingressProcessorId: occurrence.acceptingProcessorId,
              originClientId: occurrence.clientId,
              originatingProcessorId: occurrence.originatingProcessorId,
            },
          })
        }),
      )
    },
  )

const sortedPlacementsForRequest = (
  placements: ReadonlyArray<InstantEffectPlacementRecord>,
  requestId: string,
): ReadonlyArray<InstantEffectPlacementRecord> =>
  Array.sort(
    Array.filter(placements, placement => placement.requestId === requestId),
    placementOrder,
  )

const previousAssignments = (
  placements: ReadonlyArray<InstantEffectPlacementRecord>,
): ReadonlyMap<string, string> => {
  const assignments = new Map<string, string>()
  Array.forEach(Array.sort(placements, placementOrder), placement => {
    if (
      placement.placementDecision._tag === 'AssignedPreferred' ||
      placement.placementDecision._tag === 'AssignedFallback'
    ) {
      assignments.set(
        placement.requestId,
        placement.placementDecision.processorId,
      )
    }
  })
  return assignments
}

const placementGeneration = (
  placement: InstantEffectPlacementRecord,
): PlacementGeneration => ({
  assignmentGeneration: placement.assignmentGeneration,
  cancellationGeneration: placement.cancellationGeneration,
  decision: placement.placementDecision,
})

const hasPlacementFactProvenance = (
  request: AcceptedEffectRequest,
  value: Readonly<{
    actorId: string
    causationOccurrenceId: string | null
    correlationId: string | null
    eventId: string
    originatingProcessorId: string
  }>,
  authorityProcessorId: string,
): boolean =>
  value.actorId === authorityProcessorId &&
  value.originatingProcessorId === authorityProcessorId &&
  value.causationOccurrenceId === request.occurrence.occurrenceId &&
  value.correlationId === Option.getOrNull(request.envelope.correlationId) &&
  isEffectPlacementEventId(value.eventId)

const reportedPlacementFactCount = (
  request: AcceptedEffectRequest,
  authorityProcessorId: string,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
  proposals: ReadonlyArray<InstantMessageProposalRecord>,
): number => {
  const acceptedProposalIds = new Set(
    Array.map(occurrences, occurrence => occurrence.proposalId),
  )
  const acceptedCount = Array.filter(occurrences, occurrence =>
    hasPlacementFactProvenance(
      request,
      {
        actorId: occurrence.actorId,
        causationOccurrenceId: occurrence.causationId,
        correlationId: occurrence.correlationId,
        eventId: occurrence.eventId,
        originatingProcessorId: occurrence.originatingProcessorId,
      },
      authorityProcessorId,
    ),
  ).length
  const pendingCount = Array.filter(
    proposals,
    proposal =>
      !acceptedProposalIds.has(proposal.proposalId) &&
      hasPlacementFactProvenance(request, proposal, authorityProcessorId),
  ).length
  return acceptedCount + pendingCount
}

/** Reconciles accepted effect requests, room liveness, and append-only placements. */
export const runEffectPlacementSupervisor = ({
  codec,
  processor,
  room,
  session,
  store,
}: EffectPlacementSupervisorConfig) =>
  Effect.gen(function* () {
    const appendedRequestIds = new Set<string>()
    const appendedPlacementKeys = new Set<string>()
    const locallyReportedCounts = new Map<string, number>()
    const scope = {
      sessionId: session.sessionId,
      subjectId: session.subjectId,
    }
    const snapshots = Stream.zipLatest(
      Stream.zipLatest(
        store.observeAcceptedMessageOccurrences(scope),
        store.observeEffectRequests(scope),
      ),
      Stream.zipLatest(
        Stream.zipLatest(
          store.observeEffectPlacements(scope),
          store.observeMessageProposals(scope),
        ),
        room.observePresence,
      ),
    )

    return yield* Stream.runForEach(
      snapshots,
      ([[occurrences, requests], [[placements, proposals], presence]]) =>
        Effect.gen(function* () {
          const acceptedRequests = yield* acceptedEffectRequests(
            codec,
            occurrences,
          )
          const processors = decodeProcessorPresence(presence)
          const priorAssignments = previousAssignments(placements)

          yield* Effect.forEach(
            acceptedRequests,
            acceptedRequest =>
              Effect.gen(function* () {
                const maybeDurableRequest = Array.findFirst(
                  requests,
                  request =>
                    request.requestId === acceptedRequest.message.requestId,
                )
                if (Option.isNone(maybeDurableRequest)) {
                  if (
                    !appendedRequestIds.has(acceptedRequest.message.requestId)
                  ) {
                    const request = makeEffectRequestRecord(
                      session,
                      acceptedRequest.message,
                      acceptedRequest.origin,
                      Date.now(),
                    )
                    yield* store.appendEffectRequest(request)
                    appendedRequestIds.add(request.requestId)
                  }
                  return
                }

                const request = maybeDurableRequest.value
                const expectedRequest = makeEffectRequestRecord(
                  session,
                  acceptedRequest.message,
                  acceptedRequest.origin,
                  request.requestedAtMs,
                )
                if (!requestRecordEquivalence(request, expectedRequest)) {
                  return yield* Effect.fail(
                    new EffectRequestConflict({
                      requestId: request.requestId,
                    }),
                  )
                }

                const requestPlacements = sortedPlacementsForRequest(
                  placements,
                  request.requestId,
                )
                const maybeCurrent = Option.map(
                  Array.last(requestPlacements),
                  placementGeneration,
                )
                const command = commandForEffect(acceptedRequest.message)
                const manifest = command.effectManifest
                if (manifest === undefined || manifest.formatVersion !== 2) {
                  return yield* Effect.die(
                    'An accepted effect request has no version-two manifest.',
                  )
                }
                const maybeNextPlacement = replanEffectPlacement({
                  ingressProcessorId: acceptedRequest.origin.ingressProcessorId,
                  manifest,
                  maybeCurrent,
                  originClientId: acceptedRequest.origin.originClientId,
                  previousAssignments: priorAssignments,
                  processors,
                })
                if (Option.isSome(maybeNextPlacement)) {
                  const next = maybeNextPlacement.value
                  const placement = makeEffectPlacementRecord(
                    request,
                    next.decision,
                    next.assignmentGeneration,
                    next.cancellationGeneration,
                    Date.now(),
                  )
                  if (!appendedPlacementKeys.has(placement.positionKey)) {
                    yield* store.appendEffectPlacement(placement)
                    appendedPlacementKeys.add(placement.positionKey)
                  }
                }

                const durableReportedCount = reportedPlacementFactCount(
                  acceptedRequest,
                  session.authorityProcessorId,
                  occurrences,
                  proposals,
                )
                const reportedCount = Math.max(
                  durableReportedCount,
                  locallyReportedCounts.get(request.requestId) ?? 0,
                )
                const unreportedPlacements = Array.drop(
                  requestPlacements,
                  reportedCount,
                )
                yield* Effect.forEach(
                  unreportedPlacements,
                  placement =>
                    processor.proposeCorrelated(
                      placementFact(
                        acceptedRequest.message,
                        placement.placementDecision,
                      ),
                      {
                        maybeCausationOccurrenceId: Option.some(
                          acceptedRequest.occurrence.occurrenceId,
                        ),
                        maybeCorrelationId:
                          acceptedRequest.envelope.correlationId,
                      },
                    ),
                  { concurrency: 1, discard: true },
                )
                if (Array.isReadonlyArrayNonEmpty(unreportedPlacements)) {
                  locallyReportedCounts.set(
                    request.requestId,
                    reportedCount + unreportedPlacements.length,
                  )
                }
              }),
            { concurrency: 1, discard: true },
          )
        }),
    ).pipe(Effect.flatMap(() => Effect.never))
  })
