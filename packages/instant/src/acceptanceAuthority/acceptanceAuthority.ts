import {
  Array,
  Data,
  Effect,
  HashMap,
  HashSet,
  Option,
  Order,
  Schema as S,
  Stream,
  SynchronizedRef,
  Tuple,
} from 'effect'

import { makeAcceptedOccurrencePositionKey } from '../acceptedOccurrenceCursor/index.js'
import type {
  ProgramStoreError,
  ProgramStoreService,
} from '../programStore/index.js'
import {
  InstantAcceptedMessageOccurrenceRecord,
  type InstantAcceptedMessageOccurrenceRecord as InstantAcceptedMessageOccurrenceRecordType,
  InstantEffectPlacementRecord,
  type InstantEffectPlacementRecord as InstantEffectPlacementRecordType,
  type InstantEffectRequestRecord,
  type InstantMessageProposalRecord,
  type InstantProgramSessionRecord,
} from '../schema/index.js'

const acceptedOccurrenceJson = S.fromJsonString(
  InstantAcceptedMessageOccurrenceRecord,
)
const encodeAcceptedOccurrence = S.encodeSync(acceptedOccurrenceJson)
const effectPlacementJson = S.fromJsonString(InstantEffectPlacementRecord)
const encodeEffectPlacement = S.encodeSync(effectPlacementJson)

const proposalOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (proposal: InstantMessageProposalRecord) => proposal.actorSequence,
  ),
  Order.mapInput(
    Order.String,
    (proposal: InstantMessageProposalRecord) => proposal.proposalId,
  ),
)

const acceptedOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (occurrence: InstantAcceptedMessageOccurrenceRecordType) =>
      occurrence.acceptedSequence,
  ),
  Order.mapInput(
    Order.String,
    (occurrence: InstantAcceptedMessageOccurrenceRecordType) =>
      occurrence.occurrenceId,
  ),
)

type AuthorityState = Readonly<{
  acceptedByEffectIdempotencyKey: HashMap.HashMap<
    string,
    InstantAcceptedMessageOccurrenceRecordType
  >
  acceptedByOccurrenceId: HashMap.HashMap<
    string,
    InstantAcceptedMessageOccurrenceRecordType
  >
  acceptedByProposalId: HashMap.HashMap<
    string,
    InstantAcceptedMessageOccurrenceRecordType
  >
  acceptedBySequence: HashMap.HashMap<
    number,
    InstantAcceptedMessageOccurrenceRecordType
  >
  effectPlacementsByRequestId: HashMap.HashMap<
    string,
    InstantEffectPlacementRecordType
  >
  effectRequestsById: HashMap.HashMap<string, InstantEffectRequestRecord>
  maybeCurrentSession: Option.Option<InstantProgramSessionRecord>
  nextAcceptedSequence: number
}>

/** An authority received data outside its authenticated Program session. */
export class AcceptanceAuthorityScopeMismatch extends Data.TaggedError(
  'AcceptanceAuthorityScopeMismatch',
)<{
  readonly actualProgramId: string
  readonly actualProgramVersion: number
  readonly actualSessionId: string
  readonly actualSubjectId: string
  readonly expectedProgramId: string
  readonly expectedProgramVersion: number
  readonly expectedSessionId: string
  readonly expectedSubjectId: string
}> {}

/** A revoked Program session cannot admit additional Message occurrences. */
export class AcceptanceAuthoritySessionRevoked extends Data.TaggedError(
  'AcceptanceAuthoritySessionRevoked',
)<{
  readonly sessionId: string
}> {}

/** The configured Program session is not currently visible to the authority. */
export class AcceptanceAuthoritySessionMissing extends Data.TaggedError(
  'AcceptanceAuthoritySessionMissing',
)<{
  readonly sessionId: string
}> {}

/** The current Program session fenced this Processor out as its authority. */
export class AcceptanceAuthorityChanged extends Data.TaggedError(
  'AcceptanceAuthorityChanged',
)<{
  readonly actualProcessorId: string
  readonly expectedProcessorId: string
  readonly sessionId: string
}> {}

/** Accepted history was not produced by the session's configured single authority. */
export class AcceptanceAuthorityProcessorMismatch extends Data.TaggedError(
  'AcceptanceAuthorityProcessorMismatch',
)<{
  readonly actualProcessorId: string
  readonly expectedProcessorId: string
  readonly occurrenceId: string
}> {}

/** Accepted history contained a gap or a reused sequence position. */
export class AcceptanceAuthoritySequenceConflict extends Data.TaggedError(
  'AcceptanceAuthoritySequenceConflict',
)<{
  readonly acceptedSequence: number
  readonly expectedAcceptedSequence: number
  readonly occurrenceId: string
}> {}

