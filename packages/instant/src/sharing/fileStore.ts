import {
  Array,
  Effect,
  Order,
  Schema as S,
  Stream,
  SubscriptionRef,
} from 'effect'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  ProgramStore,
  ProgramStoreError,
  type ProgramStoreScope,
  type ProgramStoreService,
  type ProgramStoreTransactionOutcome,
  enqueuedTransactionOutcome,
} from '../programStore/index.js'
import {
  InstantAcceptedMessageOccurrenceRecord,
  InstantMessageProposalRecord,
} from '../schema/index.js'

const FileProgramTapeDocument = S.Struct({
  accepted: S.Array(InstantAcceptedMessageOccurrenceRecord),
  proposed: S.Array(InstantMessageProposalRecord),
})

type FileProgramTapeDocument = typeof FileProgramTapeDocument.Type

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

const proposedOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (record: InstantMessageProposalRecord) => record.actorSequence,
  ),
  Order.mapInput(
    Order.String,
    (record: InstantMessageProposalRecord) => record.proposalId,
  ),
)

const emptyDocument: FileProgramTapeDocument = {
  accepted: [],
  proposed: [],
}

const unusedOperation = (
  operation: ProgramStoreError['operation'],
): Effect.Effect<never, ProgramStoreError> =>
  Effect.fail(
    new ProgramStoreError({
      cause: new Error(`${operation} is not part of the same-actor file tape.`),
      operation,
    }),
  )

const readDocument = (path: string): FileProgramTapeDocument => {
  try {
    const raw = readFileSync(path, 'utf8')
    return S.decodeSync(S.fromJsonString(FileProgramTapeDocument))(raw)
  } catch {
    return emptyDocument
  }
}

const writeDocument = (
  path: string,
  document: FileProgramTapeDocument,
): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    S.encodeSync(S.fromJsonString(FileProgramTapeDocument))(document),
  )
}

const inScope = <
  Record extends Readonly<{ sessionId: string; subjectId: string }>,
>(
  records: ReadonlyArray<Record>,
  scope: ProgramStoreScope,
): ReadonlyArray<Record> =>
  Array.filter(
    records,
    record =>
      record.sessionId === scope.sessionId &&
      record.subjectId === scope.subjectId,
  )

/**
 * Persists Instant proposal and accepted-occurrence rows on disk.
 * This is the offline Instant outbox, not a second product database.
 */
export const makeFileProgramStore = (
  path: string,
  outcome: ProgramStoreTransactionOutcome = enqueuedTransactionOutcome('file'),
): Effect.Effect<ProgramStoreService> =>
  Effect.gen(function* () {
    const document = yield* SubscriptionRef.make(readDocument(path))

    const persist = (next: FileProgramTapeDocument): void => {
      writeDocument(path, next)
    }

    return ProgramStore.of({
      appendAcceptedMessageOccurrence: record =>
        SubscriptionRef.update(document, current => {
          const next = {
            accepted: [...current.accepted, record],
            proposed: current.proposed,
          }
          persist(next)
          return next
        }).pipe(Effect.as(outcome)),
      appendEffectPlacement: () => unusedOperation('AppendEffectPlacement'),
      appendEffectRequest: () => unusedOperation('AppendEffectRequest'),
      appendMessageProposal: record =>
        SubscriptionRef.update(document, current => {
          const next = {
            accepted: current.accepted,
            proposed: [...current.proposed, record],
          }
          persist(next)
          return next
        }).pipe(Effect.as(outcome)),
      appendMessageProposalResolution: () =>
        unusedOperation('AppendMessageProposalResolution'),
      appendProgramSession: () => unusedOperation('AppendProgramSession'),
      appendProjectionCheckpoint: () =>
        unusedOperation('AppendProjectionCheckpoint'),
      observeAcceptedMessageOccurrences: scope =>
        SubscriptionRef.changes(document).pipe(
          Stream.map(current =>
            Array.sort(inScope(current.accepted, scope), acceptedOrder),
          ),
        ),
      observeConnectionStatus: Stream.succeed('closed'),
      observeEffectPlacements: () => Stream.empty,
      observeEffectRequests: () => Stream.empty,
      observeMessageProposalResolutions: () => Stream.empty,
      observeMessageProposals: scope =>
        SubscriptionRef.changes(document).pipe(
          Stream.map(current =>
            Array.sort(inScope(current.proposed, scope), proposedOrder),
          ),
        ),
      observeProgramSessions: () => Stream.empty,
      observeProjectionCheckpoints: () => Stream.empty,
    })
  })

/** Reads the current accepted rows from a file tape without a live store. */
export const readFileAcceptedOccurrences = (
  path: string,
  scope: ProgramStoreScope,
): ReadonlyArray<InstantAcceptedMessageOccurrenceRecord> =>
  Array.sort(inScope(readDocument(path).accepted, scope), acceptedOrder)
