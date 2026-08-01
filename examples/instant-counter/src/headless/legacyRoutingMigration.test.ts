import { Array, Effect, Option, Schema as S, Struct } from 'effect'
import { Processor, Synchronization } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  InstantAcceptedMessageOccurrenceRecord,
  type InstantAcceptedMessageOccurrenceRecord as InstantAcceptedMessageOccurrenceRecordType,
  InstantEffectPlacementRecord,
  type InstantEffectPlacementRecord as InstantEffectPlacementRecordType,
  InstantEffectRequestRecord,
  type InstantEffectRequestRecord as InstantEffectRequestRecordType,
  InstantMessageProposalRecord,
  type InstantMessageProposalRecord as InstantMessageProposalRecordType,
  InstantMessageProposalResolutionRecord,
  type InstantMessageProposalResolutionRecord as InstantMessageProposalResolutionRecordType,
  InstantProgramSessionRecord,
  InstantProjectionCheckpointRecord,
  type InstantProjectionCheckpointRecord as InstantProjectionCheckpointRecordType,
  instantProgramProtocolVersion,
  makeInstantCapabilityIdIndex,
} from '@foldkit/instant'

import { commandForEffect } from '../domain/effect.js'
import {
  ClickedIncrement,
  type Message,
  RequestedEffect,
  SucceededEffect,
} from '../domain/message.js'
import { instantCounterSessionPolicy } from '../shared/identity.js'
import { makeMessageCodec } from '../transport/codec.js'
import {
  LegacyRoutingMigrationCounts,
  planLegacyRoutingMigration,
} from './legacyRoutingMigration.js'

const EnvelopeJson = S.fromJsonString(Processor.MessageEnvelope)

const subjectId = 'subject-1'
const sessionId = 'session-1'
const authorityProcessorId = 'processor-authority'
const browserProcessorId = 'processor-browser'
const executorProcessorId = 'processor-executor'

const programSession = InstantProgramSessionRecord.make({
  authorityProcessorId,
  createdAtMs: 1,
  id: sessionId,
  isRevoked: false,
  processorRoomId: '00000000-0000-4000-8000-000000000000',
  programId: 'instant-counter',
  programVersion: 1,
  protocolVersion: instantProgramProtocolVersion,
  sessionId,
  sessionPolicy: instantCounterSessionPolicy,
  subjectId,
})

const planMigration = (
  input: Omit<
    Parameters<typeof planLegacyRoutingMigration>[0],
    'programSessions'
  >,
  session = programSession,
) =>
  planLegacyRoutingMigration({
    ...input,
    programSessions: [session],
  })

const codec = makeMessageCodec({
  actor: Processor.AuthenticatedActor.make({ subjectId }),
})

type RoutingFixture = Readonly<{
  audience: Synchronization.Audience
  messageCategory: Synchronization.MessageCategory
  sessionPolicy: Synchronization.SessionPolicy
}>

type ProposalKindFixture =
  | Readonly<{ _tag: 'Message' }>
  | Readonly<{
      _tag: 'EffectResult'
      causationOccurrenceId: string
      effectAssignmentGeneration: number
      effectCancellationGeneration: number
      effectIdempotencyKey: string
      effectRequestId: string
      executorProcessorId: string
    }>

const mirrorRouting: RoutingFixture = {
  audience: Synchronization.SessionAudience.make({}),
  messageCategory: 'Domain',
  sessionPolicy: instantCounterSessionPolicy,
}

const historicalSharedDomainPolicy = Synchronization.SessionPolicy.make({
  generation: 7,
  mode: Synchronization.SharedDomain.make({}),
})

const historicalRouting: RoutingFixture = {
  audience: Synchronization.SessionAudience.make({}),
  messageCategory: 'Domain',
  sessionPolicy: historicalSharedDomainPolicy,
}