/** An occurrence or proposal identity was reused with different contents. */
export class AcceptanceAuthorityIdentityConflict extends Data.TaggedError(
  'AcceptanceAuthorityIdentityConflict',
)<{
  readonly identity: string
  readonly identityKind: 'Occurrence' | 'Proposal'
}> {}

/** An effect result did not come from its authority-assigned Processor. */
export class AcceptanceAuthorityEffectResultMismatch extends Data.TaggedError(
  'AcceptanceAuthorityEffectResultMismatch',
)<{
  readonly effectRequestId: string | null
  readonly proposalId: string
  readonly reason:
    | 'MissingCorrelation'
    | 'UnknownRequest'
    | 'NotAssigned'
    | 'WrongProcessor'
    | 'WrongIdempotencyKey'
    | 'WrongCausation'
    | 'WrongAssignmentGeneration'
    | 'WrongCancellationGeneration'
    | 'WrongResultEvent'
}> {}

/** A proposal kind carried fields reserved for a different intake path. */
export class AcceptanceAuthorityProposalKindMismatch extends Data.TaggedError(
  'AcceptanceAuthorityProposalKindMismatch',
)<{
  readonly proposalId: string
}> {}

/** Instant retained an accepted write locally instead of synchronizing it. */
export class AcceptanceAuthorityWriteNotSynced extends Data.TaggedError(
  'AcceptanceAuthorityWriteNotSynced',
)<{
  readonly clientId: string
  readonly occurrenceId: string
}> {}

/** An effect placement history reused a generation with different contents. */
export class AcceptanceAuthorityPlacementConflict extends Data.TaggedError(
  'AcceptanceAuthorityPlacementConflict',
)<{
  readonly positionKey: string
  readonly requestId: string
}> {}

/** A proposal envelope could not be converted into accepted provenance. */
export class AcceptanceAuthorityEnvelopeError extends Data.TaggedError(
  'AcceptanceAuthorityEnvelopeError',
)<{
  readonly cause: unknown
  readonly proposalId: string
}> {}

/** A deterministic acceptance authority operation failed. */
export type AcceptanceAuthorityError =
  | AcceptanceAuthorityChanged
  | AcceptanceAuthorityEffectResultMismatch
  | AcceptanceAuthorityEnvelopeError
  | AcceptanceAuthorityIdentityConflict
  | AcceptanceAuthorityPlacementConflict
  | AcceptanceAuthorityProcessorMismatch
  | AcceptanceAuthorityProposalKindMismatch
  | AcceptanceAuthorityScopeMismatch
  | AcceptanceAuthoritySequenceConflict
  | AcceptanceAuthoritySessionMissing
  | AcceptanceAuthoritySessionRevoked
  | AcceptanceAuthorityWriteNotSynced
  | ProgramStoreError

/** A semantically invalid proposal reported without terminating authority intake. */
export type AcceptanceAuthorityProposalRejection =
  | AcceptanceAuthorityEffectResultMismatch
  | AcceptanceAuthorityEnvelopeError
  | AcceptanceAuthorityIdentityConflict
  | AcceptanceAuthorityProposalKindMismatch
  | AcceptanceAuthorityScopeMismatch

/** Values supplied while converting proposed provenance into accepted provenance. */
export type AcceptEnvelopeInput = Readonly<{
  acceptedAtMs: number
  acceptedSequence: number
  acceptingProcessorId: string
}>

/** Configuration for one explicitly single-writer acceptance authority. */
export type AcceptanceAuthorityConfig = Readonly<{
  acceptEnvelope: (
    proposal: InstantMessageProposalRecord,
    input: AcceptEnvelopeInput,
  ) => Effect.Effect<string, unknown>
  now: () => number
  onProposalRejected?: (
    proposal: InstantMessageProposalRecord,
    rejection: AcceptanceAuthorityProposalRejection,
  ) => Effect.Effect<void>
  session: InstantProgramSessionRecord
  store: ProgramStoreService
}>

/** The single authority that deterministically admits proposals for one session. */
export type AcceptanceAuthorityService = Readonly<{
  admit: (
    proposal: InstantMessageProposalRecord,
  ) => Effect.Effect<
    InstantAcceptedMessageOccurrenceRecordType,
    AcceptanceAuthorityError
  >
  recoverAcceptedOccurrences: (
    occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecordType>,
  ) => Effect.Effect<void, AcceptanceAuthorityError>
  recoverEffectPlacements: (
    placements: ReadonlyArray<InstantEffectPlacementRecordType>,
  ) => Effect.Effect<
    void,
    AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
  >
  recoverEffectRequests: (
    requests: ReadonlyArray<InstantEffectRequestRecord>,
  ) => Effect.Effect<void, AcceptanceAuthorityScopeMismatch>
  run: Effect.Effect<never, AcceptanceAuthorityError>
}>

