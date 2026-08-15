/**
 * Same-actor Instant Program tape.
 * This module is the `@foldkit/instant/sharing` package.
 * Instant holds one Message list. The host writes before update and after
 * update. This service never calls update.
 */
import {
  Array,
  Effect,
  Option,
  Schema as S,
  Stream,
  SubscriptionRef,
} from 'effect'
import { Processor, Synchronization } from 'foldkit'

import { makeAcceptedOccurrencePositionKey } from '../acceptedOccurrenceCursor/index.js'
import {
  ProgramStoreError,
  type ProgramStoreScope,
  type ProgramStoreService,
  type ProgramStoreTransactionOutcome,
} from '../programStore/index.js'
import {
  InstantAcceptedMessageOccurrenceRecord,
  InstantMessageProposalRecord,
  instantProgramProtocolVersion,
} from '../schema/index.js'

/** Instant delivery of one tape write. Offline is a valid local append. */
export const TapeLink = S.Literals(['offline', 'queued', 'delivered'])

/** Instant delivery of one tape write. Offline is a valid local append. */
export type TapeLink = typeof TapeLink.Type

/** Maps an Instant Program store outcome onto a tape link. */
export const tapeLinkFromOutcome = (
  outcome: ProgramStoreTransactionOutcome,
): TapeLink => {
  if (outcome._tag === 'Synced') {
    return 'delivered'
  }
  return 'queued'
}

/**
 * Host identity written onto every same-actor proposal and accepted
 * occurrence. Session audience sends the Message to every Processor.
 */
export const SharedProgramTapeIdentity = S.Struct({
  actor: Processor.Actor,
  actorId: S.String,
  clientId: Processor.ClientId,
  originDeviceId: Processor.DeviceId,
  originatingProcessorId: Processor.ProcessorId,
  programId: S.String,
  programVersion: S.Int,
  sessionId: S.String,
  subjectId: S.String,
})

/**
 * Host identity written onto every same-actor proposal and accepted
 * occurrence. Session audience sends the Message to every Processor.
 */
export type SharedProgramTapeIdentity = typeof SharedProgramTapeIdentity.Type

/** One Message written to the Instant tape around a pure update. */
export type SharedProgramTapeCommit<A> = Readonly<{
  accepted: TapeLink
  proposed: TapeLink
  result: A
}>

/**
 * Same-actor Instant Program tape. The host writes the Message before
 * update and after update. This service never calls update.
 */
export type SharedProgramTape<Message> = Readonly<{
  appendAcceptedMessage: (
    message: Message,
  ) => Effect.Effect<TapeLink, ProgramStoreError>
  appendProposedMessage: (
    message: Message,
  ) => Effect.Effect<TapeLink, ProgramStoreError>
  observeAcceptedMessages: Stream.Stream<
    ReadonlyArray<Message>,
    ProgramStoreError
  >
  observeAcceptedOccurrences: Stream.Stream<
    ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    ProgramStoreError
  >
  readAcceptedMessages: Effect.Effect<ReadonlyArray<Message>, ProgramStoreError>
  readAcceptedOccurrences: Effect.Effect<
    ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    ProgramStoreError
  >
  readProposedOccurrences: Effect.Effect<
    ReadonlyArray<InstantMessageProposalRecord>,
    ProgramStoreError
  >
  scope: ProgramStoreScope
}>

/** Options for a Program-store-backed same-actor tape. */
export type SharedProgramTapeConfig<Message> = Readonly<{
  Message: S.Codec<Message, unknown, never, never>
  eventId: (message: Message) => string
  eventVersion?: number
  identity: SharedProgramTapeIdentity
  link?: TapeLink
  makeId: () => string
  now: () => number
  store: ProgramStoreService
}>

const EnvelopeJson = S.fromJsonString(Processor.MessageEnvelope)

const sessionAudience = Synchronization.SessionAudience.make({})

const mirrorPolicy = Synchronization.SessionPolicy.make({
  generation: 0,
  mode: Synchronization.Mirror.make({}),
})

const firstEmission = <A, E>(
  stream: Stream.Stream<A, E>,
): Effect.Effect<A, E> =>
  Stream.runHead(stream).pipe(
    Effect.flatMap(maybeValue => {
      if (Option.isSome(maybeValue)) {
        return Effect.succeed(maybeValue.value)
      }
      return Effect.die(new Error('Program store observation closed.'))
    }),
  )