const makeProposal = async (
  message: Message,
  occurrenceId: string,
  actorSequence: number,
  originatingProcessorId: string,
  routing: RoutingFixture,
  kind: ProposalKindFixture,
): Promise<InstantMessageProposalRecordType> => {
  const maybeCausationOccurrenceId =
    kind._tag === 'EffectResult'
      ? Option.some(kind.causationOccurrenceId)
      : Option.none<string>()
  const maybeCorrelationId = (() => {
    if (kind._tag === 'EffectResult') {
      return Option.some(kind.effectRequestId)
    }
    if (
      message._tag === 'RequestedEffect' ||
      message._tag === 'SucceededEffect' ||
      message._tag === 'FailedEffect'
    ) {
      return Option.some(message.requestId)
    }
    return Option.none<string>()
  })()
  const encoded = await Effect.runPromise(
    codec.encodeProposed(message, {
      actorSequence,
      clientId: 'client-browser',
      createdAtMs: actorSequence * 10,
      maybeCausationOccurrenceId,
      maybeCorrelationId,
      occurrenceId,
      originDeviceId: 'device-browser',
      originatingProcessorId,
      programId: 'instant-counter',
      programVersion: 1,
      sessionId,
      subjectId,
    }),
  )
  if (kind._tag === 'EffectResult') {
    return InstantMessageProposalRecord.make({
      actorId: subjectId,
      actorSequence,
      causationOccurrenceId: kind.causationOccurrenceId,
      clientId: 'client-browser',
      correlationId: kind.effectRequestId,
      createdAtMs: actorSequence * 10,
      effectAssignmentGeneration: kind.effectAssignmentGeneration,
      effectCancellationGeneration: kind.effectCancellationGeneration,
      effectIdempotencyKey: kind.effectIdempotencyKey,
      effectRequestId: kind.effectRequestId,
      envelopeJson: encoded.envelopeJson,
      envelopeVersion: encoded.envelopeVersion,
      eventId: encoded.eventId,
      eventVersion: encoded.eventVersion,
      executorProcessorId: kind.executorProcessorId,
      id: occurrenceId,
      messageCategory: routing.messageCategory,
      messageIdempotencyKey: null,
      occurrenceId,
      originDeviceId: 'device-browser',
      originatingProcessorId,
      payloadJson: encoded.payloadJson,
      programId: 'instant-counter',
      programVersion: 1,
      protocolVersion: instantProgramProtocolVersion,
      proposalId: occurrenceId,
      proposalKind: 'EffectResult',
      proposedAudience: routing.audience,
      policyGeneration: routing.sessionPolicy.generation,
      sessionId,
      subjectId,
    })
  }
  return InstantMessageProposalRecord.make({
    actorId: subjectId,
    actorSequence,
    causationOccurrenceId: null,
    clientId: 'client-browser',
    correlationId: Option.getOrNull(maybeCorrelationId),
    createdAtMs: actorSequence * 10,
    effectAssignmentGeneration: null,
    effectCancellationGeneration: null,
    effectIdempotencyKey: null,
    effectRequestId: null,
    envelopeJson: encoded.envelopeJson,
    envelopeVersion: encoded.envelopeVersion,
    eventId: encoded.eventId,
    eventVersion: encoded.eventVersion,
    executorProcessorId: null,
    id: occurrenceId,
    messageCategory: routing.messageCategory,
    messageIdempotencyKey: null,
    occurrenceId,
    originDeviceId: 'device-browser',
    originatingProcessorId,
    payloadJson: encoded.payloadJson,
    programId: 'instant-counter',
    programVersion: 1,
    protocolVersion: instantProgramProtocolVersion,
    proposalId: occurrenceId,
    proposalKind: 'Message',
    proposedAudience: routing.audience,
    policyGeneration: routing.sessionPolicy.generation,
    sessionId,
    subjectId,
  })
}

