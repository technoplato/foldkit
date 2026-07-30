import { Effect, Option, Schema as S } from 'effect'
import { Processor, Program } from 'foldkit'

import {
  type InstantEffectRequestRecord,
  SharedProgramCodecError,
  type SharedProgramMessageCodec,
} from '@foldkit/instant'

import { effectIdForKind } from '../domain/effect.js'
import type { Message } from '../domain/message.js'
import { EventRegistry, encodeMessage } from '../domain/wire.js'

const EnvelopeJson = S.fromJsonString(Processor.MessageEnvelope)
const JsonString = S.fromJsonString(S.Json)

/** Immutable host provenance captured by the shared Program codec. */
export type MessageCodecOrigin = Readonly<{
  actor: Processor.Actor
}>

const nullableEqualsOption = (
  value: string | null,
  maybeValue: Option.Option<string>,
): boolean => value === Option.getOrNull(maybeValue)

const actorMatchesRecord = (
  actor: Processor.Actor,
  record: Readonly<{
    actorId: string
    originatingProcessorId: string
    subjectId: string
  }>,
): boolean => {
  if (actor._tag === 'Authenticated') {
    return (
      actor.subjectId === record.subjectId && actor.subjectId === record.actorId
    )
  }
  if (actor._tag === 'System') {
    return (
      actor.processorId === record.actorId &&
      actor.processorId === record.originatingProcessorId
    )
  }
  return false
}

const assertEnvelopeMatchesProposal = (
  envelope: Processor.MessageEnvelope,
  proposal: import('@foldkit/instant').InstantMessageProposalRecord,
): void => {
  if (Option.isSome(envelope.acceptedAtMs)) {
    throw new Error('Proposed envelope already has acceptedAtMs.')
  }
  if (Option.isSome(envelope.acceptedSequence)) {
    throw new Error('Proposed envelope already has acceptedSequence.')
  }
  if (!actorMatchesRecord(envelope.actor, proposal)) {
    throw new Error('Proposed envelope actor does not match its proposal.')
  }
  if (envelope.formatVersion !== proposal.envelopeVersion) {
    throw new Error('Proposed envelope formatVersion does not match.')
  }
  if (envelope.occurrenceId !== proposal.occurrenceId) {
    throw new Error('Proposed envelope occurrenceId does not match.')
  }
  if (envelope.programId !== proposal.programId) {
    throw new Error('Proposed envelope programId does not match.')
  }
  if (envelope.programVersion !== proposal.programVersion) {
    throw new Error('Proposed envelope programVersion does not match.')
  }
  if (envelope.eventId !== proposal.eventId) {
    throw new Error('Proposed envelope eventId does not match.')
  }
  if (envelope.eventVersion !== proposal.eventVersion) {
    throw new Error('Proposed envelope eventVersion does not match.')
  }
  if (envelope.originClientId !== proposal.clientId) {
    throw new Error('Proposed envelope originClientId does not match.')
  }
  if (envelope.originDeviceId !== proposal.originDeviceId) {
    throw new Error('Proposed envelope originDeviceId does not match.')
  }
  if (envelope.ingressProcessorId !== proposal.originatingProcessorId) {
    throw new Error('Proposed envelope ingressProcessorId does not match.')
  }
  if (envelope.sessionId !== proposal.sessionId) {
    throw new Error('Proposed envelope sessionId does not match.')
  }
  if (envelope.originSequence !== proposal.actorSequence) {
    throw new Error('Proposed envelope originSequence does not match.')
  }
  if (envelope.createdAtMs !== proposal.createdAtMs) {
    throw new Error('Proposed envelope createdAtMs does not match.')
  }
  if (
    !nullableEqualsOption(
      proposal.causationOccurrenceId,
      envelope.causationOccurrenceId,
    )
  ) {
    throw new Error('Proposed envelope causationOccurrenceId does not match.')
  }
  if (!nullableEqualsOption(proposal.correlationId, envelope.correlationId)) {
    throw new Error('Proposed envelope correlationId does not match.')
  }
}

