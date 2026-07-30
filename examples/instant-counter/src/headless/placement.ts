import { Array, Data, Match as M, Option } from 'effect'
import { Processor } from 'foldkit'

import {
  InstantEffectPlacementRecord,
  InstantEffectRequestRecord,
  type InstantProgramSessionRecord,
  makeInstantCapabilityIdIndex,
  makeInstantEffectPlacementPositionKey,
} from '@foldkit/instant'

import { commandForEffect } from '../domain/effect.js'
import {
  AssignedEffect,
  type Message,
  RejectedEffect,
  type RequestedEffect,
  WaitedForEffectProcessor,
} from '../domain/message.js'

/** Provenance retained while placing one accepted effect request. */
export type EffectPlacementOrigin = Readonly<{
  causalOccurrenceId: string
  ingressProcessorId: string
  originClientId: string
  originatingProcessorId: string
}>

/** The durable effect row and factual placement Message produced together. */
export type EffectPlacementPlan = Readonly<{
  fact: Message
  placement: InstantEffectPlacementRecord
  request: InstantEffectRequestRecord
}>

/** An accepted effect request did not contain a schedulable v2 manifest. */
export class EffectPlacementPlanError extends Data.TaggedError(
  'EffectPlacementPlanError',
)<{
  readonly reason: string
  readonly requestId: string
}> {}

const assignedProcessorId = (
  decision: Processor.PlacementDecision,
): string | null =>
  M.value(decision).pipe(
    M.withReturnType<string | null>(),
    M.tags({
      AssignedPreferred: decision => decision.processorId,
      AssignedFallback: decision => decision.processorId,
    }),
    M.orElse(() => null),
  )

/** Builds the factual Message that exposes one durable placement decision. */
export const placementFact = (
  request: RequestedEffect,
  decision: Processor.PlacementDecision,
): Message =>
  M.value(decision).pipe(
    M.withReturnType<Message>(),
    M.tags({
      AssignedPreferred: decision =>
        AssignedEffect({
          kind: request.kind,
          processorId: decision.processorId,
          requestId: request.requestId,
        }),
      AssignedFallback: decision =>
        AssignedEffect({
          kind: request.kind,
          processorId: decision.processorId,
          requestId: request.requestId,
        }),
      Waiting: () =>
        WaitedForEffectProcessor({
          kind: request.kind,
          requestId: request.requestId,
        }),
      Failed: decision =>
        RejectedEffect({
          kind: request.kind,
          reason: `Placement failed: ${decision.reason}.`,
          requestId: request.requestId,
        }),
      Ignored: decision =>
        RejectedEffect({
          kind: request.kind,
          reason: `Placement ignored: ${decision.reason}.`,
          requestId: request.requestId,
        }),
    }),
    M.exhaustive,
  )

/** Materializes one accepted effect request without embedding an assignment. */
export const makeEffectRequestRecord = (
  session: InstantProgramSessionRecord,
  request: RequestedEffect,
  origin: EffectPlacementOrigin,
  now: number,
): InstantEffectRequestRecord => {
  const command = commandForEffect(request)
  const maybeManifest = Option.fromNullishOr(command.effectManifest)
  if (Option.isNone(maybeManifest) || maybeManifest.value.formatVersion !== 2) {
    throw new EffectPlacementPlanError({
      reason: 'Expected a version-two portable effect manifest.',
      requestId: request.requestId,
    })
  }
  const manifest = maybeManifest.value

  return InstantEffectRequestRecord.make({
    causalOccurrenceId: origin.causalOccurrenceId,
    effectId: manifest.id,
    effectVersion: manifest.version,
    id: request.requestId,
    idempotencyKey: `${session.sessionId}:${request.requestId}`,
    minimumCapabilityVersion: manifest.placement.capability.minimumVersion,
    originatingProcessorId: origin.originatingProcessorId,
    placement: manifest.placement,
    programId: session.programId,
    programVersion: session.programVersion,
    publicArguments: manifest.publicArguments,
    permittedResultEvents: manifest.permittedResultEvents,
    requestId: request.requestId,
    requestedAtMs: now,
    requiredCapabilityIdJson: makeInstantCapabilityIdIndex(
      manifest.placement.capability.id,
    ),
    sessionId: session.sessionId,
    subjectId: session.subjectId,
  })
}

/** Materializes one append-only placement generation for an effect request. */
export const makeEffectPlacementRecord = (
  request: InstantEffectRequestRecord,
  decision: Processor.PlacementDecision,
  assignmentGeneration: number,
  cancellationGeneration: number,
  now: number,
): InstantEffectPlacementRecord => {
  const positionKey = makeInstantEffectPlacementPositionKey(
    request.requestId,
    assignmentGeneration,
    cancellationGeneration,
  )
  return InstantEffectPlacementRecord.make({
    assignedProcessorId: assignedProcessorId(decision),
    assignmentGeneration,
    cancellationGeneration,
    decidedAtMs: now,
    id: positionKey,
    placementDecision: decision,
    placementStatus: decision._tag,
    positionKey,
    programId: request.programId,
    programVersion: request.programVersion,
    requestId: request.requestId,
    sessionId: request.sessionId,
    subjectId: request.subjectId,
  })
}

/** Plans one initial deterministic, capability-driven effect placement. */
export const planEffectPlacement = (
  session: InstantProgramSessionRecord,
  request: RequestedEffect,
  origin: EffectPlacementOrigin,
  processors: ReadonlyArray<Processor.Descriptor>,
  now: number,
): EffectPlacementPlan => {
  const effectRequest = makeEffectRequestRecord(session, request, origin, now)
  const manifest = commandForEffect(request).effectManifest
  if (manifest === undefined || manifest.formatVersion !== 2) {
    throw new EffectPlacementPlanError({
      reason: 'Expected a version-two portable effect manifest.',
      requestId: request.requestId,
    })
  }
  const supportedProcessors = Array.filter(processors, processor =>
    Processor.supportsEffectVersion(processor, manifest.id, manifest.version),
  )
  const decision = Processor.selectProcessor(manifest.placement, {
    maybeIngressProcessorId: Option.some(origin.ingressProcessorId),
    maybeOriginClientId: Option.some(origin.originClientId),
    previousAssignments: new Map(),
    processors: supportedProcessors,
  })

  return {
    fact: placementFact(request, decision),
    placement: makeEffectPlacementRecord(effectRequest, decision, 1, 0, now),
    request: effectRequest,
  }
}