const makeAcceptedOccurrence = (
  proposal: InstantMessageProposalRecordType,
  acceptedSequence: number,
  sessionPolicy: Synchronization.SessionPolicy,
): InstantAcceptedMessageOccurrenceRecordType => {
  const proposedEnvelope = S.decodeUnknownSync(EnvelopeJson)(
    proposal.envelopeJson,
  )
  const envelopeJson = S.encodeSync(EnvelopeJson)(
    Processor.MessageEnvelope.make({
      ...proposedEnvelope,
      acceptedAtMs: Option.some(acceptedSequence * 100),
      acceptedSequence: Option.some(acceptedSequence),
      ingressProcessorId: authorityProcessorId,
    }),
  )
  return InstantAcceptedMessageOccurrenceRecord.make({
    acceptedAtMs: acceptedSequence * 100,
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
    positionKey: `${sessionId}:${acceptedSequence.toString()}`,
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
  })
}

const makeEffectRequest = (
  causalOccurrence: InstantAcceptedMessageOccurrenceRecordType,
): InstantEffectRequestRecordType => {
  const request = RequestedEffect({
    durationMs: Option.some(1),
    kind: 'DeviceTimer',
    requestId: 'effect-request-1',
  })
  const manifest = commandForEffect(request).effectManifest
  if (manifest === undefined || manifest.formatVersion !== 2) {
    throw new Error('Expected a version-two portable effect manifest fixture.')
  }
  return InstantEffectRequestRecord.make({
    causalAudience: causalOccurrence.audience,
    causalMessageCategory: causalOccurrence.messageCategory,
    causalOccurrenceId: causalOccurrence.occurrenceId,
    causalPolicyGeneration: causalOccurrence.policyGeneration,
    effectId: manifest.id,
    effectVersion: manifest.version,
    id: request.requestId,
    idempotencyKey: `${sessionId}:${request.requestId}`,
    minimumCapabilityVersion: manifest.placement.capability.minimumVersion,
    originatingProcessorId: browserProcessorId,
    placement: manifest.placement,
    programId: 'instant-counter',
    programVersion: 1,
    protocolVersion: instantProgramProtocolVersion,
    publicArguments: manifest.publicArguments,
    permittedResultEvents: manifest.permittedResultEvents,
    requestId: request.requestId,
    requestedAtMs: 20,
    requiredCapabilityIdJson: makeInstantCapabilityIdIndex(
      manifest.placement.capability.id,
    ),
    sessionId,
    subjectId,
  })
}

const makeMessageProposalResolution =
  (): InstantMessageProposalResolutionRecordType =>
    InstantMessageProposalResolutionRecord.make({
      actorId: subjectId,
      actorSequence: 3,
      clientId: 'client-browser',
      id: 'proposal-rejected',
      programId: 'instant-counter',
      programVersion: 1,
      proposalId: 'proposal-rejected',
      protocolVersion: instantProgramProtocolVersion,
      rejectedAtMs: 30,
      rejectingProcessorId: authorityProcessorId,
      rejectionReason: 'EnvelopeInvalid',
      sessionId,
      subjectId,
    })

const makeEffectPlacement = (
  request: InstantEffectRequestRecordType,
  placementDecision: Processor.PlacementDecision = Processor.Waiting.make({
    reason: 'NoCapableProcessor',
  }),
): InstantEffectPlacementRecordType => {
  const positionKey = `${request.requestId}:1:0`
  const assignedProcessorId =
    placementDecision._tag === 'AssignedPreferred' ||
    placementDecision._tag === 'AssignedFallback'
      ? placementDecision.processorId
      : null
  return InstantEffectPlacementRecord.make({
    assignedProcessorId,
    assignmentGeneration: 1,
    cancellationGeneration: 0,
    decidedAtMs: 40,
    id: '55555555-5555-4555-8555-555555555555',
    placementDecision,
    placementStatus: placementDecision._tag,
    positionKey,
    programId: request.programId,
    programVersion: request.programVersion,
    protocolVersion: instantProgramProtocolVersion,
    requestId: request.requestId,
    sessionId: request.sessionId,
    subjectId: request.subjectId,
  })
}