const encodeEnvelope = (
  identity: SharedProgramTapeIdentity,
  params: Readonly<{
    acceptedAtMs: Option.Option<number>
    acceptedSequence: Option.Option<number>
    actorSequence: number
    createdAtMs: number
    eventId: string
    eventVersion: number
    occurrenceId: string
  }>,
): string =>
  S.encodeSync(EnvelopeJson)(
    Processor.MessageEnvelope.make({
      acceptedAtMs: params.acceptedAtMs,
      acceptedSequence: params.acceptedSequence,
      actor: identity.actor,
      causationOccurrenceId: Option.none(),
      correlationId: Option.none(),
      createdAtMs: params.createdAtMs,
      eventId: params.eventId,
      eventVersion: params.eventVersion,
      formatVersion: 1,
      ingressProcessorId: identity.originatingProcessorId,
      occurrenceId: params.occurrenceId,
      originClientId: identity.clientId,
      originDeviceId: identity.originDeviceId,
      originSequence: params.actorSequence,
      programId: identity.programId,
      programVersion: identity.programVersion,
      sessionId: identity.sessionId,
    }),
  )

const linkFor = (
  configured: TapeLink | undefined,
  outcome: ProgramStoreTransactionOutcome,
): TapeLink => {
  if (configured !== undefined) {
    return configured
  }
  return tapeLinkFromOutcome(outcome)
}

/** Newest accepted sequence on a same-actor tape. Empty history is 0. */
export const lastAcceptedSequence = (
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
): number =>
  Option.getOrElse(
    Option.map(
      Array.last(occurrences),
      occurrence => occurrence.acceptedSequence,
    ),
    () => 0,
  )

/**
 * Builds a same-actor Instant tape over an existing Program store.
 * Instant is the only durable adapter. Do not invent a second database.
 */
