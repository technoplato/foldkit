import { Context, Data, Effect, Schema as S, Stream } from 'effect'

import {
  type InstantAcceptedMessageOccurrenceRecord,
  type InstantEffectPlacementRecord,
  type InstantEffectRequestRecord,
  type InstantMessageProposalRecord,
  type InstantProgramSessionRecord,
  type InstantProjectionCheckpointRecord,
} from '../schema/index.js'

/** The authenticated subject and Program session isolated by every store query. */
export const ProgramStoreScope = S.Struct({
  sessionId: S.String,
  subjectId: S.String,
})
/** The authenticated subject and Program session isolated by every store query. */
export type ProgramStoreScope = typeof ProgramStoreScope.Type

/** The real connection state reported by the host's Instant transport. */
export const ProgramStoreConnectionStatus = S.Literals([
  'connecting',
  'opened',
  'authenticated',
  'closed',
  'errored',
])
/** The real connection state reported by the host's Instant transport. */
export type ProgramStoreConnectionStatus =
  typeof ProgramStoreConnectionStatus.Type

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
    | 'AppendEffectPlacement'
    | 'AppendEffectRequest'
    | 'AppendMessageProposal'
    | 'AppendProgramSession'
    | 'AppendProjectionCheckpoint'
    | 'ObserveAcceptedMessageOccurrences'
    | 'ObserveEffectPlacements'
    | 'ObserveEffectRequests'
    | 'ObserveMessageProposals'
    | 'ObserveProgramSessions'
    | 'ObserveProjectionCheckpoints'
}> {}

/** The transport-neutral durable storage capability required by Program synchronization. */
export type ProgramStoreService = Readonly<{
  appendAcceptedMessageOccurrence: (
    record: InstantAcceptedMessageOccurrenceRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  appendEffectPlacement: (
    record: InstantEffectPlacementRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  appendEffectRequest: (
    record: InstantEffectRequestRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  appendMessageProposal: (
    record: InstantMessageProposalRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  appendProgramSession: (
    record: InstantProgramSessionRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  appendProjectionCheckpoint: (
    record: InstantProjectionCheckpointRecord,
  ) => Effect.Effect<ProgramStoreTransactionOutcome, ProgramStoreError>
  observeAcceptedMessageOccurrences: (
    scope: ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    ProgramStoreError
  >
  observeConnectionStatus: Stream.Stream<ProgramStoreConnectionStatus>
  observeEffectPlacements: (
    scope: ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantEffectPlacementRecord>,
    ProgramStoreError
  >
  observeEffectRequests: (
    scope: ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantEffectRequestRecord>,
    ProgramStoreError
  >
  observeMessageProposals: (
    scope: ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantMessageProposalRecord>,
    ProgramStoreError
  >
  observeProgramSessions: (
    scope: ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantProgramSessionRecord>,
    ProgramStoreError
  >
  observeProjectionCheckpoints: (
    scope: ProgramStoreScope,
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
