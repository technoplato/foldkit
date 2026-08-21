import { Array, Effect, Order, Schema as S, Stream } from 'effect'

import { init } from '@instantdb/admin'

import {
  ProgramStore,
  ProgramStoreError,
  type ProgramStoreScope,
  type ProgramStoreService,
  syncedTransactionOutcome,
} from '../programStore/index.js'
import { InstantProgramSchema } from '../schema/index.js'
import {
  InstantAcceptedMessageOccurrenceRecord,
  InstantMessageProposalRecord,
} from '../schema/index.js'

const acceptedOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantAcceptedMessageOccurrenceRecord) => record.acceptedSequence,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantAcceptedMessageOccurrenceRecord) => record.occurrenceId,
  ),
)

const unusedOperation = (
  operation: ProgramStoreError['operation'],
): Effect.Effect<never, ProgramStoreError> =>
  Effect.fail(
    new ProgramStoreError({
      cause: new Error(`${operation} is not part of the admin Instant tape.`),
      operation,
    }),
  )

const decodeAccepted = (
  value: unknown,
): InstantAcceptedMessageOccurrenceRecord =>
  S.decodeUnknownSync(InstantAcceptedMessageOccurrenceRecord)(value)

const decodeProposal = (value: unknown): InstantMessageProposalRecord =>
  S.decodeUnknownSync(InstantMessageProposalRecord)(value)

/**
 * Instant admin Program store for trusted Node Processors.
 * Instant core skips storage on Node. Admin writes the same entity rows.
 */
