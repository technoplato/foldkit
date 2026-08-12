import { Array, Cause, Effect, Queue, Schema as S, Stream } from 'effect'

import {
  InstantAcceptedMessageOccurrenceRecord,
  InstantEffectPlacementRecord,
  InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  InstantMessageProposalResolutionRecord,
  InstantProgramSessionRecord,
  InstantProjectionCheckpointRecord,
  ProgramAuthorityStore,
  type ProgramAuthorityStoreService,
  ProgramStore,
  ProgramStoreError,
  makeInstantAcceptedMessageOccurrenceTransaction,
  makeInstantEffectPlacementTransaction,
  makeInstantEffectRequestTransaction,
  makeInstantMessageProposalResolutionTransaction,
  makeInstantMessageProposalTransaction,
  makeInstantProgramSessionTransaction,
  makeInstantProjectionCheckpointTransaction,
  syncedTransactionOutcome,
} from '@foldkit/instant'
import type { InstantAdminDatabase } from '@instantdb/admin'

import { schema } from '../../instant.schema.js'

/** The admin database used only by the trusted headless process. */
export type HeadlessInstantDatabase = InstantAdminDatabase<typeof schema>

type ClosableSubscription = Readonly<{ close: () => void }>

const observeAdminQuery = <Record>(
  operation: ProgramStoreError['operation'],
  subscribe: (
    publish: (records: ReadonlyArray<Record>) => void,
    fail: (cause: unknown) => void,
  ) => ClosableSubscription,
): Stream.Stream<ReadonlyArray<Record>, ProgramStoreError> =>
  Stream.callback(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        subscribe(
          records => {
            Queue.offerUnsafe(queue, records)
          },
          cause => {
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(new ProgramStoreError({ cause, operation })),
            )
          },
        ),
      ),
      subscription => Effect.sync(() => subscription.close()),
    ),
  )

const decodeAcceptedOccurrences = (
  records: ReadonlyArray<
    Readonly<{
      causationId?: string
      correlationId?: string
      effectIdempotencyKey?: string
      effectAssignmentGeneration?: number
      effectCancellationGeneration?: number
      effectRequestId?: string
      executorProcessorId?: string
    }>
  >,
): ReadonlyArray<InstantAcceptedMessageOccurrenceRecord> =>
  Array.map(records, record =>
    S.decodeUnknownSync(InstantAcceptedMessageOccurrenceRecord)({
      ...record,
      causationId: record.causationId ?? null,
      correlationId: record.correlationId ?? null,
      effectIdempotencyKey: record.effectIdempotencyKey ?? null,
      effectAssignmentGeneration: record.effectAssignmentGeneration ?? null,
      effectCancellationGeneration: record.effectCancellationGeneration ?? null,
      effectRequestId: record.effectRequestId ?? null,
      executorProcessorId: record.executorProcessorId ?? null,
    }),
  )

const decodeEffectRequests = (
  records: ReadonlyArray<unknown>,
): ReadonlyArray<InstantEffectRequestRecord> =>
  Array.map(records, record =>
    S.decodeUnknownSync(InstantEffectRequestRecord)(record),
  )

const decodeEffectPlacements = (
  records: ReadonlyArray<Readonly<{ assignedProcessorId?: string }>>,
): ReadonlyArray<InstantEffectPlacementRecord> =>
  Array.map(records, record =>
    S.decodeUnknownSync(InstantEffectPlacementRecord)({
      ...record,
      assignedProcessorId: record.assignedProcessorId ?? null,
    }),
  )