export const makeSharedProgramTape = <Message>(
  config: SharedProgramTapeConfig<Message>,
): Effect.Effect<SharedProgramTape<Message>> =>
  Effect.gen(function* () {
    const eventVersion = config.eventVersion ?? 1
    const PayloadJson = S.fromJsonString(config.Message)
    const scope: ProgramStoreScope = {
      sessionId: config.identity.sessionId,
      subjectId: config.identity.subjectId,
    }
    const pendingProposal = yield* SubscriptionRef.make<
      Option.Option<InstantMessageProposalRecord>
    >(Option.none())

    const decodePayload = (
      payloadJson: string,
    ): Effect.Effect<Message, ProgramStoreError> =>
      Effect.try({
        try: () => S.decodeSync(PayloadJson)(payloadJson),
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'ObserveAcceptedMessageOccurrences',
          }),
      })

    const decodeOccurrences = (
      occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    ): Effect.Effect<ReadonlyArray<Message>, ProgramStoreError> =>
      Effect.forEach(occurrences, occurrence =>
        decodePayload(occurrence.payloadJson),
      )

    const readAcceptedOccurrences = firstEmission(
      config.store.observeAcceptedMessageOccurrences(scope),
    )

    const readProposedOccurrences = firstEmission(
      config.store.observeMessageProposals(scope),
    )

    const appendProposedMessage = (
      message: Message,
    ): Effect.Effect<TapeLink, ProgramStoreError> =>
      Effect.gen(function* () {
        const proposed = yield* readProposedOccurrences
        const actorSequence = proposed.length + 1
        const occurrenceId = config.makeId()
        const createdAtMs = config.now()
        const eventId = config.eventId(message)
        const envelopeJson = encodeEnvelope(config.identity, {
          acceptedAtMs: Option.none(),
          acceptedSequence: Option.none(),
          actorSequence,
          createdAtMs,
          eventId,
          eventVersion,
          occurrenceId,
        })
        const record = InstantMessageProposalRecord.make({
          actorId: config.identity.actorId,
          actorSequence,
          causationOccurrenceId: null,
          clientId: config.identity.clientId,
          correlationId: null,
          createdAtMs,
          effectAssignmentGeneration: null,
          effectCancellationGeneration: null,
          effectIdempotencyKey: null,
          effectRequestId: null,
          envelopeJson,
          envelopeVersion: 1,
          eventId,
          eventVersion,
          executorProcessorId: null,
          id: occurrenceId,
          messageCategory: 'Domain',
          messageIdempotencyKey: null,
          occurrenceId,
          originDeviceId: config.identity.originDeviceId,
          originatingProcessorId: config.identity.originatingProcessorId,
          payloadJson: S.encodeSync(PayloadJson)(message),
          policyGeneration: mirrorPolicy.generation,
          programId: config.identity.programId,
          programVersion: config.identity.programVersion,
          proposalId: occurrenceId,
          proposalKind: 'Message',
          proposedAudience: sessionAudience,
          protocolVersion: instantProgramProtocolVersion,
          sessionId: config.identity.sessionId,
          subjectId: config.identity.subjectId,
        })
        const outcome = yield* config.store.appendMessageProposal(record).pipe(
          Effect.mapError(error =>
            error instanceof ProgramStoreError
              ? error
              : new ProgramStoreError({
                  cause: error,
                  operation: 'AppendMessageProposal',
                }),
          ),
        )
        yield* SubscriptionRef.set(pendingProposal, Option.some(record))
        return linkFor(config.link, outcome)
      })

    const appendAcceptedMessage = (
      message: Message,
    ): Effect.Effect<TapeLink, ProgramStoreError> =>
      Effect.gen(function* () {
        const maybeProposal = yield* SubscriptionRef.get(pendingProposal)
        const accepted = yield* readAcceptedOccurrences
        const nextSequence = lastAcceptedSequence(accepted) + 1
        const createdAtMs = config.now()
        const eventId = config.eventId(message)
        const proposal = Option.getOrElse(maybeProposal, () => {
          const occurrenceId = config.makeId()
          return InstantMessageProposalRecord.make({
            actorId: config.identity.actorId,
            actorSequence: nextSequence,
            causationOccurrenceId: null,
            clientId: config.identity.clientId,
            correlationId: null,
            createdAtMs,
            effectAssignmentGeneration: null,
            effectCancellationGeneration: null,
            effectIdempotencyKey: null,
            effectRequestId: null,
            envelopeJson: encodeEnvelope(config.identity, {
              acceptedAtMs: Option.none(),
              acceptedSequence: Option.none(),
              actorSequence: nextSequence,
              createdAtMs,
              eventId,
              eventVersion,
              occurrenceId,
            }),
            envelopeVersion: 1,
            eventId,
            eventVersion,
            executorProcessorId: null,
            id: occurrenceId,
            messageCategory: 'Domain',
            messageIdempotencyKey: null,
            occurrenceId,
            originDeviceId: config.identity.originDeviceId,
            originatingProcessorId: config.identity.originatingProcessorId,
            payloadJson: S.encodeSync(PayloadJson)(message),
            policyGeneration: mirrorPolicy.generation,
            programId: config.identity.programId,
            programVersion: config.identity.programVersion,
            proposalId: occurrenceId,
            proposalKind: 'Message',
            proposedAudience: sessionAudience,
            protocolVersion: instantProgramProtocolVersion,
            sessionId: config.identity.sessionId,
            subjectId: config.identity.subjectId,
          })
        })
        const acceptedAtMs = config.now()
        const envelopeJson = encodeEnvelope(config.identity, {
          acceptedAtMs: Option.some(acceptedAtMs),
          acceptedSequence: Option.some(nextSequence),
          actorSequence: proposal.actorSequence,
          createdAtMs: proposal.createdAtMs,
          eventId: proposal.eventId,
          eventVersion: proposal.eventVersion,
          occurrenceId: proposal.occurrenceId,
        })
        const record = InstantAcceptedMessageOccurrenceRecord.make({
          acceptedAtMs,
          acceptedSequence: nextSequence,
          acceptingProcessorId: config.identity.originatingProcessorId,
          actorId: proposal.actorId,
          actorSequence: proposal.actorSequence,
          audience: sessionAudience,
          causationId: proposal.proposalId,
          clientId: proposal.clientId,
          correlationId: null,
          createdAtMs: proposal.createdAtMs,
          effectAssignmentGeneration: null,
          effectCancellationGeneration: null,
          effectIdempotencyKey: null,
          effectRequestId: null,
          envelopeJson,
          envelopeVersion: proposal.envelopeVersion,
          eventId: proposal.eventId,
          eventVersion: proposal.eventVersion,
          executorProcessorId: null,
          id: proposal.occurrenceId,
          messageCategory: proposal.messageCategory,
          messageIdempotencyKey: null,
          occurrenceId: proposal.occurrenceId,
          originDeviceId: proposal.originDeviceId,
          originatingProcessorId: proposal.originatingProcessorId,
          payloadJson: S.encodeSync(PayloadJson)(message),
          policyGeneration: proposal.policyGeneration,
          positionKey: makeAcceptedOccurrencePositionKey(
            proposal.sessionId,
            nextSequence,
          ),
          programId: proposal.programId,
          programVersion: proposal.programVersion,
          proposalId: proposal.proposalId,
          proposalKind: proposal.proposalKind,
          proposedEnvelopeJson: proposal.envelopeJson,
          protocolVersion: proposal.protocolVersion,
          sessionId: proposal.sessionId,
          sessionPolicy: mirrorPolicy,
          subjectId: proposal.subjectId,
        })
        const outcome =
          yield* config.store.appendAcceptedMessageOccurrence(record)
        yield* SubscriptionRef.set(pendingProposal, Option.none())
        return linkFor(config.link, outcome)
      })

    return {
      appendAcceptedMessage,
      appendProposedMessage,
      observeAcceptedMessages: config.store
        .observeAcceptedMessageOccurrences(scope)
        .pipe(Stream.mapEffect(decodeOccurrences)),
      observeAcceptedOccurrences:
        config.store.observeAcceptedMessageOccurrences(scope),
      readAcceptedMessages: Effect.flatMap(
        readAcceptedOccurrences,
        decodeOccurrences,
      ),
      readAcceptedOccurrences,
      readProposedOccurrences,
      scope,
    }
  })

