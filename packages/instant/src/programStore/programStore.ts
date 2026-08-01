import { Context, Data, Effect, Schema as S, Stream } from 'effect'

import {
  type InstantAcceptedMessageOccurrenceRecord,
  type InstantEffectPlacementRecord,
  type InstantEffectRequestRecord,
  type InstantMessageProposalRecord,
  type InstantMessageProposalResolutionRecord,
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

/** A transaction confirmed by the authoritative server. */
export const ProgramStoreSyncedTransactionOutcome = S.TaggedStruct('Synced', {
  clientId: S.String,
})
/** A transaction confirmed by the authoritative server. */
export type ProgramStoreSyncedTransactionOutcome =
  typeof ProgramStoreSyncedTransactionOutcome.Type

/** Whether InstantDB synchronized a transaction or retained it in the local outbox. */
export const ProgramStoreTransactionOutcome = S.Union([
  EnqueuedTransactionOutcome,
  ProgramStoreSyncedTransactionOutcome,
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
): ProgramStoreSyncedTransactionOutcome =>
  ProgramStoreSyncedTransactionOutcome.make({ clientId })

/** A durable Program store operation failed. */
export class ProgramStoreError extends Data.TaggedError('ProgramStoreError')<{
  readonly cause: unknown
  readonly operation:
    | 'AppendAcceptedMessageOccurrence'
    | 'AppendEffectPlacement'
    | 'AppendEffectRequest'
    | 'AppendMessageProposal'
    | 'AppendMessageProposalResolution'
    | 'AppendProgramSession'
    | 'AppendProjectionCheckpoint'
    | 'ObserveAcceptedMessageOccurrences'
    | 'ObserveEffectPlacements'
    | 'ObserveEffectRequests'
    | 'ObserveMessageProposals'
    | 'ObserveMessageProposalResolutions'
    | 'ObserveProgramSessions'
    | 'ObserveProjectionCheckpoints'
}> {}

/** Instant rejected and rolled back one locally optimistic proposal mutation. */
export class ProgramStoreProposalMutationRejected extends Data.TaggedError(
  'ProgramStoreProposalMutationRejected',
)<{
  readonly cause: unknown
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
  ) => Effect.Effect<
    ProgramStoreTransactionOutcome,
    ProgramStoreError | ProgramStoreProposalMutationRejected
  >
  appendMessageProposalResolution: (
    record: InstantMessageProposalResolutionRecord,
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
  observeMessageProposalResolutions: (
    scope: ProgramStoreScope,
  ) => Stream.Stream<
    ReadonlyArray<InstantMessageProposalResolutionRecord>,
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

/** Server-confirmed observations available only to an authoritative host store. */
export type ProgramAuthorityStoreObservations = Readonly<{
  observeAcceptedMessageOccurrences: ProgramStoreService['observeAcceptedMessageOccurrences']
  observeConnectionStatus: ProgramStoreService['observeConnectionStatus']
  observeEffectPlacements: ProgramStoreService['observeEffectPlacements']
  observeEffectRequests: ProgramStoreService['observeEffectRequests']
  observeMessageProposals: ProgramStoreService['observeMessageProposals']
  observeMessageProposalResolutions: ProgramStoreService['observeMessageProposalResolutions']
  observeProgramSessions: ProgramStoreService['observeProgramSessions']
  observeProjectionCheckpoints: ProgramStoreService['observeProjectionCheckpoints']
}>

/**
 * The server-confirmed storage capability required by admission and placement
 * authorities. Optimistic Client stores intentionally do not implement it.
 */
export type ProgramAuthorityStoreService = ProgramStoreService &
  Readonly<{
    appendServerConfirmedAcceptedMessageOccurrence: (
      record: InstantAcceptedMessageOccurrenceRecord,
    ) => Effect.Effect<ProgramStoreSyncedTransactionOutcome, ProgramStoreError>
    appendServerConfirmedEffectPlacement: (
      record: InstantEffectPlacementRecord,
    ) => Effect.Effect<ProgramStoreSyncedTransactionOutcome, ProgramStoreError>
    appendServerConfirmedEffectRequest: (
      record: InstantEffectRequestRecord,
    ) => Effect.Effect<ProgramStoreSyncedTransactionOutcome, ProgramStoreError>
    appendServerConfirmedMessageProposalResolution: (
      record: InstantMessageProposalResolutionRecord,
    ) => Effect.Effect<ProgramStoreSyncedTransactionOutcome, ProgramStoreError>
    serverConfirmed: ProgramAuthorityStoreObservations
  }>

/** The durable Program store implementation selected by a Client. */
export class ProgramStore extends Context.Service<
  ProgramStore,
  ProgramStoreService
>()('@foldkit/instant/ProgramStore') {}

/** The authoritative server-confirmed Program store selected by a trusted host. */
export class ProgramAuthorityStore extends Context.Service<
  ProgramAuthorityStore,
  ProgramAuthorityStoreService
>()('@foldkit/instant/ProgramAuthorityStore') {}