const emptyAuthorityState = (): AuthorityState => ({
  acceptedByEffectIdempotencyKey: HashMap.empty(),
  acceptedByOccurrenceId: HashMap.empty(),
  acceptedByProposalId: HashMap.empty(),
  acceptedBySequence: HashMap.empty(),
  effectPlacementsByRequestId: HashMap.empty(),
  effectRequestsById: HashMap.empty(),
  maybeCurrentSession: Option.none(),
  nextAcceptedSequence: 1,
})

const scopeMismatch = (
  session: InstantProgramSessionRecord,
  value: Readonly<{
    programId: string
    programVersion: number
    sessionId: string
    subjectId: string
  }>,
): Option.Option<AcceptanceAuthorityScopeMismatch> => {
  if (
    value.programId === session.programId &&
    value.programVersion === session.programVersion &&
    value.sessionId === session.sessionId &&
    value.subjectId === session.subjectId
  ) {
    return Option.none()
  } else {
    return Option.some(
      new AcceptanceAuthorityScopeMismatch({
        actualProgramId: value.programId,
        actualProgramVersion: value.programVersion,
        actualSessionId: value.sessionId,
        actualSubjectId: value.subjectId,
        expectedProgramId: session.programId,
        expectedProgramVersion: session.programVersion,
        expectedSessionId: session.sessionId,
        expectedSubjectId: session.subjectId,
      }),
    )
  }
}

const validateProposalKind = (
  proposal: InstantMessageProposalRecord,
): Effect.Effect<void, AcceptanceAuthorityProposalKindMismatch> => {
  const hasCompleteEffectFields =
    proposal.effectAssignmentGeneration !== null &&
    proposal.effectCancellationGeneration !== null &&
    proposal.effectIdempotencyKey !== null &&
    proposal.effectRequestId !== null &&
    proposal.executorProcessorId !== null
  const hasNoEffectFields =
    proposal.effectAssignmentGeneration === null &&
    proposal.effectCancellationGeneration === null &&
    proposal.effectIdempotencyKey === null &&
    proposal.effectRequestId === null &&
    proposal.executorProcessorId === null
  if (
    (proposal.proposalKind === 'Message' && hasNoEffectFields) ||
    (proposal.proposalKind === 'EffectResult' && hasCompleteEffectFields)
  ) {
    return Effect.void
  } else {
    return Effect.fail(
      new AcceptanceAuthorityProposalKindMismatch({
        proposalId: proposal.proposalId,
      }),
    )
  }
}

const validateEffectResult = (
  state: AuthorityState,
  proposal: InstantMessageProposalRecord,
): Effect.Effect<
  void,
  | AcceptanceAuthorityEffectResultMismatch
  | AcceptanceAuthorityProposalKindMismatch
> => {
  const kindValidation = validateProposalKind(proposal)
  if (proposal.proposalKind === 'Message') {
    return kindValidation
  }
  if (
    proposal.effectAssignmentGeneration === null ||
    proposal.effectCancellationGeneration === null ||
    proposal.effectRequestId === null ||
    proposal.effectIdempotencyKey === null ||
    proposal.executorProcessorId === null
  ) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'MissingCorrelation',
      }),
    )
  }

  const maybeRequest = HashMap.get(
    state.effectRequestsById,
    proposal.effectRequestId,
  )
  if (Option.isNone(maybeRequest)) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'UnknownRequest',
      }),
    )
  }

  const maybePlacement = HashMap.get(
    state.effectPlacementsByRequestId,
    proposal.effectRequestId,
  )
  if (Option.isNone(maybePlacement)) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'NotAssigned',
      }),
    )
  }
  const placement = maybePlacement.value
  const request = maybeRequest.value
  if (
    placement.placementStatus !== 'AssignedPreferred' &&
    placement.placementStatus !== 'AssignedFallback'
  ) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'NotAssigned',
      }),
    )
  }
  if (
    placement.assignedProcessorId !== proposal.executorProcessorId ||
    proposal.originatingProcessorId !== proposal.executorProcessorId
  ) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongProcessor',
      }),
    )
  }
  if (request.idempotencyKey !== proposal.effectIdempotencyKey) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongIdempotencyKey',
      }),
    )
  }
  if (request.causalOccurrenceId !== proposal.causationOccurrenceId) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongCausation',
      }),
    )
  }
  if (placement.assignmentGeneration !== proposal.effectAssignmentGeneration) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongAssignmentGeneration',
      }),
    )
  }
  if (
    placement.cancellationGeneration !== proposal.effectCancellationGeneration
  ) {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongCancellationGeneration',
      }),
    )
  }
  const isPermitted = Array.some(
    request.permittedResultEvents,
    permitted =>
      permitted.eventId === proposal.eventId &&
      proposal.eventVersion >= permitted.minimumVersion &&
      proposal.eventVersion <= permitted.maximumVersion,
  )
  if (isPermitted) {
    return kindValidation
  } else {
    return Effect.fail(
      new AcceptanceAuthorityEffectResultMismatch({
        effectRequestId: proposal.effectRequestId,
        proposalId: proposal.proposalId,
        reason: 'WrongResultEvent',
      }),
    )
  }
}

