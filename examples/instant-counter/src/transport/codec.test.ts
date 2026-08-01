import { Effect, Option, Schema as S } from 'effect'
import { Processor, Synchronization } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  InstantAcceptedMessageOccurrenceRecord,
  type InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  InstantProgramSessionRecord,
  instantProgramProtocolVersion,
} from '@foldkit/instant'

import {
  AssignedEffect,
  ClickedIncrement,
  type EffectRequestKind,
  type Message,
  RequestedEffect,
  SucceededEffect,
} from '../domain/message.js'
import { InstantCounterSynchronization } from '../domain/program.js'
import { makeEffectRequestRecord } from '../headless/placement.js'
import { instantCounterSessionPolicy } from '../shared/identity.js'
import { makeMessageCodec } from './codec.js'

const EnvelopeJson = S.fromJsonString(Processor.MessageEnvelope)
const JsonString = S.fromJsonString(S.Json)

const codec = makeMessageCodec({
  actor: Processor.AuthenticatedActor.make({ subjectId: 'subject-1' }),
})

const input = {
  actorSequence: 7,
  clientId: 'client-1',
  createdAtMs: 100,
  maybeCausationOccurrenceId: Option.some('occurrence-cause'),
  maybeCorrelationId: Option.some('correlation-1'),
  occurrenceId: 'occurrence-1',
  originDeviceId: 'device-1',
  originatingProcessorId: 'processor-browser',
  programId: 'instant-counter',
  programVersion: 1,
  sessionId: 'session-1',
  subjectId: 'subject-1',
}

const session = InstantProgramSessionRecord.make({
  authorityProcessorId: 'processor-authority',
  createdAtMs: 1,
  id: input.sessionId,
  isRevoked: false,
  processorRoomId: 'room-4ec724f1c3584d679b8a3b88f470e372',
  programId: input.programId,
  programVersion: input.programVersion,
  protocolVersion: instantProgramProtocolVersion,
  sessionId: input.sessionId,
  sessionPolicy: instantCounterSessionPolicy,
  subjectId: input.subjectId,
})

const causalAudience = Synchronization.SessionAudience.make({})

const effectRequest = makeEffectRequestRecord(
  session,
  RequestedEffect({
    durationMs: Option.some(1),
    kind: 'DeviceTimer',
    requestId: 'effect-request-1',
  }),
  {
    causalAudience,
    causalMessageCategory: 'Domain',
    causalOccurrenceId: 'occurrence-cause',
    causalPolicyGeneration: session.sessionPolicy.generation,
    ingressProcessorId: 'processor-authority',
    originClientId: input.clientId,
    originatingProcessorId: input.originatingProcessorId,
  },
  100,
)

const makeProposal = async (message: Message = ClickedIncrement()) => {
  const encoded = await Effect.runPromise(codec.encodeProposed(message, input))
  const messageCategory = InstantCounterSynchronization.messageCategory(message)
  return InstantMessageProposalRecord.make({
    actorId: 'subject-1',
    actorSequence: input.actorSequence,
    causationOccurrenceId: 'occurrence-cause',
    clientId: input.clientId,
    correlationId: 'correlation-1',
    createdAtMs: input.createdAtMs,
    effectAssignmentGeneration: null,
    effectCancellationGeneration: null,
    effectIdempotencyKey: null,
    effectRequestId: null,
    envelopeJson: encoded.envelopeJson,
    envelopeVersion: encoded.envelopeVersion,
    eventId: encoded.eventId,
    eventVersion: encoded.eventVersion,
    executorProcessorId: null,
    id: input.occurrenceId,
    messageCategory,
    messageIdempotencyKey: null,
    occurrenceId: input.occurrenceId,
    originDeviceId: 'device-1',
    originatingProcessorId: input.originatingProcessorId,
    payloadJson: encoded.payloadJson,
    programId: input.programId,
    programVersion: input.programVersion,
    protocolVersion: instantProgramProtocolVersion,
    proposalId: input.occurrenceId,
    proposalKind: 'Message',
    proposedAudience: causalAudience,
    policyGeneration: session.sessionPolicy.generation,
    sessionId: input.sessionId,
    subjectId: input.subjectId,
  })
}

const makeAcceptedOccurrence = async (
  proposal: InstantMessageProposalRecord,
  request?: InstantEffectRequestRecord,
): Promise<InstantAcceptedMessageOccurrenceRecord> => {
  const envelopeJson = await Effect.runPromise(accept(proposal, request))
  return InstantAcceptedMessageOccurrenceRecord.make({
    acceptedAtMs: 200,
    acceptedSequence: 1,
    acceptingProcessorId: 'processor-authority',
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
    positionKey: 'session-1:1',
    programId: proposal.programId,
    programVersion: proposal.programVersion,
    protocolVersion: proposal.protocolVersion,
    proposedEnvelopeJson: proposal.envelopeJson,
    proposalId: proposal.proposalId,
    proposalKind: proposal.proposalKind,
    policyGeneration: proposal.policyGeneration,
    sessionId: proposal.sessionId,
    sessionPolicy: session.sessionPolicy,
    subjectId: proposal.subjectId,
  })
}