const assertMessageAuthority = (
  message: Message,
  envelope: Processor.MessageEnvelope,
  proposal: import('@foldkit/instant').InstantMessageProposalRecord,
  acceptingProcessorId: string,
  effectRequest: InstantEffectRequestRecord | undefined,
): void => {
  if (
    message._tag === 'ClickedDecrement' ||
    message._tag === 'ClickedIncrement' ||
    message._tag === 'ClickedReset' ||
    message._tag === 'RequestedEffect'
  ) {
    if (
      envelope.actor._tag !== 'Authenticated' ||
      proposal.proposalKind !== 'Message'
    ) {
      throw new Error(
        'A user-originated domain Message requires an authenticated actor.',
      )
    }
    return
  }
  if (
    message._tag === 'AssignedEffect' ||
    message._tag === 'WaitedForEffectProcessor' ||
    message._tag === 'RejectedEffect'
  ) {
    if (
      envelope.actor._tag !== 'System' ||
      envelope.actor.processorId !== acceptingProcessorId ||
      proposal.proposalKind !== 'Message'
    ) {
      throw new Error(
        'An effect placement fact requires the current acceptance authority.',
      )
    }
    return
  }
  if (
    proposal.proposalKind !== 'EffectResult' ||
    proposal.executorProcessorId === null ||
    effectRequest === undefined ||
    effectRequest.effectId !== effectIdForKind(message.kind) ||
    effectRequest.requestId !== message.requestId ||
    proposal.effectRequestId !== message.requestId ||
    proposal.executorProcessorId !== proposal.originatingProcessorId ||
    proposal.executorProcessorId !== message.processorId
  ) {
    throw new Error('An effect result requires its assigned Processor.')
  }
  if (
    envelope.actor._tag === 'System' &&
    proposal.executorProcessorId !== envelope.actor.processorId
  ) {
    throw new Error(
      'A system effect result requires its assigned system Processor.',
    )
  }
  if (
    envelope.actor._tag !== 'System' &&
    envelope.actor._tag !== 'Authenticated'
  ) {
    throw new Error(
      'An effect result requires an authenticated or system actor.',
    )
  }
}

const assertAcceptedEnvelopeMatchesOccurrence = (
  envelope: Processor.MessageEnvelope,
  occurrence: import('@foldkit/instant').InstantAcceptedMessageOccurrenceRecord,
): void => {
  if (!actorMatchesRecord(envelope.actor, occurrence)) {
    throw new Error('Accepted envelope actor does not match its occurrence.')
  }
  if (
    envelope.formatVersion !== occurrence.envelopeVersion ||
    envelope.occurrenceId !== occurrence.occurrenceId ||
    envelope.programId !== occurrence.programId ||
    envelope.programVersion !== occurrence.programVersion ||
    envelope.eventId !== occurrence.eventId ||
    envelope.eventVersion !== occurrence.eventVersion ||
    envelope.originClientId !== occurrence.clientId ||
    envelope.originDeviceId !== occurrence.originDeviceId ||
    envelope.ingressProcessorId !== occurrence.acceptingProcessorId ||
    envelope.sessionId !== occurrence.sessionId ||
    envelope.originSequence !== occurrence.actorSequence ||
    envelope.createdAtMs !== occurrence.createdAtMs ||
    !nullableEqualsOption(
      occurrence.causationId,
      envelope.causationOccurrenceId,
    ) ||
    !nullableEqualsOption(occurrence.correlationId, envelope.correlationId) ||
    Option.getOrNull(envelope.acceptedAtMs) !== occurrence.acceptedAtMs ||
    Option.getOrNull(envelope.acceptedSequence) !== occurrence.acceptedSequence
  ) {
    throw new Error(
      'Accepted envelope fields do not match their durable occurrence.',
    )
  }
}

const correlationForMessage = (
  message: Message,
  maybeCorrelationId: Option.Option<string>,
): Option.Option<string> => {
  if (Option.isSome(maybeCorrelationId)) {
    return maybeCorrelationId
  }
  if (
    message._tag === 'RequestedEffect' ||
    message._tag === 'SucceededEffect' ||
    message._tag === 'FailedEffect'
  ) {
    return Option.some(message.requestId)
  }
  return Option.none()
}