const areAcceptedOccurrencesEqual = (
  left: InstantAcceptedMessageOccurrenceRecordType,
  right: InstantAcceptedMessageOccurrenceRecordType,
): boolean => encodeAcceptedOccurrence(left) === encodeAcceptedOccurrence(right)

const validateProposalAgainstAccepted = (
  proposal: InstantMessageProposalRecord,
  accepted: InstantAcceptedMessageOccurrenceRecordType,
): boolean =>
  proposal.actorId === accepted.actorId &&
  proposal.actorSequence === accepted.actorSequence &&
  proposal.clientId === accepted.clientId &&
  proposal.createdAtMs === accepted.createdAtMs &&
  proposal.effectAssignmentGeneration === accepted.effectAssignmentGeneration &&
  proposal.effectCancellationGeneration ===
    accepted.effectCancellationGeneration &&
  proposal.effectIdempotencyKey === accepted.effectIdempotencyKey &&
  proposal.effectRequestId === accepted.effectRequestId &&
  proposal.causationOccurrenceId === accepted.causationId &&
  proposal.correlationId === accepted.correlationId &&
  proposal.envelopeVersion === accepted.envelopeVersion &&
  proposal.eventId === accepted.eventId &&
  proposal.eventVersion === accepted.eventVersion &&
  proposal.executorProcessorId === accepted.executorProcessorId &&
  proposal.envelopeJson === accepted.proposedEnvelopeJson &&
  proposal.occurrenceId === accepted.occurrenceId &&
  proposal.originDeviceId === accepted.originDeviceId &&
  proposal.originatingProcessorId === accepted.originatingProcessorId &&
  proposal.payloadJson === accepted.payloadJson &&
  proposal.programId === accepted.programId &&
  proposal.programVersion === accepted.programVersion &&
  proposal.proposalKind === accepted.proposalKind &&
  proposal.sessionId === accepted.sessionId &&
  proposal.subjectId === accepted.subjectId

const validateAcceptedOccurrenceKind = (
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
): Effect.Effect<void, AcceptanceAuthorityProposalKindMismatch> => {
  const hasCompleteEffectFields =
    occurrence.effectAssignmentGeneration !== null &&
    occurrence.effectCancellationGeneration !== null &&
    occurrence.effectIdempotencyKey !== null &&
    occurrence.effectRequestId !== null &&
    occurrence.executorProcessorId !== null
  const hasNoEffectFields =
    occurrence.effectAssignmentGeneration === null &&
    occurrence.effectCancellationGeneration === null &&
    occurrence.effectIdempotencyKey === null &&
    occurrence.effectRequestId === null &&
    occurrence.executorProcessorId === null
  if (
    (occurrence.proposalKind === 'Message' && hasNoEffectFields) ||
    (occurrence.proposalKind === 'EffectResult' && hasCompleteEffectFields)
  ) {
    return Effect.void
  } else {
    return Effect.fail(
      new AcceptanceAuthorityProposalKindMismatch({
        proposalId: occurrence.proposalId,
      }),
    )
  }
}