const makeProjectionCheckpoint = (): InstantProjectionCheckpointRecordType =>
  InstantProjectionCheckpointRecord.make({
    checkpointId: 'checkpoint-1',
    createdAtMs: 50,
    id: 'checkpoint-1',
    modelDigest: 'model-digest-1',
    modelJson: '{}',
    programId: 'instant-counter',
    programVersion: 1,
    projectionId: 'instant-counter-projection',
    projectionVersion: 1,
    projectorProcessorId: browserProcessorId,
    protocolVersion: instantProgramProtocolVersion,
    sessionId,
    subjectId,
    throughAcceptedSequence: 1,
  })

const toLegacyProposal = (proposal: InstantMessageProposalRecordType) =>
  Struct.omit(proposal, [
    'messageCategory',
    'messageIdempotencyKey',
    'policyGeneration',
    'protocolVersion',
    'proposedAudience',
  ])

const toLegacyAcceptedOccurrence = (
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
) =>
  Struct.omit(occurrence, [
    'audience',
    'messageCategory',
    'messageIdempotencyKey',
    'policyGeneration',
    'protocolVersion',
    'sessionPolicy',
  ])

const toLegacyEffectRequest = (request: InstantEffectRequestRecordType) =>
  Struct.omit(request, [
    'causalAudience',
    'causalMessageCategory',
    'causalPolicyGeneration',
    'protocolVersion',
  ])

const toLegacyMessageProposalResolution = (
  resolution: InstantMessageProposalResolutionRecordType,
) =>
  Struct.omit(resolution, [
    'actorId',
    'actorSequence',
    'clientId',
    'protocolVersion',
  ])

const toLegacyEffectPlacement = (placement: InstantEffectPlacementRecordType) =>
  Struct.omit(placement, ['protocolVersion'])

const toLegacyProjectionCheckpoint = (
  checkpoint: InstantProjectionCheckpointRecordType,
) => Struct.omit(checkpoint, ['protocolVersion'])

const omitOrdinaryProposalNulls = (
  proposal: ReturnType<typeof toLegacyProposal>,
) =>
  Struct.omit(proposal, [
    'causationOccurrenceId',
    'correlationId',
    'effectAssignmentGeneration',
    'effectCancellationGeneration',
    'effectIdempotencyKey',
    'effectRequestId',
    'executorProcessorId',
  ])

const omitOrdinaryAcceptedNulls = (
  occurrence: ReturnType<typeof toLegacyAcceptedOccurrence>,
) =>
  Struct.omit(occurrence, [
    'causationId',
    'correlationId',
    'effectAssignmentGeneration',
    'effectCancellationGeneration',
    'effectIdempotencyKey',
    'effectRequestId',
    'executorProcessorId',
  ])