/**
 * Writes the Message before update and after update. The supplied
 * `applyUpdate` is the host's pure Program step.
 */
export const commitSharedMessage = <Message, A, E = never, R = never>(
  tape: SharedProgramTape<Message>,
  message: Message,
  applyUpdate: () => Effect.Effect<A, E, R>,
): Effect.Effect<SharedProgramTapeCommit<A>, ProgramStoreError | E, R> =>
  Effect.gen(function* () {
    const proposed = yield* tape.appendProposedMessage(message)
    const result = yield* applyUpdate()
    const accepted = yield* tape.appendAcceptedMessage(message)
    return { accepted, proposed, result }
  })

/**
 * Applies remote accepted Messages after this Processor has folded history.
 * Skips this Processor's own writes. The host still calls update.
 */
export const observeRemoteAcceptedMessages = <
  Message,
  E = never,
  R = never,
>(
  tape: SharedProgramTape<Message>,
  originatingProcessorId: string,
  applyMessage: (
    message: Message,
    occurrence: InstantAcceptedMessageOccurrenceRecord,
  ) => Effect.Effect<void, E, R>,
): Effect.Effect<void, ProgramStoreError | E, R> =>
  Effect.gen(function* () {
    const startOccurrences = yield* tape.readAcceptedOccurrences
    let appliedSequence = lastAcceptedSequence(startOccurrences)
    yield* tape.observeAcceptedOccurrences.pipe(
      Stream.runForEach(occurrences =>
        Effect.forEach(occurrences, occurrence => {
          if (occurrence.acceptedSequence <= appliedSequence) {
            return Effect.void
          }
          if (occurrence.originatingProcessorId === originatingProcessorId) {
            appliedSequence = occurrence.acceptedSequence
            return Effect.void
          }
          return Effect.gen(function* () {
            const messages = yield* tape.readAcceptedMessages
            const maybeMessage = Array.get(
              messages,
              occurrence.acceptedSequence - 1,
            )
            if (Option.isNone(maybeMessage)) {
              return
            }
            yield* applyMessage(maybeMessage.value, occurrence)
            appliedSequence = occurrence.acceptedSequence
          })
        }),
      ),
    )
  })

/**
 * InstantRules fragment for same-actor Program tape rows.
 * The authenticated subject is the admission writer for one programId.
 */
export const sameActorProgramTapePermissions = (
  programId: string,
): Readonly<{
  foldkitAcceptedMessageOccurrences: Readonly<{
    allow: Readonly<{
      create: string
      delete: string
      update: string
      view: string
    }>
  }>
  foldkitMessageProposals: Readonly<{
    allow: Readonly<{
      create: string
      delete: string
      update: string
      view: string
    }>
  }>
}> => {
  const ownsSameActorProgram = `auth.id != null && auth.id == data.subjectId && data.programId == '${programId}'`
  return {
    foldkitAcceptedMessageOccurrences: {
      allow: {
        create: ownsSameActorProgram,
        delete: 'false',
        update: 'false',
        view: ownsSameActorProgram,
      },
    },
    foldkitMessageProposals: {
      allow: {
        create: ownsSameActorProgram,
        delete: 'false',
        update: 'false',
        view: ownsSameActorProgram,
      },
    },
  }
}