const insertRecoveredOccurrence = (
  session: InstantProgramSessionRecord,
  state: AuthorityState,
  occurrence: InstantAcceptedMessageOccurrenceRecordType,
): Effect.Effect<AuthorityState, AcceptanceAuthorityError> => {
  const kindValidation = validateAcceptedOccurrenceKind(occurrence)
  const maybeScopeMismatch = scopeMismatch(session, occurrence)
  if (Option.isSome(maybeScopeMismatch)) {
    return Effect.fail(maybeScopeMismatch.value)
  }
  if (occurrence.acceptingProcessorId !== session.authorityProcessorId) {
    return Effect.fail(
      new AcceptanceAuthorityProcessorMismatch({
        actualProcessorId: occurrence.acceptingProcessorId,
        expectedProcessorId: session.authorityProcessorId,
        occurrenceId: occurrence.occurrenceId,
      }),
    )
  }
  if (occurrence.acceptedSequence !== state.nextAcceptedSequence) {
    return Effect.fail(
      new AcceptanceAuthoritySequenceConflict({
        acceptedSequence: occurrence.acceptedSequence,
        expectedAcceptedSequence: state.nextAcceptedSequence,
        occurrenceId: occurrence.occurrenceId,
      }),
    )
  }
  if (
    occurrence.positionKey !==
    makeAcceptedOccurrencePositionKey(
      occurrence.sessionId,
      occurrence.acceptedSequence,
    )
  ) {
    return Effect.fail(
      new AcceptanceAuthoritySequenceConflict({
        acceptedSequence: occurrence.acceptedSequence,
        expectedAcceptedSequence: state.nextAcceptedSequence,
        occurrenceId: occurrence.occurrenceId,
      }),
    )
  }

  const maybeByOccurrence = HashMap.get(
    state.acceptedByOccurrenceId,
    occurrence.occurrenceId,
  )
  if (
    Option.isSome(maybeByOccurrence) &&
    !areAcceptedOccurrencesEqual(maybeByOccurrence.value, occurrence)
  ) {
    return Effect.fail(
      new AcceptanceAuthorityIdentityConflict({
        identity: occurrence.occurrenceId,
        identityKind: 'Occurrence',
      }),
    )
  }
  const maybeByProposal = HashMap.get(
    state.acceptedByProposalId,
    occurrence.proposalId,
  )
  if (
    Option.isSome(maybeByProposal) &&
    !areAcceptedOccurrencesEqual(maybeByProposal.value, occurrence)
  ) {
    return Effect.fail(
      new AcceptanceAuthorityIdentityConflict({
        identity: occurrence.proposalId,
        identityKind: 'Proposal',
      }),
    )
  }

  const nextEffectResults =
    occurrence.proposalKind !== 'EffectResult' ||
    occurrence.effectIdempotencyKey === null
      ? state.acceptedByEffectIdempotencyKey
      : HashMap.set(
          state.acceptedByEffectIdempotencyKey,
          occurrence.effectIdempotencyKey,
          occurrence,
        )
  return Effect.as(kindValidation, {
    ...state,
    acceptedByEffectIdempotencyKey: nextEffectResults,
    acceptedByOccurrenceId: HashMap.set(
      state.acceptedByOccurrenceId,
      occurrence.occurrenceId,
      occurrence,
    ),
    acceptedByProposalId: HashMap.set(
      state.acceptedByProposalId,
      occurrence.proposalId,
      occurrence,
    ),
    acceptedBySequence: HashMap.set(
      state.acceptedBySequence,
      occurrence.acceptedSequence,
      occurrence,
    ),
    nextAcceptedSequence: state.nextAcceptedSequence + 1,
  })
}

const recoverAccepted = (
  session: InstantProgramSessionRecord,
  occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecordType>,
): Effect.Effect<AuthorityState, AcceptanceAuthorityError> => {
  const initialState: Effect.Effect<AuthorityState, AcceptanceAuthorityError> =
    Effect.succeed(emptyAuthorityState())
  return Array.reduce(
    Array.sort(occurrences, acceptedOrder),
    initialState,
    (stateEffect, occurrence) =>
      Effect.flatMap(stateEffect, state =>
        insertRecoveredOccurrence(session, state, occurrence),
      ),
  )
}

const reconcileRecoveredAccepted = (
  current: AuthorityState,
  recovered: AuthorityState,
): Effect.Effect<AuthorityState, AcceptanceAuthorityIdentityConflict> => {
  const maybeConflict = HashMap.reduce(
    recovered.acceptedBySequence,
    Option.none<AcceptanceAuthorityIdentityConflict>(),
    (conflict, occurrence, acceptedSequence) => {
      if (Option.isSome(conflict)) {
        return conflict
      }
      const maybeCurrent = HashMap.get(
        current.acceptedBySequence,
        acceptedSequence,
      )
      if (
        Option.isNone(maybeCurrent) ||
        areAcceptedOccurrencesEqual(maybeCurrent.value, occurrence)
      ) {
        return Option.none()
      } else {
        return Option.some(
          new AcceptanceAuthorityIdentityConflict({
            identity: occurrence.occurrenceId,
            identityKind: 'Occurrence',
          }),
        )
      }
    },
  )
  if (Option.isSome(maybeConflict)) {
    return Effect.fail(maybeConflict.value)
  }

  const nextAcceptedState =
    recovered.nextAcceptedSequence < current.nextAcceptedSequence
      ? current
      : recovered
  return Effect.succeed({
    ...nextAcceptedState,
    effectPlacementsByRequestId: current.effectPlacementsByRequestId,
    effectRequestsById: current.effectRequestsById,
    maybeCurrentSession: current.maybeCurrentSession,
  })
}