describe('legacy routing migration', () => {
  it('classifies exact ordinary v1 rows under the selected Mirror policy', async () => {
    const acceptedProposal = await makeProposal(
      ClickedIncrement(),
      'occurrence-accepted',
      1,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const accepted = makeAcceptedOccurrence(
      acceptedProposal,
      1,
      instantCounterSessionPolicy,
    )
    const requestProposal = await makeProposal(
      RequestedEffect({
        durationMs: Option.some(1),
        kind: 'DeviceTimer',
        requestId: 'effect-request-1',
      }),
      'occurrence-request',
      2,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const requestOccurrence = makeAcceptedOccurrence(
      requestProposal,
      2,
      instantCounterSessionPolicy,
    )
    const effectRequest = makeEffectRequest(requestOccurrence)
    const effectPlacement = makeEffectPlacement(effectRequest)
    const proposalResolution = makeMessageProposalResolution()
    const projectionCheckpoint = makeProjectionCheckpoint()
    const rejectedProposal = await makeProposal(
      ClickedIncrement(),
      proposalResolution.proposalId,
      4,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const pendingProposal = await makeProposal(
      ClickedIncrement(),
      'occurrence-pending',
      3,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )

    const plan = await Effect.runPromise(
      planMigration({
        acceptedOccurrences: [
          omitOrdinaryAcceptedNulls(toLegacyAcceptedOccurrence(accepted)),
          toLegacyAcceptedOccurrence(requestOccurrence),
        ],
        effectPlacements: [toLegacyEffectPlacement(effectPlacement)],
        effectRequests: [toLegacyEffectRequest(effectRequest)],
        messageProposalResolutions: [
          toLegacyMessageProposalResolution(proposalResolution),
        ],
        messageProposals: [
          acceptedProposal,
          requestProposal,
          rejectedProposal,
          omitOrdinaryProposalNulls(toLegacyProposal(pendingProposal)),
        ],
        projectionCheckpoints: [
          toLegacyProjectionCheckpoint(projectionCheckpoint),
        ],
      }),
    )

    expect(plan.counts).toStrictEqual(
      LegacyRoutingMigrationCounts.make({
        acceptedOccurrences: 2,
        effectPlacements: 1,
        effectRequests: 1,
        messageProposalResolutions: 1,
        messageProposals: 1,
        projectionCheckpoints: 1,
      }),
    )
    expect(plan.acceptedOccurrences).toHaveLength(2)
    expect(
      Array.map(plan.acceptedOccurrences, occurrence => occurrence.id),
    ).toStrictEqual([accepted.id, requestOccurrence.id])
    expect(
      Array.map(plan.messageProposals, proposal => proposal.id),
    ).toStrictEqual([pendingProposal.id])
    expect(Array.map(plan.effectRequests, request => request.id)).toStrictEqual(
      [effectRequest.id],
    )
    expect(
      Array.map(plan.effectPlacements, placement => placement.id),
    ).toStrictEqual([effectPlacement.id])
    expect(
      Array.map(plan.messageProposalResolutions, resolution => resolution.id),
    ).toStrictEqual([proposalResolution.id])
    expect(
      Array.map(plan.projectionCheckpoints, checkpoint => checkpoint.id),
    ).toStrictEqual([projectionCheckpoint.id])
    expect(
      Option.getOrThrow(Array.head(plan.acceptedOccurrences)),
    ).toMatchObject({
      audience: Synchronization.SessionAudience.make({}),
      messageCategory: 'Domain',
      messageIdempotencyKey: null,
      policyGeneration: 0,
      protocolVersion: instantProgramProtocolVersion,
      sessionPolicy: instantCounterSessionPolicy,
    })
    expect(Option.getOrThrow(Array.head(plan.messageProposals))).toMatchObject({
      messageCategory: 'Domain',
      messageIdempotencyKey: null,
      policyGeneration: 0,
      protocolVersion: instantProgramProtocolVersion,
      proposedAudience: Synchronization.SessionAudience.make({}),
    })
    expect(Option.getOrThrow(Array.head(plan.effectRequests))).toMatchObject({
      protocolVersion: instantProgramProtocolVersion,
    })
    expect(Option.getOrThrow(Array.head(plan.effectPlacements))).toMatchObject({
      protocolVersion: instantProgramProtocolVersion,
    })
    expect(
      Option.getOrThrow(Array.head(plan.messageProposalResolutions)),
    ).toMatchObject({
      actorId: rejectedProposal.actorId,
      actorSequence: rejectedProposal.actorSequence,
      clientId: rejectedProposal.clientId,
      protocolVersion: instantProgramProtocolVersion,
    })
    expect(
      Option.getOrThrow(Array.head(plan.projectionCheckpoints)),
    ).toMatchObject({ protocolVersion: instantProgramProtocolVersion })

    const repeated = await Effect.runPromise(
      planMigration({
        acceptedOccurrences: plan.acceptedOccurrences,
        effectPlacements: plan.effectPlacements,
        effectRequests: plan.effectRequests,
        messageProposalResolutions: plan.messageProposalResolutions,
        messageProposals: [
          acceptedProposal,
          requestProposal,
          rejectedProposal,
          ...plan.messageProposals,
        ],
        projectionCheckpoints: plan.projectionCheckpoints,
      }),
    )
    expect(repeated.counts).toStrictEqual(
      LegacyRoutingMigrationCounts.make({
        acceptedOccurrences: 0,
        effectPlacements: 0,
        effectRequests: 0,
        messageProposalResolutions: 0,
        messageProposals: 0,
        projectionCheckpoints: 0,
      }),
    )
  })

  it('inherits the exact causal policy for effect results and requests', async () => {
    const causalProposal = await makeProposal(
      RequestedEffect({
        durationMs: Option.some(1),
        kind: 'DeviceTimer',
        requestId: 'effect-request-1',
      }),
      'occurrence-causal',
      1,
      browserProcessorId,
      historicalRouting,
      { _tag: 'Message' },
    )
    const causalOccurrence = makeAcceptedOccurrence(
      causalProposal,
      1,
      historicalSharedDomainPolicy,
    )
    const effectRequest = makeEffectRequest(causalOccurrence)
    const resultProposal = await makeProposal(
      SucceededEffect({
        kind: 'DeviceTimer',
        processorId: executorProcessorId,
        requestId: effectRequest.requestId,
        summary: 'Completed the migration fixture.',
      }),
      'occurrence-result',
      2,
      executorProcessorId,
      historicalRouting,
      {
        _tag: 'EffectResult',
        causationOccurrenceId: causalOccurrence.occurrenceId,
        effectAssignmentGeneration: 1,
        effectCancellationGeneration: 0,
        effectIdempotencyKey: effectRequest.idempotencyKey,
        effectRequestId: effectRequest.requestId,
        executorProcessorId,
      },
    )
    const resultOccurrence = makeAcceptedOccurrence(
      resultProposal,
      2,
      historicalSharedDomainPolicy,
    )
    const effectPlacement = makeEffectPlacement(
      effectRequest,
      Processor.AssignedPreferred.make({ processorId: executorProcessorId }),
    )
    const historicalSession = InstantProgramSessionRecord.make({
      ...programSession,
      sessionPolicy: historicalSharedDomainPolicy,
    })

    const plan = await Effect.runPromise(
      planMigration(
        {
          acceptedOccurrences: [
            toLegacyAcceptedOccurrence(resultOccurrence),
            causalOccurrence,
          ],
          effectPlacements: [effectPlacement],
          effectRequests: [toLegacyEffectRequest(effectRequest)],
          messageProposalResolutions: [],
          messageProposals: [causalProposal, toLegacyProposal(resultProposal)],
          projectionCheckpoints: [],
        },
        historicalSession,
      ),
    )

    expect(plan.counts).toStrictEqual(
      LegacyRoutingMigrationCounts.make({
        acceptedOccurrences: 1,
        effectPlacements: 0,
        effectRequests: 1,
        messageProposalResolutions: 0,
        messageProposals: 1,
        projectionCheckpoints: 0,
      }),
    )
    expect(
      Option.getOrThrow(Array.head(plan.acceptedOccurrences)),
    ).toMatchObject({
      audience: causalOccurrence.audience,
      messageCategory: causalOccurrence.messageCategory,
      policyGeneration: causalOccurrence.policyGeneration,
      sessionPolicy: causalOccurrence.sessionPolicy,
    })
    expect(Option.getOrThrow(Array.head(plan.messageProposals))).toMatchObject({
      messageCategory: causalOccurrence.messageCategory,
      policyGeneration: causalOccurrence.policyGeneration,
      proposedAudience: causalOccurrence.audience,
    })
    expect(Option.getOrThrow(Array.head(plan.effectRequests))).toMatchObject({
      causalAudience: causalOccurrence.audience,
      causalMessageCategory: causalOccurrence.messageCategory,
      causalPolicyGeneration: causalOccurrence.policyGeneration,
    })
  })

  it('fails closed on contradictory or detached current terminal rows', async () => {
    const proposal = await makeProposal(
      ClickedIncrement(),
      'occurrence-current-terminal',
      1,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const accepted = makeAcceptedOccurrence(
      proposal,
      1,
      instantCounterSessionPolicy,
    )
    const resolution = InstantMessageProposalResolutionRecord.make({
      actorId: proposal.actorId,
      actorSequence: proposal.actorSequence,
      clientId: proposal.clientId,
      id: proposal.proposalId,
      programId: proposal.programId,
      programVersion: proposal.programVersion,
      protocolVersion: proposal.protocolVersion,
      proposalId: proposal.proposalId,
      rejectedAtMs: 30,
      rejectingProcessorId: authorityProcessorId,
      rejectionReason: 'EnvelopeInvalid',
      sessionId: proposal.sessionId,
      subjectId: proposal.subjectId,
    })

    const missingProposal = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [accepted],
          effectPlacements: [],
          effectRequests: [],
          messageProposalResolutions: [],
          messageProposals: [],
          projectionCheckpoints: [],
        }),
      ),
    )
    expect(missingProposal).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'AcceptedOccurrence',
      reason: 'MissingAcceptedProposal',
    })

    const contradictoryTerminal = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [accepted],
          effectPlacements: [],
          effectRequests: [],
          messageProposalResolutions: [resolution],
          messageProposals: [proposal],
          projectionCheckpoints: [],
        }),
      ),
    )
    expect(contradictoryTerminal).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'AcceptedOccurrence',
      reason: 'AcceptedAndRejected',
    })

    const mismatchedResolution = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [],
          effectPlacements: [],
          effectRequests: [],
          messageProposalResolutions: [
            InstantMessageProposalResolutionRecord.make({
              ...resolution,
              actorId: 'actor-forged',
            }),
          ],
          messageProposals: [proposal],
          projectionCheckpoints: [],
        }),
      ),
    )
    expect(mismatchedResolution).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'MessageProposalResolution',
      reason: 'ResolutionProposalConflict',
    })
  })

  it('revalidates deterministic current effect requests instead of passing them through', async () => {
    const proposal = await makeProposal(
      RequestedEffect({
        durationMs: Option.some(1),
        kind: 'DeviceTimer',
        requestId: 'effect-request-1',
      }),
      'occurrence-current-effect-request',
      1,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const accepted = makeAcceptedOccurrence(
      proposal,
      1,
      instantCounterSessionPolicy,
    )
    const request = makeEffectRequest(accepted)

    const error = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [accepted],
          effectPlacements: [],
          effectRequests: [
            InstantEffectRequestRecord.make({
              ...request,
              originatingProcessorId: 'processor-forged',
            }),
          ],
          messageProposalResolutions: [],
          messageProposals: [proposal],
          projectionCheckpoints: [],
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'EffectRequest',
      reason: 'MalformedOrPartialV2',
    })
  })

  it('fails closed when a current effect placement uses an invalid entity UUID', async () => {
    const proposal = await makeProposal(
      RequestedEffect({
        durationMs: Option.some(1),
        kind: 'DeviceTimer',
        requestId: 'effect-request-1',
      }),
      'occurrence-current-placement-id',
      1,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const accepted = makeAcceptedOccurrence(
      proposal,
      1,
      instantCounterSessionPolicy,
    )
    const request = makeEffectRequest(accepted)
    const placement = makeEffectPlacement(request)

    const error = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [accepted],
          effectPlacements: [
            { ...placement, id: 'noncanonical-placement-entity-id' },
          ],
          effectRequests: [request],
          messageProposalResolutions: [],
          messageProposals: [proposal],
          projectionCheckpoints: [],
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'EffectPlacement',
      reason: 'MalformedOrPartialV2',
    })
  })

  it('fails closed for a partial v2 proposal instead of defaulting it', async () => {
    const proposal = await makeProposal(
      ClickedIncrement(),
      'occurrence-partial',
      1,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const partial = {
      ...omitOrdinaryProposalNulls(toLegacyProposal(proposal)),
      messageCategory: 'Domain',
    }

    const error = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [],
          effectPlacements: [],
          effectRequests: [],
          messageProposalResolutions: [],
          messageProposals: [partial],
          projectionCheckpoints: [],
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'MessageProposal',
      reason: 'MalformedOrPartialV2',
    })
  })

  it('fails closed when a legacy resolution has no immutable proposal origin', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [],
          effectPlacements: [],
          effectRequests: [],
          messageProposalResolutions: [
            toLegacyMessageProposalResolution(makeMessageProposalResolution()),
          ],
          messageProposals: [],
          projectionCheckpoints: [],
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'MessageProposalResolution',
      reason: 'MissingResolutionProposal',
    })
  })

  it('fails closed when a legacy resolution proposal origin conflicts with its scope', async () => {
    const resolution = makeMessageProposalResolution()
    const proposal = await makeProposal(
      ClickedIncrement(),
      resolution.proposalId,
      3,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const conflictingProposal = InstantMessageProposalRecord.make({
      ...proposal,
      subjectId: 'subject-other',
    })
    const error = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [],
          effectPlacements: [],
          effectRequests: [],
          messageProposalResolutions: [
            toLegacyMessageProposalResolution(resolution),
          ],
          messageProposals: [conflictingProposal],
          projectionCheckpoints: [],
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'MessageProposalResolution',
      reason: 'ResolutionProposalConflict',
    })
  })

  it('does not treat a v2 routing row missing only protocolVersion as legacy', async () => {
    const proposal = await makeProposal(
      ClickedIncrement(),
      'occurrence-missing-protocol',
      1,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const error = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [],
          effectPlacements: [],
          effectRequests: [],
          messageProposalResolutions: [],
          messageProposals: [Struct.omit(proposal, ['protocolVersion'])],
          projectionCheckpoints: [],
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'MessageProposal',
      reason: 'MalformedOrPartialV2',
    })
  })

  it('rejects a malformed protocol version on an ancillary durable row', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [],
          effectPlacements: [],
          effectRequests: [],
          messageProposalResolutions: [],
          messageProposals: [],
          projectionCheckpoints: [
            { ...makeProjectionCheckpoint(), protocolVersion: 3 },
          ],
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'ProjectionCheckpoint',
      reason: 'MalformedOrPartialV2',
    })
  })

  it('fails closed when causal routing is unavailable', async () => {
    const causalProposal = await makeProposal(
      RequestedEffect({
        durationMs: Option.some(1),
        kind: 'DeviceTimer',
        requestId: 'effect-request-1',
      }),
      'occurrence-missing',
      1,
      browserProcessorId,
      mirrorRouting,
      { _tag: 'Message' },
    )
    const causalOccurrence = makeAcceptedOccurrence(
      causalProposal,
      1,
      instantCounterSessionPolicy,
    )

    const error = await Effect.runPromise(
      Effect.flip(
        planMigration({
          acceptedOccurrences: [],
          effectPlacements: [],
          effectRequests: [
            toLegacyEffectRequest(makeEffectRequest(causalOccurrence)),
          ],
          messageProposalResolutions: [],
          messageProposals: [],
          projectionCheckpoints: [],
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: 'LegacyRoutingMigrationError',
      entity: 'EffectRequest',
      reason: 'MissingCausalOccurrence',
    })
  })
})
