import { Context, Data, Effect, Schema as S, Stream } from 'effect'

import {
  type InstantAcceptedMessageOccurrenceRecord,
  type InstantEffectRequestRecord,
  type InstantMessageProposalRecord,
  type InstantProjectionCheckpointRecord,
} from '../schema/index.js'

const EnqueuedTransactionOutcome = S.TaggedStruct('Enqueued', {
  clientId: S.String,
})

const SyncedTransactionOutcome = S.TaggedStruct('Synced', {
  clientId: S.String,
})

/** Whether InstantDB synchronized a transaction or retained it in the local outbox. */
export const ProgramStoreTransactionOutcome = S.Union([
  EnqueuedTransactionOutcome,
  SyncedTransactionOutcome,
])
/** Whether InstantDB synchronized a transaction or retained it in the local outbox. */
export type ProgramStoreTransactionOutcome =
  typeof ProgramStoreTransactionOutcome.Type

/** Constructs an outcome for a transaction retained in the local outbox. */
export const enqueuedTransactionOutcome = (
  clientId: string,
): ProgramStoreTransactionOutcome =>
  EnqueuedTransactionOutcome.make({ clientId })

/** Constructs an outcome for a transaction synchronized with InstantDB. */
export const syncedTransactionOutcome = (
  clientId: string,
): ProgramStoreTransactionOutcome => SyncedTransactionOutcome.make({ clientId })

/** A durable Program store operation failed. */
export class ProgramStoreError extends Data.TaggedError('ProgramStoreError')<{
  readonly cause: unknown
  readonly operation:
    | 'AppendAcceptedMessageOccurrence'
    | 'AppendEffectRequest'
    | 'AppendMessageProposal'
    | 'AppendProjectionCheckpoint'
    | 'ObserveAcceptedMessageOccurrences'
    | 'ObserveEffectRequests'
    | 'ObserveMessageProposals'
    | 'ObserveProjectionCheckpoints'
}> {}

/** The transport-neutral durable storage capability required by Program synchronization. */
export type ProgramStoreService = Readonly<{
  appendAcceptedMessageOccurrence: (
    record: InstantAcceptedMessageOccurrenceRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  appendEffectRequest: (
    record: InstantEffectRequestRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  appendMessageProposal: (
    record: InstantMessageProposalRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  appendProjectionCheckpoint: (
    record: InstantProjectionCheckpointRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  observeAcceptedMessageOccurrences: (
    sessionId: string,
  ) => Stream.Stream<
    ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    ProgramStoreError
  >
  observeEffectRequests: (
    sessionId: string,
  ) => Stream.Stream<
    ReadonlyArray<InstantEffectRequestRecord>,
    ProgramStoreError
  >
  observeMessageProposals: (
    sessionId: string,
  ) => Stream.Stream<
    ReadonlyArray<InstantMessageProposalRecord>,
    ProgramStoreError
  >
  observeProjectionCheckpoints: (
    sessionId: string,
  ) => Stream.Stream<
    ReadonlyArray<InstantProjectionCheckpointRecord>,
    ProgramStoreError
  >
}>

/** The durable Program store implementation selected by a Client. */
export class ProgramStore extends Context.Service<
  ProgramStore,
  ProgramStoreService
>()('@foldkit/instant/ProgramStore') {}