const recoverEffects = (
  session: InstantProgramSessionRecord,
  state: AuthorityState,
  requests: ReadonlyArray<InstantEffectRequestRecord>,
): Effect.Effect<AuthorityState, AcceptanceAuthorityScopeMismatch> => {
  const initialState: Effect.Effect<
    AuthorityState,
    AcceptanceAuthorityScopeMismatch
  > = Effect.succeed({
    ...state,
    effectRequestsById: HashMap.empty<string, InstantEffectRequestRecord>(),
  })
  return Array.reduce(requests, initialState, (stateEffect, request) =>
    Effect.flatMap(
      stateEffect,
      (
        nextState,
      ): Effect.Effect<AuthorityState, AcceptanceAuthorityScopeMismatch> => {
        const maybeScopeMismatch = scopeMismatch(session, request)
        if (Option.isSome(maybeScopeMismatch)) {
          return Effect.fail(maybeScopeMismatch.value)
        } else {
          return Effect.succeed({
            ...nextState,
            effectRequestsById: HashMap.set(
              nextState.effectRequestsById,
              request.requestId,
              request,
            ),
          })
        }
      },
    ),
  )
}

const isLaterPlacement = (
  candidate: InstantEffectPlacementRecordType,
  current: InstantEffectPlacementRecordType,
): boolean =>
  candidate.assignmentGeneration > current.assignmentGeneration ||
  (candidate.assignmentGeneration === current.assignmentGeneration &&
    candidate.cancellationGeneration > current.cancellationGeneration)

const recoverPlacements = (
  session: InstantProgramSessionRecord,
  state: AuthorityState,
  placements: ReadonlyArray<InstantEffectPlacementRecordType>,
): Effect.Effect<
  AuthorityState,
  AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
> => {
  const initialState: Effect.Effect<
    AuthorityState,
    AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
  > = Effect.succeed({
    ...state,
    effectPlacementsByRequestId: HashMap.empty<
      string,
      InstantEffectPlacementRecordType
    >(),
  })
  return Array.reduce(placements, initialState, (stateEffect, placement) =>
    Effect.flatMap(
      stateEffect,
      (
        nextState,
      ): Effect.Effect<
        AuthorityState,
        AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
      > => {
        const maybeScopeMismatch = scopeMismatch(session, placement)
        if (Option.isSome(maybeScopeMismatch)) {
          return Effect.fail(maybeScopeMismatch.value)
        }
        const maybeCurrent = HashMap.get(
          nextState.effectPlacementsByRequestId,
          placement.requestId,
        )
        if (Option.isNone(maybeCurrent)) {
          return Effect.succeed({
            ...nextState,
            effectPlacementsByRequestId: HashMap.set(
              nextState.effectPlacementsByRequestId,
              placement.requestId,
              placement,
            ),
          })
        }
        const current = maybeCurrent.value
        if (
          current.assignmentGeneration === placement.assignmentGeneration &&
          current.cancellationGeneration === placement.cancellationGeneration
        ) {
          if (
            encodeEffectPlacement(current) === encodeEffectPlacement(placement)
          ) {
            return Effect.succeed(nextState)
          } else {
            return Effect.fail(
              new AcceptanceAuthorityPlacementConflict({
                positionKey: placement.positionKey,
                requestId: placement.requestId,
              }),
            )
          }
        }
        if (isLaterPlacement(placement, current)) {
          return Effect.succeed({
            ...nextState,
            effectPlacementsByRequestId: HashMap.set(
              nextState.effectPlacementsByRequestId,
              placement.requestId,
              placement,
            ),
          })
        } else {
          return Effect.succeed(nextState)
        }
      },
    ),
  )
}

const isProposalRejection = (
  error: AcceptanceAuthorityError,
): error is AcceptanceAuthorityProposalRejection =>
  error._tag === 'AcceptanceAuthorityEffectResultMismatch' ||
  error._tag === 'AcceptanceAuthorityEnvelopeError' ||
  error._tag === 'AcceptanceAuthorityIdentityConflict' ||
  error._tag === 'AcceptanceAuthorityProposalKindMismatch' ||
  error._tag === 'AcceptanceAuthorityScopeMismatch'