const decodeMessageProposals = (
  records: ReadonlyArray<
    Readonly<{
      causationOccurrenceId?: string
      correlationId?: string
      effectIdempotencyKey?: string
      effectAssignmentGeneration?: number
      effectCancellationGeneration?: number
      effectRequestId?: string
      executorProcessorId?: string
    }>
  >,
): ReadonlyArray<InstantMessageProposalRecord> =>
  Array.map(records, record =>
    S.decodeUnknownSync(InstantMessageProposalRecord)({
      ...record,
      causationOccurrenceId: record.causationOccurrenceId ?? null,
      correlationId: record.correlationId ?? null,
      effectIdempotencyKey: record.effectIdempotencyKey ?? null,
      effectAssignmentGeneration: record.effectAssignmentGeneration ?? null,
      effectCancellationGeneration: record.effectCancellationGeneration ?? null,
      effectRequestId: record.effectRequestId ?? null,
      executorProcessorId: record.executorProcessorId ?? null,
    }),
  )

const decodeMessageProposalResolutions = (
  records: ReadonlyArray<unknown>,
): ReadonlyArray<InstantMessageProposalResolutionRecord> =>
  Array.map(records, record =>
    S.decodeUnknownSync(InstantMessageProposalResolutionRecord)(record),
  )

/** Observes every authenticated Program session managed by this demo app. */
export const observeAllProgramSessions = (
  database: HeadlessInstantDatabase,
): Stream.Stream<
  ReadonlyArray<InstantProgramSessionRecord>,
  ProgramStoreError
> =>
  observeAdminQuery('ObserveProgramSessions', (publish, fail) =>
    database.subscribeQuery(
      {
        foldkitProgramSessions: {
          $: { order: { createdAtMs: 'asc' } },
        },
      },
      payload => {
        if (payload.type === 'error') {
          fail(payload.error)
        } else {
          try {
            publish(
              Array.getSomes(
                Array.map(payload.data.foldkitProgramSessions, record =>
                  S.decodeUnknownOption(InstantProgramSessionRecord)(record),
                ),
              ),
            )
          } catch (cause) {
            fail(cause)
          }
        }
      },
    ),
  )