const makeEffectResultProposal = async (
  processorId = input.originatingProcessorId,
  kind: EffectRequestKind = 'DeviceTimer',
): Promise<InstantMessageProposalRecord> => {
  const proposal = await makeProposal(
    SucceededEffect({
      kind,
      processorId,
      requestId: 'effect-request-1',
      summary: 'Completed a browser timer.',
    }),
  )
  return InstantMessageProposalRecord.make({
    ...proposal,
    effectAssignmentGeneration: 1,
    effectCancellationGeneration: 0,
    effectIdempotencyKey: 'effect-request-1',
    effectRequestId: 'effect-request-1',
    executorProcessorId: input.originatingProcessorId,
    proposalKind: 'EffectResult',
  })
}

const withEnvelope = (
  proposal: InstantMessageProposalRecord,
  transform: (envelope: Processor.MessageEnvelope) => Processor.MessageEnvelope,
): InstantMessageProposalRecord => {
  const envelope = S.decodeUnknownSync(EnvelopeJson)(proposal.envelopeJson)
  return InstantMessageProposalRecord.make({
    ...proposal,
    envelopeJson: S.encodeSync(EnvelopeJson)(transform(envelope)),
  })
}

const accept = (
  proposal: InstantMessageProposalRecord,
  request: InstantEffectRequestRecord | undefined = proposal.proposalKind ===
  'EffectResult'
    ? effectRequest
    : undefined,
) =>
  codec.acceptEnvelope(proposal, {
    acceptedAtMs: 200,
    acceptedSequence: 1,
    acceptingProcessorId: 'processor-authority',
    effectRequest: request,
  })