export const makeAdminInstantProgramStore = (
  appId: string,
  adminToken: string,
): ProgramStoreService => {
  const admin = init({ adminToken, appId, schema: InstantProgramSchema })

  const queryAccepted = (
    scope: ProgramStoreScope,
  ): Effect.Effect<
    ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    ProgramStoreError
  > =>
    Effect.tryPromise({
      try: async () => {
        const result = await admin.query({
          foldkitAcceptedMessageOccurrences: {
            $: {
              where: {
                sessionId: scope.sessionId,
                subjectId: scope.subjectId,
              },
            },
          },
        })
        return Array.sort(
          result.foldkitAcceptedMessageOccurrences.map(decodeAccepted),
          acceptedOrder,
        )
      },
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'ObserveAcceptedMessageOccurrences',
        }),
    })

  const queryProposed = (
    scope: ProgramStoreScope,
  ): Effect.Effect<
    ReadonlyArray<InstantMessageProposalRecord>,
    ProgramStoreError
  > =>
    Effect.tryPromise({
      try: async () => {
        const result = await admin.query({
          foldkitMessageProposals: {
            $: {
              where: {
                sessionId: scope.sessionId,
                subjectId: scope.subjectId,
              },
            },
          },
        })
        return result.foldkitMessageProposals.map(decodeProposal)
      },
      catch: cause =>
        new ProgramStoreError({
          cause,
          operation: 'ObserveMessageProposals',
        }),
    })

  return ProgramStore.of({
    appendAcceptedMessageOccurrence: record =>
      Effect.tryPromise({
        try: async () => {
          const entity = admin.tx.foldkitAcceptedMessageOccurrences[record.id]
          if (entity === undefined) {
            throw new Error(
              'Expected an accepted occurrence transaction entity.',
            )
          }
          await admin.transact(
            entity.update({
              acceptedAtMs: record.acceptedAtMs,
              acceptedSequence: record.acceptedSequence,
              acceptingProcessorId: record.acceptingProcessorId,
              actorId: record.actorId,
              actorSequence: record.actorSequence,
              audience: record.audience,
              causationId: record.causationId,
              clientId: record.clientId,
              correlationId: record.correlationId,
              createdAtMs: record.createdAtMs,
              effectAssignmentGeneration: record.effectAssignmentGeneration,
              effectCancellationGeneration: record.effectCancellationGeneration,
              effectIdempotencyKey: record.effectIdempotencyKey,
              effectRequestId: record.effectRequestId,
              envelopeJson: record.envelopeJson,
              envelopeVersion: record.envelopeVersion,
              eventId: record.eventId,
              eventVersion: record.eventVersion,
              executorProcessorId: record.executorProcessorId,
              messageCategory: record.messageCategory,
              messageIdempotencyKey: record.messageIdempotencyKey,
              occurrenceId: record.occurrenceId,
              originDeviceId: record.originDeviceId,
              originatingProcessorId: record.originatingProcessorId,
              payloadJson: record.payloadJson,
              policyGeneration: record.policyGeneration,
              positionKey: record.positionKey,
              programId: record.programId,
              programVersion: record.programVersion,
              proposalId: record.proposalId,
              proposalKind: record.proposalKind,
              proposedEnvelopeJson: record.proposedEnvelopeJson,
              protocolVersion: record.protocolVersion,
              sessionId: record.sessionId,
              sessionPolicy: record.sessionPolicy,
              subjectId: record.subjectId,
            }),
          )
          return syncedTransactionOutcome('admin')
        },
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'AppendAcceptedMessageOccurrence',
          }),
      }),
    appendEffectPlacement: () => unusedOperation('AppendEffectPlacement'),
    appendEffectRequest: () => unusedOperation('AppendEffectRequest'),
    appendMessageProposal: record =>
      Effect.tryPromise({
        try: async () => {
          const entity = admin.tx.foldkitMessageProposals[record.id]
          if (entity === undefined) {
            throw new Error('Expected a Message proposal transaction entity.')
          }
          await admin.transact(
            entity.update({
              actorId: record.actorId,
              actorSequence: record.actorSequence,
              causationOccurrenceId: record.causationOccurrenceId,
              clientId: record.clientId,
              correlationId: record.correlationId,
              createdAtMs: record.createdAtMs,
              effectAssignmentGeneration: record.effectAssignmentGeneration,
              effectCancellationGeneration: record.effectCancellationGeneration,
              effectIdempotencyKey: record.effectIdempotencyKey,
              effectRequestId: record.effectRequestId,
              envelopeJson: record.envelopeJson,
              envelopeVersion: record.envelopeVersion,
              eventId: record.eventId,
              eventVersion: record.eventVersion,
              executorProcessorId: record.executorProcessorId,
              messageCategory: record.messageCategory,
              messageIdempotencyKey: record.messageIdempotencyKey,
              occurrenceId: record.occurrenceId,
              originDeviceId: record.originDeviceId,
              originatingProcessorId: record.originatingProcessorId,
              payloadJson: record.payloadJson,
              policyGeneration: record.policyGeneration,
              programId: record.programId,
              programVersion: record.programVersion,
              proposalId: record.proposalId,
              proposalKind: record.proposalKind,
              proposedAudience: record.proposedAudience,
              protocolVersion: record.protocolVersion,
              sessionId: record.sessionId,
              subjectId: record.subjectId,
            }),
          )
          return syncedTransactionOutcome('admin')
        },
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'AppendMessageProposal',
          }),
      }),
    appendMessageProposalResolution: () =>
      unusedOperation('AppendMessageProposalResolution'),
    appendProgramSession: () => unusedOperation('AppendProgramSession'),
    appendProjectionCheckpoint: () =>
      unusedOperation('AppendProjectionCheckpoint'),
    observeAcceptedMessageOccurrences: scope =>
      Stream.fromEffect(queryAccepted(scope)),
    observeConnectionStatus: Stream.succeed('authenticated'),
    observeEffectPlacements: () => Stream.empty,
    observeEffectRequests: () => Stream.empty,
    observeMessageProposalResolutions: () => Stream.empty,
    observeMessageProposals: scope => Stream.fromEffect(queryProposed(scope)),
    observeProgramSessions: () => Stream.empty,
    observeProjectionCheckpoints: () => Stream.empty,
  })
}