/** Adapts the trusted Instant admin client to Foldkit's ProgramStore contract. */
export const makeAdminProgramStore = (
  database: HeadlessInstantDatabase,
): ProgramAuthorityStoreService => {
  const store = ProgramStore.of({
    appendAcceptedMessageOccurrence: record =>
      Effect.tryPromise({
        try: () =>
          database
            .transact(
              makeInstantAcceptedMessageOccurrenceTransaction(
                database.tx,
                record,
              ),
            )
            .then(() => syncedTransactionOutcome('headless-admin')),
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'AppendAcceptedMessageOccurrence',
          }),
      }),
    appendEffectRequest: record =>
      Effect.tryPromise({
        try: () =>
          database
            .transact(makeInstantEffectRequestTransaction(database.tx, record))
            .then(() => syncedTransactionOutcome('headless-admin')),
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'AppendEffectRequest',
          }),
      }),
    appendEffectPlacement: record =>
      Effect.tryPromise({
        try: () =>
          database
            .transact(
              makeInstantEffectPlacementTransaction(database.tx, record),
            )
            .then(() => syncedTransactionOutcome('headless-admin')),
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'AppendEffectPlacement',
          }),
      }),
    appendMessageProposal: record =>
      Effect.tryPromise({
        try: () =>
          database
            .transact(
              makeInstantMessageProposalTransaction(database.tx, record),
            )
            .then(() => syncedTransactionOutcome('headless-admin')),
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'AppendMessageProposal',
          }),
      }),
    appendMessageProposalResolution: record =>
      Effect.tryPromise({
        try: () =>
          database
            .transact(
              makeInstantMessageProposalResolutionTransaction(
                database.tx,
                record,
              ),
            )
            .then(() => syncedTransactionOutcome('headless-admin')),
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'AppendMessageProposalResolution',
          }),
      }),
    appendProgramSession: record =>
      Effect.tryPromise({
        try: () =>
          database
            .transact(makeInstantProgramSessionTransaction(database.tx, record))
            .then(() => syncedTransactionOutcome('headless-admin')),
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'AppendProgramSession',
          }),
      }),
    appendProjectionCheckpoint: record =>
      Effect.tryPromise({
        try: () =>
          database
            .transact(
              makeInstantProjectionCheckpointTransaction(database.tx, record),
            )
            .then(() => syncedTransactionOutcome('headless-admin')),
        catch: cause =>
          new ProgramStoreError({
            cause,
            operation: 'AppendProjectionCheckpoint',
          }),
      }),
    observeAcceptedMessageOccurrences: scope =>
      observeAdminQuery('ObserveAcceptedMessageOccurrences', (publish, fail) =>
        database.subscribeQuery(
          {
            foldkitAcceptedMessageOccurrences: {
              $: {
                where: {
                  and: [
                    { sessionId: scope.sessionId },
                    { subjectId: scope.subjectId },
                  ],
                },
                order: { acceptedSequence: 'asc' },
              },
            },
          },
          payload => {
            if (payload.type === 'error') {
              fail(payload.error)
            } else {
              try {
                publish(
                  decodeAcceptedOccurrences(
                    payload.data.foldkitAcceptedMessageOccurrences,
                  ),
                )
              } catch (cause) {
                fail(cause)
              }
            }
          },
        ),
      ),
    observeConnectionStatus: Stream.succeed('authenticated'),
    observeEffectPlacements: scope =>
      observeAdminQuery('ObserveEffectPlacements', (publish, fail) =>
        database.subscribeQuery(
          {
            foldkitEffectPlacements: {
              $: {
                where: {
                  and: [
                    { sessionId: scope.sessionId },
                    { subjectId: scope.subjectId },
                  ],
                },
                order: { assignmentGeneration: 'asc' },
              },
            },
          },
          payload => {
            if (payload.type === 'error') {
              fail(payload.error)
            } else {
              try {
                publish(
                  decodeEffectPlacements(payload.data.foldkitEffectPlacements),
                )
              } catch (cause) {
                fail(cause)
              }
            }
          },
        ),
      ),
    observeEffectRequests: scope =>
      observeAdminQuery('ObserveEffectRequests', (publish, fail) =>
        database.subscribeQuery(
          {
            foldkitEffectRequests: {
              $: {
                where: {
                  and: [
                    { sessionId: scope.sessionId },
                    { subjectId: scope.subjectId },
                  ],
                },
                order: { requestedAtMs: 'asc' },
              },
            },
          },
          payload => {
            if (payload.type === 'error') {
              fail(payload.error)
            } else {
              try {
                publish(
                  decodeEffectRequests(payload.data.foldkitEffectRequests),
                )
              } catch (cause) {
                fail(cause)
              }
            }
          },
        ),
      ),
    observeMessageProposals: scope =>
      observeAdminQuery('ObserveMessageProposals', (publish, fail) =>
        database.subscribeQuery(
          {
            foldkitMessageProposals: {
              $: {
                where: {
                  and: [
                    { sessionId: scope.sessionId },
                    { subjectId: scope.subjectId },
                  ],
                },
                order: { actorSequence: 'asc' },
              },
            },
          },
          payload => {
            if (payload.type === 'error') {
              fail(payload.error)
            } else {
              try {
                publish(
                  decodeMessageProposals(payload.data.foldkitMessageProposals),
                )
              } catch (cause) {
                fail(cause)
              }
            }
          },
        ),
      ),
    observeMessageProposalResolutions: scope =>
      observeAdminQuery('ObserveMessageProposalResolutions', (publish, fail) =>
        database.subscribeQuery(
          {
            foldkitMessageProposalResolutions: {
              $: {
                where: {
                  and: [
                    { sessionId: scope.sessionId },
                    { subjectId: scope.subjectId },
                  ],
                },
                order: { rejectedAtMs: 'asc' },
              },
            },
          },
          payload => {
            if (payload.type === 'error') {
              fail(payload.error)
            } else {
              try {
                publish(
                  decodeMessageProposalResolutions(
                    payload.data.foldkitMessageProposalResolutions,
                  ),
                )
              } catch (cause) {
                fail(cause)
              }
            }
          },
        ),
      ),
    observeProgramSessions: scope =>
      observeAdminQuery('ObserveProgramSessions', (publish, fail) =>
        database.subscribeQuery(
          {
            foldkitProgramSessions: {
              $: {
                where: {
                  and: [
                    { sessionId: scope.sessionId },
                    { subjectId: scope.subjectId },
                  ],
                },
              },
            },
          },
          payload => {
            if (payload.type === 'error') {
              fail(payload.error)
            } else {
              try {
                publish(
                  Array.getSomes(
                    Array.map(payload.data.foldkitProgramSessions, record =>
                      S.decodeUnknownOption(InstantProgramSessionRecord)(
                        record,
                      ),
                    ),
                  ),
                )
              } catch (cause) {
                fail(cause)
              }
            }
          },
        ),
      ),
    observeProjectionCheckpoints: scope =>
      observeAdminQuery('ObserveProjectionCheckpoints', (publish, fail) =>
        database.subscribeQuery(
          {
            foldkitProjectionCheckpoints: {
              $: {
                where: {
                  and: [
                    { sessionId: scope.sessionId },
                    { subjectId: scope.subjectId },
                  ],
                },
                order: { throughAcceptedSequence: 'desc' },
              },
            },
          },
          payload => {
            if (payload.type === 'error') {
              fail(payload.error)
            } else {
              try {
                publish(
                  Array.map(payload.data.foldkitProjectionCheckpoints, record =>
                    S.decodeUnknownSync(InstantProjectionCheckpointRecord)(
                      record,
                    ),
                  ),
                )
              } catch (cause) {
                fail(cause)
              }
            }
          },
        ),
      ),
  })
  return ProgramAuthorityStore.of({
    ...store,
    appendServerConfirmedAcceptedMessageOccurrence: record =>
      Effect.flatMap(store.appendAcceptedMessageOccurrence(record), outcome =>
        outcome._tag === 'Synced'
          ? Effect.succeed(outcome)
          : Effect.fail(
              new ProgramStoreError({
                cause: new Error(
                  'The Instant admin store returned an optimistic accepted write.',
                ),
                operation: 'AppendAcceptedMessageOccurrence',
              }),
            ),
      ),
    appendServerConfirmedEffectPlacement: record =>
      Effect.flatMap(store.appendEffectPlacement(record), outcome =>
        outcome._tag === 'Synced'
          ? Effect.succeed(outcome)
          : Effect.fail(
              new ProgramStoreError({
                cause: new Error(
                  'The Instant admin store returned an optimistic placement write.',
                ),
                operation: 'AppendEffectPlacement',
              }),
            ),
      ),
    appendServerConfirmedEffectRequest: record =>
      Effect.flatMap(store.appendEffectRequest(record), outcome =>
        outcome._tag === 'Synced'
          ? Effect.succeed(outcome)
          : Effect.fail(
              new ProgramStoreError({
                cause: new Error(
                  'The Instant admin store returned an optimistic effect-request write.',
                ),
                operation: 'AppendEffectRequest',
              }),
            ),
      ),
    appendServerConfirmedMessageProposalResolution: record =>
      Effect.flatMap(store.appendMessageProposalResolution(record), outcome =>
        outcome._tag === 'Synced'
          ? Effect.succeed(outcome)
          : Effect.fail(
              new ProgramStoreError({
                cause: new Error(
                  'The Instant admin store returned an optimistic resolution write.',
                ),
                operation: 'AppendMessageProposalResolution',
              }),
            ),
      ),
    serverConfirmed: {
      observeAcceptedMessageOccurrences:
        store.observeAcceptedMessageOccurrences,
      observeConnectionStatus: store.observeConnectionStatus,
      observeEffectPlacements: store.observeEffectPlacements,
      observeEffectRequests: store.observeEffectRequests,
      observeMessageProposals: store.observeMessageProposals,
      observeMessageProposalResolutions:
        store.observeMessageProposalResolutions,
      observeProgramSessions: store.observeProgramSessions,
      observeProjectionCheckpoints: store.observeProjectionCheckpoints,
    },
  })
}