describe('Instant counter Message codec', () => {
  it('decodes a valid proposed Message through the versioned Program registry', async () => {
    const proposal = await makeProposal()

    const decoded = await Effect.runPromise(codec.decodeProposed(proposal))

    expect(decoded.message).toStrictEqual(ClickedIncrement())
    expect(decoded.envelope.occurrenceId).toBe(proposal.occurrenceId)
  })

  it('projects every schema-valid Message without a per-Message allowlist', async () => {
    const proposal = await makeProposal()
    const malformed = InstantMessageProposalRecord.make({
      ...proposal,
      payloadJson: S.encodeSync(JsonString)([]),
    })
    const authorityOwned = await makeProposal(
      AssignedEffect({
        kind: 'DeviceTimer',
        processorId: 'processor-browser',
        requestId: 'timer-1',
      }),
    )

    const malformedError = await Effect.runPromise(
      Effect.flip(codec.decodeProposed(malformed)),
    )
    const decodedAuthorityOwned = await Effect.runPromise(
      codec.decodeProposed(authorityOwned),
    )

    expect(malformedError).toMatchObject({
      _tag: 'SharedProgramCodecError',
      operation: 'DecodeProposed',
    })
    expect(decodedAuthorityOwned.message).toStrictEqual(
      AssignedEffect({
        kind: 'DeviceTimer',
        processorId: 'processor-browser',
        requestId: 'timer-1',
      }),
    )
  })

  it('preserves causal provenance and stamps only acceptance fields', async () => {
    const proposal = await makeProposal()
    const acceptedJson = await Effect.runPromise(accept(proposal))
    const accepted = S.decodeUnknownSync(EnvelopeJson)(acceptedJson)

    expect(accepted).toMatchObject({
      createdAtMs: 100,
      eventId: 'Counter.ClickedIncrement',
      ingressProcessorId: 'processor-authority',
      occurrenceId: 'occurrence-1',
      originClientId: 'client-1',
      originDeviceId: 'device-1',
      originSequence: 7,
    })
    expect(accepted.causationOccurrenceId).toStrictEqual(
      Option.some('occurrence-cause'),
    )
    expect(accepted.correlationId).toStrictEqual(Option.some('correlation-1'))
    expect(accepted.acceptedAtMs).toStrictEqual(Option.some(200))
    expect(accepted.acceptedSequence).toStrictEqual(Option.some(1))
  })

  it('rejects a forged event identity before acceptance', async () => {
    const proposal = await makeProposal()
    const forged = withEnvelope(proposal, envelope =>
      Processor.MessageEnvelope.make({
        ...envelope,
        eventId: 'InstantCounter.ForgedEvent',
      }),
    )
    const error = await Effect.runPromise(Effect.flip(accept(forged)))

    expect(error).toMatchObject({
      _tag: 'SharedProgramCodecError',
      operation: 'AcceptEnvelope',
    })
  })

  it('rejects forged actor, device, and originating Processor provenance', async () => {
    const proposal = await makeProposal()
    const forgedActor = withEnvelope(proposal, envelope =>
      Processor.MessageEnvelope.make({
        ...envelope,
        actor: Processor.AuthenticatedActor.make({
          subjectId: 'subject-attacker',
        }),
      }),
    )
    const forgedDevice = withEnvelope(proposal, envelope =>
      Processor.MessageEnvelope.make({
        ...envelope,
        originDeviceId: 'device-attacker',
      }),
    )
    const forgedProcessor = withEnvelope(proposal, envelope =>
      Processor.MessageEnvelope.make({
        ...envelope,
        ingressProcessorId: 'processor-attacker',
      }),
    )

    const actorError = await Effect.runPromise(Effect.flip(accept(forgedActor)))
    const deviceError = await Effect.runPromise(
      Effect.flip(accept(forgedDevice)),
    )
    const processorError = await Effect.runPromise(
      Effect.flip(accept(forgedProcessor)),
    )

    expect(actorError._tag).toBe('SharedProgramCodecError')
    expect(deviceError._tag).toBe('SharedProgramCodecError')
    expect(processorError._tag).toBe('SharedProgramCodecError')
  })

  it('accepts a historical event version inside the current Program session', async () => {
    const proposal = await makeProposal()
    const historical = withEnvelope(
      InstantMessageProposalRecord.make({
        ...proposal,
        eventId: 'InstantCounter.AdjustedCounter',
        eventVersion: 0,
        payloadJson: S.encodeSync(JsonString)({ delta: 1 }),
      }),
      envelope =>
        Processor.MessageEnvelope.make({
          ...envelope,
          eventId: 'InstantCounter.AdjustedCounter',
          eventVersion: 0,
        }),
    )
    const occurrence = await makeAcceptedOccurrence(historical)
    const decoded = await Effect.runPromise(codec.decodeAccepted(occurrence))

    expect(decoded.message).toStrictEqual(ClickedIncrement())
  })

  it('admits every ordinary schema-valid Message without a tag allowlist', async () => {
    const proposal = await makeProposal(
      AssignedEffect({
        kind: 'DeviceTimer',
        processorId: 'processor-browser',
        requestId: 'timer-1',
      }),
    )
    const acceptedJson = await Effect.runPromise(accept(proposal))
    const accepted = S.decodeUnknownSync(EnvelopeJson)(acceptedJson)

    expect(accepted.acceptedSequence).toStrictEqual(Option.some(1))
  })

  it('accepts a browser effect result from its authenticated assigned Processor', async () => {
    const proposal = await makeEffectResultProposal()
    const occurrence = await makeAcceptedOccurrence(proposal)
    const decoded = await Effect.runPromise(codec.decodeAccepted(occurrence))

    expect(decoded.message).toStrictEqual(
      SucceededEffect({
        kind: 'DeviceTimer',
        processorId: input.originatingProcessorId,
        requestId: 'effect-request-1',
        summary: 'Completed a browser timer.',
      }),
    )
  })

  it('rejects a browser effect result whose Message names a different Processor', async () => {
    const proposal = await makeEffectResultProposal('processor-attacker')
    const error = await Effect.runPromise(Effect.flip(accept(proposal)))

    expect(error).toMatchObject({
      _tag: 'SharedProgramCodecError',
      operation: 'AcceptEnvelope',
    })
  })

  it('rejects an effect result whose Message names a different request', async () => {
    const proposal = await makeEffectResultProposal()
    const mismatched = InstantMessageProposalRecord.make({
      ...proposal,
      effectRequestId: 'effect-request-attacker',
    })
    const error = await Effect.runPromise(Effect.flip(accept(mismatched)))

    expect(error).toMatchObject({
      _tag: 'SharedProgramCodecError',
      operation: 'AcceptEnvelope',
    })
  })

  it('rejects an effect result whose Message names a different effect kind', async () => {
    const proposal = await makeEffectResultProposal(
      input.originatingProcessorId,
      'Vibration',
    )
    const error = await Effect.runPromise(Effect.flip(accept(proposal)))

    expect(error).toMatchObject({
      _tag: 'SharedProgramCodecError',
      operation: 'AcceptEnvelope',
    })
  })

  it('rejects an accepted row whose indexed provenance diverges from its envelope', async () => {
    const proposal = await makeProposal()
    const occurrence = await makeAcceptedOccurrence(proposal)
    const forged = InstantAcceptedMessageOccurrenceRecord.make({
      ...occurrence,
      originDeviceId: 'device-attacker',
    })
    const error = await Effect.runPromise(
      Effect.flip(codec.decodeAccepted(forged)),
    )

    expect(error).toMatchObject({
      _tag: 'SharedProgramCodecError',
      operation: 'DecodeAccepted',
    })
  })
})