/** Creates a recoverable, explicitly single-writer acceptance authority. */
export const makeAcceptanceAuthority = ({
  acceptEnvelope,
  now,
  onProposalRejected = () => Effect.void,
  session,
  store,
}: AcceptanceAuthorityConfig): Effect.Effect<AcceptanceAuthorityService> =>
  Effect.gen(function* () {
    const stateRef = yield* SynchronizedRef.make<AuthorityState>({
      ...emptyAuthorityState(),
      maybeCurrentSession: Option.some(session),
    })
    const unsyncedAcceptedOccurrenceIds = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )

    const recoverAcceptedOccurrences = (
      occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecordType>,
    ): Effect.Effect<void, AcceptanceAuthorityError> =>
      Effect.gen(function* () {
        const unsyncedIds = yield* SynchronizedRef.get(
          unsyncedAcceptedOccurrenceIds,
        )
        const synchronizedOccurrences = Array.filter(
          occurrences,
          occurrence => !HashSet.has(unsyncedIds, occurrence.occurrenceId),
        )
        yield* SynchronizedRef.updateEffect(stateRef, state =>
          Effect.flatMap(
            recoverAccepted(session, synchronizedOccurrences),
            recovered => reconcileRecoveredAccepted(state, recovered),
          ),
        )
      })

    const recoverEffectRequests = (
      requests: ReadonlyArray<InstantEffectRequestRecord>,
    ): Effect.Effect<void, AcceptanceAuthorityScopeMismatch> =>
      SynchronizedRef.updateEffect(stateRef, state =>
        recoverEffects(session, state, requests),
      )

    const recoverEffectPlacements = (
      placements: ReadonlyArray<InstantEffectPlacementRecordType>,
    ): Effect.Effect<
      void,
      AcceptanceAuthorityPlacementConflict | AcceptanceAuthorityScopeMismatch
    > =>
      SynchronizedRef.updateEffect(stateRef, state =>
        recoverPlacements(session, state, placements),
      )

    const setCurrentSession = (
      sessions: ReadonlyArray<InstantProgramSessionRecord>,
    ): Effect.Effect<void> =>
      SynchronizedRef.update(stateRef, state => ({
        ...state,
        maybeCurrentSession: Array.findFirst(
          sessions,
          candidate =>
            candidate.id === session.id &&
            candidate.programId === session.programId &&
            candidate.programVersion === session.programVersion &&
            candidate.sessionId === session.sessionId &&
            candidate.subjectId === session.subjectId,
        ),
      }))

    const validateCurrentSession = (
      state: AuthorityState,
    ): Effect.Effect<
      InstantProgramSessionRecord,
      | AcceptanceAuthorityChanged
      | AcceptanceAuthoritySessionMissing
      | AcceptanceAuthoritySessionRevoked
    > => {
      if (Option.isNone(state.maybeCurrentSession)) {
        return Effect.fail(
          new AcceptanceAuthoritySessionMissing({
            sessionId: session.sessionId,
          }),
        )
      }
      const currentSession = state.maybeCurrentSession.value
      if (currentSession.isRevoked) {
        return Effect.fail(
          new AcceptanceAuthoritySessionRevoked({
            sessionId: currentSession.sessionId,
          }),
        )
      }
      if (
        currentSession.authorityProcessorId !== session.authorityProcessorId
      ) {
        return Effect.fail(
          new AcceptanceAuthorityChanged({
            actualProcessorId: currentSession.authorityProcessorId,
            expectedProcessorId: session.authorityProcessorId,
            sessionId: session.sessionId,
          }),
        )
      }
      return Effect.succeed(currentSession)
    }

    const admit = (
      proposal: InstantMessageProposalRecord,
    ): Effect.Effect<
      InstantAcceptedMessageOccurrenceRecordType,
      AcceptanceAuthorityError
    > =>
      SynchronizedRef.modifyEffect(stateRef, state =>
        Effect.gen(function* () {
          const currentSession = yield* validateCurrentSession(state)
          yield* validateProposalKind(proposal)
          const maybeScopeMismatch = scopeMismatch(session, proposal)
          if (Option.isSome(maybeScopeMismatch)) {
            return yield* Effect.fail(maybeScopeMismatch.value)
          }

          const maybeByProposal = HashMap.get(
            state.acceptedByProposalId,
            proposal.proposalId,
          )
          if (Option.isSome(maybeByProposal)) {
            if (
              validateProposalAgainstAccepted(proposal, maybeByProposal.value)
            ) {
              return Tuple.make(maybeByProposal.value, state)
            } else {
              return yield* Effect.fail(
                new AcceptanceAuthorityIdentityConflict({
                  identity: proposal.proposalId,
                  identityKind: 'Proposal',
                }),
              )
            }
          }

          const maybeByOccurrence = HashMap.get(
            state.acceptedByOccurrenceId,
            proposal.occurrenceId,
          )
          if (Option.isSome(maybeByOccurrence)) {
            return yield* Effect.fail(
              new AcceptanceAuthorityIdentityConflict({
                identity: proposal.occurrenceId,
                identityKind: 'Occurrence',
              }),
            )
          }

          if (
            proposal.proposalKind === 'EffectResult' &&
            proposal.effectIdempotencyKey !== null
          ) {
            const maybeAcceptedEffect = HashMap.get(
              state.acceptedByEffectIdempotencyKey,
              proposal.effectIdempotencyKey,
            )
            if (Option.isSome(maybeAcceptedEffect)) {
              return Tuple.make(maybeAcceptedEffect.value, state)
            }
          }

          yield* validateEffectResult(state, proposal)
          const acceptedAtMs = now()
          const acceptedSequence = state.nextAcceptedSequence
          const envelopeJson = yield* acceptEnvelope(proposal, {
            acceptedAtMs,
            acceptedSequence,
            acceptingProcessorId: currentSession.authorityProcessorId,
          }).pipe(
            Effect.mapError(
              cause =>
                new AcceptanceAuthorityEnvelopeError({
                  cause,
                  proposalId: proposal.proposalId,
                }),
            ),
          )
          const occurrence = InstantAcceptedMessageOccurrenceRecord.make({
            acceptedAtMs,
            acceptedSequence,
            acceptingProcessorId: currentSession.authorityProcessorId,
            actorId: proposal.actorId,
            actorSequence: proposal.actorSequence,
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
            occurrenceId: proposal.occurrenceId,
            originDeviceId: proposal.originDeviceId,
            originatingProcessorId: proposal.originatingProcessorId,
            payloadJson: proposal.payloadJson,
            positionKey: makeAcceptedOccurrencePositionKey(
              proposal.sessionId,
              acceptedSequence,
            ),
            programId: proposal.programId,
            programVersion: proposal.programVersion,
            proposedEnvelopeJson: proposal.envelopeJson,
            proposalId: proposal.proposalId,
            proposalKind: proposal.proposalKind,
            sessionId: proposal.sessionId,
            subjectId: proposal.subjectId,
          })
          const outcome =
            yield* store.appendAcceptedMessageOccurrence(occurrence)
          if (outcome._tag === 'Enqueued') {
            yield* SynchronizedRef.update(
              unsyncedAcceptedOccurrenceIds,
              occurrenceIds =>
                HashSet.add(occurrenceIds, occurrence.occurrenceId),
            )
            return yield* Effect.fail(
              new AcceptanceAuthorityWriteNotSynced({
                clientId: outcome.clientId,
                occurrenceId: occurrence.occurrenceId,
              }),
            )
          }
          yield* SynchronizedRef.update(
            unsyncedAcceptedOccurrenceIds,
            occurrenceIds =>
              HashSet.remove(occurrenceIds, occurrence.occurrenceId),
          )
          const nextState = yield* insertRecoveredOccurrence(
            session,
            state,
            occurrence,
          )
          return Tuple.make(occurrence, nextState)
        }),
      )

    const scope = {
      sessionId: session.sessionId,
      subjectId: session.subjectId,
    }
    const snapshots = Stream.zipLatest(
      Stream.zipLatest(
        Stream.zipLatest(
          store.observeAcceptedMessageOccurrences(scope),
          store.observeEffectRequests(scope),
        ),
        Stream.zipLatest(
          store.observeEffectPlacements(scope),
          store.observeMessageProposals(scope),
        ),
      ),
      Stream.zipLatest(
        store.observeProgramSessions(scope),
        store.observeConnectionStatus,
      ),
    )
    const run = Stream.runForEach(
      snapshots,
      ([
        [[occurrences, effectRequests], [effectPlacements, proposals]],
        [sessions, connectionStatus],
      ]) =>
        Effect.gen(function* () {
          yield* setCurrentSession(sessions)
          if (connectionStatus !== 'authenticated') {
            return
          }
          const state = yield* SynchronizedRef.get(stateRef)
          yield* validateCurrentSession(state)
          yield* recoverAcceptedOccurrences(occurrences)
          yield* recoverEffectRequests(effectRequests)
          yield* recoverEffectPlacements(effectPlacements)
          yield* Effect.forEach(
            Array.sort(proposals, proposalOrder),
            proposal =>
              admit(proposal).pipe(
                Effect.catchIf(isProposalRejection, rejection =>
                  onProposalRejected(proposal, rejection),
                ),
              ),
            {
              concurrency: 1,
              discard: true,
            },
          )
        }),
    ).pipe(Effect.flatMap(() => Effect.never))

    return {
      admit,
      recoverAcceptedOccurrences,
      recoverEffectPlacements,
      recoverEffectRequests,
      run,
    }
  })