/** Builds the versioned Message codec shared by Clients and the authority. */
export const makeMessageCodec = (
  origin: MessageCodecOrigin,
): SharedProgramMessageCodec<Message, Processor.MessageEnvelope> => ({
  acceptEnvelope: (proposal, input) =>
    Effect.gen(function* () {
      const proposed = yield* Effect.try({
        try: () => ({
          envelope: S.decodeUnknownSync(EnvelopeJson)(proposal.envelopeJson),
          envelopeWire: S.decodeUnknownSync(JsonString)(proposal.envelopeJson),
          payloadWire: S.decodeUnknownSync(JsonString)(proposal.payloadJson),
        }),
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation: 'AcceptEnvelope',
          }),
      })
      const decoded = yield* Program.decodeVersionedEvent(EventRegistry, {
        envelope: proposed.envelopeWire,
        payload: proposed.payloadWire,
      }).pipe(
        Effect.mapError(
          cause =>
            new SharedProgramCodecError({
              cause,
              operation: 'AcceptEnvelope',
            }),
        ),
      )
      return yield* Effect.try({
        try: () => {
          assertEnvelopeMatchesProposal(proposed.envelope, proposal)
          assertMessageAuthority(
            decoded.message,
            proposed.envelope,
            proposal,
            input.acceptingProcessorId,
            input.effectRequest,
          )
          return S.encodeSync(EnvelopeJson)(
            Processor.MessageEnvelope.make({
              ...proposed.envelope,
              acceptedAtMs: Option.some(input.acceptedAtMs),
              acceptedSequence: Option.some(input.acceptedSequence),
              ingressProcessorId: input.acceptingProcessorId,
            }),
          )
        },
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation: 'AcceptEnvelope',
          }),
      })
    }),
  decodeAccepted: occurrence =>
    Effect.gen(function* () {
      const envelope = yield* Effect.try({
        try: () => S.decodeUnknownSync(JsonString)(occurrence.envelopeJson),
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation: 'DecodeAccepted',
          }),
      })
      const payload = yield* Effect.try({
        try: () => S.decodeUnknownSync(JsonString)(occurrence.payloadJson),
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation: 'DecodeAccepted',
          }),
      })
      const decoded = yield* Program.decodeVersionedEvent(EventRegistry, {
        envelope,
        payload,
      }).pipe(
        Effect.mapError(
          cause =>
            new SharedProgramCodecError({
              cause,
              operation: 'DecodeAccepted',
            }),
        ),
      )
      yield* Effect.try({
        try: () =>
          assertAcceptedEnvelopeMatchesOccurrence(decoded.envelope, occurrence),
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation: 'DecodeAccepted',
          }),
      })
      return {
        envelope: decoded.envelope,
        message: decoded.message,
      }
    }),
  encodeProposed: (message, input) =>
    Effect.try({
      try: () => {
        const encoded = encodeMessage(message)
        const correlationId = correlationForMessage(
          message,
          input.maybeCorrelationId,
        )
        const envelope = Processor.MessageEnvelope.make({
          acceptedAtMs: Option.none(),
          acceptedSequence: Option.none(),
          actor: origin.actor,
          causationOccurrenceId: input.maybeCausationOccurrenceId,
          correlationId,
          createdAtMs: input.createdAtMs,
          eventId: encoded.eventId,
          eventVersion: encoded.eventVersion,
          formatVersion: 1,
          ingressProcessorId: input.originatingProcessorId,
          occurrenceId: input.occurrenceId,
          originClientId: input.clientId,
          originDeviceId: input.originDeviceId,
          originSequence: input.actorSequence,
          programId: input.programId,
          programVersion: input.programVersion,
          sessionId: input.sessionId,
        })
        return {
          envelopeJson: S.encodeSync(EnvelopeJson)(envelope),
          envelopeVersion: envelope.formatVersion,
          eventId: encoded.eventId,
          eventVersion: encoded.eventVersion,
          payloadJson: S.encodeSync(JsonString)(encoded.payload),
        }
      },
      catch: cause =>
        new SharedProgramCodecError({
          cause,
          operation: 'EncodeProposed',
        }),
    }),
})
