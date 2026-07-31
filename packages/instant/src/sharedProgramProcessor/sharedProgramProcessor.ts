import {
  Array,
  Data,
  Deferred,
  Effect,
  Exit,
  Fiber,
  HashSet,
  Match as M,
  Option,
  Schema as S,
  Scope,
  Semaphore,
  Stream,
  SubscriptionRef,
  SynchronizedRef,
  Tuple,
} from 'effect'

import {
  type AcceptedOccurrenceCursorError,
  makeAcceptedOccurrenceCursor,
} from '../acceptedOccurrenceCursor/index.js'
import {
  ProgramStoreConnectionStatus,
  type ProgramStoreConnectionStatus as ProgramStoreConnectionStatusType,
  type ProgramStoreError,
  type ProgramStoreService,
  type ProgramStoreTransactionOutcome,
} from '../programStore/index.js'
import {
  type InstantAcceptedMessageOccurrenceRecord,
  type InstantEffectRequestRecord,
  InstantMessageProposalRecord,
  type InstantMessageProposalRecord as InstantMessageProposalRecordType,
} from '../schema/index.js'

const Detached = S.TaggedStruct('Detached', {})
const Attached = S.TaggedStruct('Attached', {
  transportStatus: S.Union([
    S.Literal('unknown'),
    ProgramStoreConnectionStatus,
  ]),
})

/** The transport state of a shared Program Processor. */
export const SharedProgramConnection = S.Union([Detached, Attached])
/** The transport state of a shared Program Processor. */
export type SharedProgramConnection = typeof SharedProgramConnection.Type

const LiveReplay = S.TaggedStruct('Live', {})
const InspectingReplay = S.TaggedStruct('Inspecting', {
  frame: S.Int,
})

/** Whether the shell displays the live accepted Model or an inert replay frame. */
export const SharedProgramReplayMode = S.Union([LiveReplay, InspectingReplay])
/** Whether the shell displays the live accepted Model or an inert replay frame. */
export type SharedProgramReplayMode = typeof SharedProgramReplayMode.Type

/** How far one local proposal has progressed without implying acceptance. */
export const PendingProposalPersistence = S.Literals([
  'Local',
  'Enqueued',
  'Synced',
])
/** How far one local proposal has progressed without implying acceptance. */
export type PendingProposalPersistence = typeof PendingProposalPersistence.Type

/** One locally pending proposal and its non-authoritative persistence status. */
export const PendingProgramProposal = S.Struct({
  persistence: PendingProposalPersistence,
  proposal: InstantMessageProposalRecord,
})
/** One locally pending proposal and its non-authoritative persistence status. */
export type PendingProgramProposal = typeof PendingProgramProposal.Type

/** Builds the portable shell snapshot Schema for one shared Program. */
export const makeSharedProgramProcessorSnapshotSchema = <Model>(
  Model: S.Codec<Model, unknown, never, never>,
) =>
  S.Struct({
    acceptedModel: Model,
    acceptedSequence: S.Int,
    connection: SharedProgramConnection,
    displayedModel: Model,
    pendingProposals: S.Array(PendingProgramProposal),
    programId: S.String,
    programVersion: S.Int,
    replayMode: SharedProgramReplayMode,
    sessionId: S.String,
    subjectId: S.String,
  })

/** One atomic shell view of live accepted state, pending proposals, and replay. */
export type SharedProgramProcessorSnapshot<Model> = Readonly<{
  acceptedModel: Model
  acceptedSequence: number
  connection: SharedProgramConnection
  displayedModel: Model
  pendingProposals: ReadonlyArray<PendingProgramProposal>
  programId: string
  programVersion: number
  replayMode: SharedProgramReplayMode
  sessionId: string
  subjectId: string
}>

/** The subset of a live Foldkit ProgramRuntime consumed by this adapter. */
export type SharedProgramRuntime<Model, Message, Envelope, ReplayError> =
  Readonly<{
    readModel: () => Model
    replay: Readonly<{
      inspect: (frame: number) => Effect.Effect<Model, ReplayError>
    }>
    run: (
      message: Message,
      options: Readonly<{ envelope: Envelope }>,
    ) => Effect.Effect<Model>
  }>

/** Metadata that identifies one versioned Message payload. */
export type SharedProgramEventMetadata = Readonly<{
  eventId: string
  eventVersion: number
}>

/** Context supplied while Schema-encoding one proposed Message. */
export type ProposedMessageEnvelopeInput = Readonly<{
  actorSequence: number
  clientId: string
  createdAtMs: number
  maybeCausationOccurrenceId: Option.Option<string>
  maybeCorrelationId: Option.Option<string>
  occurrenceId: string
  originDeviceId: string
  originatingProcessorId: string
  programId: string
  programVersion: number
  sessionId: string
  subjectId: string
}>

/** The Schema-backed wire data produced for one local Message. */
export type EncodedProgramMessage = Readonly<{
  envelopeJson: string
  envelopeVersion: number
  eventId: string
  eventVersion: number
  payloadJson: string
}>

/** A decoded accepted Message and its Foldkit provenance envelope. */
export type DecodedAcceptedProgramMessage<Message, Envelope> = Readonly<{
  envelope: Envelope
  message: Message
}>

/** Schema-backed encoding and decoding at the Program Message protocol boundary. */
export type SharedProgramMessageCodec<Message, Envelope> = Readonly<{
  acceptEnvelope: (
    proposal: InstantMessageProposalRecordType,
    input: Readonly<{
      acceptedAtMs: number
      acceptedSequence: number
      acceptingProcessorId: string
      effectRequest?: InstantEffectRequestRecord | undefined
    }>,
  ) => Effect.Effect<string, SharedProgramCodecError>
  decodeAccepted: (
    occurrence: InstantAcceptedMessageOccurrenceRecord,
  ) => Effect.Effect<
    DecodedAcceptedProgramMessage<Message, Envelope>,
    SharedProgramCodecError
  >
  encodeProposed: (
    message: Message,
    input: ProposedMessageEnvelopeInput,
  ) => Effect.Effect<EncodedProgramMessage, SharedProgramCodecError>
}>

/** Schema message codec configuration independent of any renderer or transport. */
export type SchemaProgramMessageCodecConfig<Message, Envelope> = Readonly<{
  Envelope: S.Codec<Envelope, unknown, never, never>
  Message: S.Codec<Message, unknown, never, never>
  acceptEnvelope: (
    envelope: Envelope,
    input: Readonly<{
      acceptedAtMs: number
      acceptedSequence: number
      acceptingProcessorId: string
    }>,
  ) => Envelope
  envelopeVersion: number
  eventMetadata: (message: Message) => SharedProgramEventMetadata
  makeProposedEnvelope: (
    message: Message,
    input: ProposedMessageEnvelopeInput,
  ) => Envelope
  validateProposedEnvelope: (
    envelope: Envelope,
    proposal: InstantMessageProposalRecordType,
  ) => Effect.Effect<void, unknown>
}>

/** A Message or provenance envelope failed its Program-owned Schema. */
export class SharedProgramCodecError extends Data.TaggedError(
  'SharedProgramCodecError',
)<{
  readonly cause: unknown
  readonly operation: 'AcceptEnvelope' | 'DecodeAccepted' | 'EncodeProposed'
}> {}

/** An accepted occurrence escaped the Processor's authenticated Program scope. */
export class SharedProgramScopeMismatch extends Data.TaggedError(
  'SharedProgramScopeMismatch',
)<{
  readonly occurrenceId: string
}> {}

/** Inert replay inspection failed without dispatching a historical Message. */
export class SharedProgramReplayError extends Data.TaggedError(
  'SharedProgramReplayError',
)<{
  readonly cause: unknown
  readonly frame: number
}> {}

/** A host-owned durable actor sequence could not be advanced. */
export class SharedProgramActorSequenceError extends Data.TaggedError(
  'SharedProgramActorSequenceError',
)<{
  readonly cause: unknown
}> {}

/** A local Message could not be converted into a durable proposal. */
export type SharedProgramProposalError =
  | SharedProgramActorSequenceError
  | SharedProgramCodecError

/** A shared Program Processor operation failed. */
export type SharedProgramProcessorError =
  | AcceptedOccurrenceCursorError
  | ProgramStoreError
  | SharedProgramCodecError
  | SharedProgramReplayError
  | SharedProgramScopeMismatch

/** Configuration for one authenticated shared Program Processor. */
export type SharedProgramProcessorConfig<
  Model,
  Message,
  Envelope,
  ReplayError,
> = Readonly<{
  actorId: string
  clientId: string
  codec: SharedProgramMessageCodec<Message, Envelope>
  makeId: () => string
  Model: S.Codec<Model, unknown, never, never>
  now: () => number
  nextActorSequence: Effect.Effect<number, unknown>
  originDeviceId: string
  originatingProcessorId: string
  programId: string
  programVersion: number
  runtime: SharedProgramRuntime<Model, Message, Envelope, ReplayError>
  sessionId: string
  store: ProgramStoreService
  subjectId: string
  throughAcceptedSequence?: number
}>

/** Correlation required when a delegated effect result re-enters Message intake. */
export type CorrelatedProposalInput = Readonly<{
  maybeCausationOccurrenceId: Option.Option<string>
  maybeCorrelationId: Option.Option<string>
}>

/** Correlation and exact placement generation required for an effect result. */
export type EffectResultProposalInput = CorrelatedProposalInput &
  Readonly<{
    effectAssignmentGeneration: number
    effectCancellationGeneration: number
    effectIdempotencyKey: string
    effectRequestId: string
  }>

/** A live Processor bridge that mutates its Model only from accepted occurrences. */
export type SharedProgramProcessorService<Model, Message> = Readonly<{
  connect: Effect.Effect<void, SharedProgramProcessorError>
  disconnect: Effect.Effect<void>
  inspectReplay: (
    frame: number,
  ) => Effect.Effect<void, SharedProgramReplayError>
  propose: (
    message: Message,
  ) => Effect.Effect<
    InstantMessageProposalRecordType,
    SharedProgramProposalError
  >
  proposeCorrelated: (
    message: Message,
    input: CorrelatedProposalInput,
  ) => Effect.Effect<
    InstantMessageProposalRecordType,
    SharedProgramProposalError
  >
  proposeEffectResult: (
    message: Message,
    input: EffectResultProposalInput,
  ) => Effect.Effect<
    InstantMessageProposalRecordType,
    SharedProgramProposalError
  >
  readSnapshot: Effect.Effect<SharedProgramProcessorSnapshot<Model>>
  returnLive: Effect.Effect<void>
  snapshots: Stream.Stream<SharedProgramProcessorSnapshot<Model>>
}>

/** Creates a Message codec whose payload and provenance are both Schema checked. */
export const makeSchemaProgramMessageCodec = <Message, Envelope>({
  Envelope,
  Message,
  acceptEnvelope,
  envelopeVersion,
  eventMetadata,
  makeProposedEnvelope,
  validateProposedEnvelope,
}: SchemaProgramMessageCodecConfig<
  Message,
  Envelope
>): SharedProgramMessageCodec<Message, Envelope> => {
  const EnvelopeJson = S.fromJsonString(Envelope)
  const MessageJson = S.fromJsonString(Message)
  return {
    acceptEnvelope: (proposal, input) =>
      Effect.gen(function* () {
        const envelope = yield* Effect.try({
          try: () => S.decodeUnknownSync(EnvelopeJson)(proposal.envelopeJson),
          catch: cause =>
            new SharedProgramCodecError({
              cause,
              operation: 'AcceptEnvelope',
            }),
        })
        yield* validateProposedEnvelope(envelope, proposal).pipe(
          Effect.mapError(
            cause =>
              new SharedProgramCodecError({
                cause,
                operation: 'AcceptEnvelope',
              }),
          ),
        )
        return yield* Effect.try({
          try: () =>
            S.encodeSync(EnvelopeJson)(acceptEnvelope(envelope, input)),
          catch: cause =>
            new SharedProgramCodecError({
              cause,
              operation: 'AcceptEnvelope',
            }),
        })
      }),
    decodeAccepted: occurrence =>
      Effect.try({
        try: () => ({
          envelope: S.decodeUnknownSync(EnvelopeJson)(occurrence.envelopeJson),
          message: S.decodeUnknownSync(MessageJson)(occurrence.payloadJson),
        }),
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation: 'DecodeAccepted',
          }),
      }),
    encodeProposed: (message, input) =>
      Effect.try({
        try: () => {
          const metadata = eventMetadata(message)
          return {
            envelopeJson: S.encodeSync(EnvelopeJson)(
              makeProposedEnvelope(message, input),
            ),
            envelopeVersion,
            eventId: metadata.eventId,
            eventVersion: metadata.eventVersion,
            payloadJson: S.encodeSync(MessageJson)(message),
          }
        },
        catch: cause =>
          new SharedProgramCodecError({
            cause,
            operation: 'EncodeProposed',
          }),
      }),
  }
}

const persistenceFromOutcome = (
  outcome: ProgramStoreTransactionOutcome,
): PendingProposalPersistence =>
  M.value(outcome).pipe(
    M.withReturnType<PendingProposalPersistence>(),
    M.tagsExhaustive({
      Enqueued: () => 'Enqueued',
      Synced: () => 'Synced',
    }),
  )

const updatePendingPersistence = <Model>(
  state: SharedProgramProcessorSnapshot<Model>,
  proposalId: string,
  persistence: PendingProposalPersistence,
): SharedProgramProcessorSnapshot<Model> => ({
  ...state,
  pendingProposals: Array.map(state.pendingProposals, pending =>
    pending.proposal.proposalId === proposalId
      ? PendingProgramProposal.make({
          persistence,
          proposal: pending.proposal,
        })
      : pending,
  ),
})

const removeAcceptedProposal = <Model>(
  state: SharedProgramProcessorSnapshot<Model>,
  occurrence: InstantAcceptedMessageOccurrenceRecord,
): SharedProgramProcessorSnapshot<Model> => ({
  ...state,
  pendingProposals: Array.filter(
    state.pendingProposals,
    pending =>
      pending.proposal.proposalId !== occurrence.proposalId &&
      (occurrence.effectIdempotencyKey === null ||
        pending.proposal.effectIdempotencyKey !==
          occurrence.effectIdempotencyKey),
  ),
})

/** Creates an Effect-scoped bridge from a ProgramStore to one live ProgramRuntime. */
export const makeSharedProgramProcessor = <
  Model,
  Message,
  Envelope,
  ReplayError,
>({
  actorId,
  clientId,
  codec,
  makeId,
  Model,
  nextActorSequence,
  now,
  originDeviceId,
  originatingProcessorId,
  programId,
  programVersion,
  runtime,
  sessionId,
  store,
  subjectId,
  throughAcceptedSequence = 0,
}: SharedProgramProcessorConfig<
  Model,
  Message,
  Envelope,
  ReplayError
>): Effect.Effect<
  SharedProgramProcessorService<Model, Message>,
  never,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const cursor = yield* makeAcceptedOccurrenceCursor(
      sessionId,
      throughAcceptedSequence,
    )
    type ActiveTransportLifecycle = Readonly<{
      _tag: 'Active'
      generation: number
      initialized: Deferred.Deferred<void, SharedProgramProcessorError>
      observerFibers: ReadonlyArray<
        Fiber.Fiber<never, SharedProgramProcessorError>
      >
    }>
    type DisconnectingTransportLifecycle = Readonly<{
      _tag: 'Disconnecting'
      completed: Deferred.Deferred<void>
      connection: SharedProgramConnection
      generation: number
      initialized: Deferred.Deferred<void, SharedProgramProcessorError>
      observerFibers: ReadonlyArray<
        Fiber.Fiber<never, SharedProgramProcessorError>
      >
    }>
    type TransportLifecycle =
      | ActiveTransportLifecycle
      | DisconnectingTransportLifecycle
      | Readonly<{
          _tag: 'Disconnected'
          generation: number
        }>
    const transportLifecycleRef =
      yield* SynchronizedRef.make<TransportLifecycle>({
        _tag: 'Disconnected',
        generation: 0,
      })
    const transportCallbackSemaphore = yield* Semaphore.make(1)
    const acceptedEffectIdempotencyKeys = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )
    const acceptedProposalIds = yield* SynchronizedRef.make(
      HashSet.empty<string>(),
    )
    const initialModel = S.decodeUnknownSync(Model)(runtime.readModel())
    const snapshotRef = yield* SubscriptionRef.make<
      SharedProgramProcessorSnapshot<Model>
    >({
      acceptedModel: initialModel,
      acceptedSequence: throughAcceptedSequence,
      connection: Detached.make({}),
      displayedModel: initialModel,
      pendingProposals: [],
      programId,
      programVersion,
      replayMode: LiveReplay.make({}),
      sessionId,
      subjectId,
    })

    const setConnection = (
      connection: SharedProgramConnection,
    ): Effect.Effect<void> =>
      SubscriptionRef.update(snapshotRef, snapshot => ({
        ...snapshot,
        connection,
      }))

    const setTransportStatus = (
      transportStatus: ProgramStoreConnectionStatusType,
    ): Effect.Effect<void> =>
      setConnection(
        Attached.make({
          transportStatus,
        }),
      )

    const runAcceptedOccurrence = (
      occurrence: InstantAcceptedMessageOccurrenceRecord,
    ): Effect.Effect<Model, SharedProgramProcessorError> => {
      if (
        occurrence.programId !== programId ||
        occurrence.programVersion !== programVersion ||
        occurrence.sessionId !== sessionId ||
        occurrence.subjectId !== subjectId
      ) {
        return Effect.fail(
          new SharedProgramScopeMismatch({
            occurrenceId: occurrence.occurrenceId,
          }),
        )
      }
      return Effect.gen(function* () {
        const decoded = yield* codec.decodeAccepted(occurrence)
        return yield* runtime.run(decoded.message, {
          envelope: decoded.envelope,
        })
      })
    }

    const commitAppliedOccurrence = (
      occurrence: InstantAcceptedMessageOccurrenceRecord,
      acceptedModel: Model,
    ): Effect.Effect<void, AcceptedOccurrenceCursorError> =>
      Effect.gen(function* () {
        yield* cursor.commit(occurrence)
        yield* SynchronizedRef.update(acceptedProposalIds, proposalIds =>
          HashSet.add(proposalIds, occurrence.proposalId),
        )
        if (
          occurrence.proposalKind === 'EffectResult' &&
          occurrence.effectIdempotencyKey !== null
        ) {
          const effectIdempotencyKey = occurrence.effectIdempotencyKey
          yield* SynchronizedRef.update(
            acceptedEffectIdempotencyKeys,
            acceptedKeys => HashSet.add(acceptedKeys, effectIdempotencyKey),
          )
        }
        yield* SubscriptionRef.update(snapshotRef, snapshot => {
          const nextSnapshot = removeAcceptedProposal(snapshot, occurrence)
          if (snapshot.replayMode._tag === 'Live') {
            return {
              ...nextSnapshot,
              acceptedModel,
              acceptedSequence: occurrence.acceptedSequence,
              displayedModel: acceptedModel,
            }
          } else {
            return {
              ...nextSnapshot,
              acceptedModel,
              acceptedSequence: occurrence.acceptedSequence,
            }
          }
        })
      })

    const drainStagedOccurrences: Effect.Effect<
      void,
      SharedProgramProcessorError
    > = Effect.suspend(() =>
      cursor.next.pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.void,
            onSome: occurrence =>
              Effect.uninterruptibleMask(restore =>
                restore(runAcceptedOccurrence(occurrence)).pipe(
                  Effect.flatMap(acceptedModel =>
                    commitAppliedOccurrence(occurrence, acceptedModel),
                  ),
                ),
              ).pipe(Effect.andThen(drainStagedOccurrences)),
          }),
        ),
      ),
    )

    const ingestSnapshot = (
      occurrences: ReadonlyArray<InstantAcceptedMessageOccurrenceRecord>,
    ): Effect.Effect<void, SharedProgramProcessorError> =>
      Effect.gen(function* () {
        yield* cursor.stage(occurrences)
        yield* drainStagedOccurrences
      })

    const recoverClientProposals = (
      proposals: ReadonlyArray<InstantMessageProposalRecordType>,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const acceptedIds = yield* SynchronizedRef.get(acceptedProposalIds)
        const acceptedEffectKeys = yield* SynchronizedRef.get(
          acceptedEffectIdempotencyKeys,
        )
        const recoverable = Array.filter(
          proposals,
          proposal =>
            proposal.clientId === clientId &&
            !HashSet.has(acceptedIds, proposal.proposalId) &&
            (proposal.proposalKind !== 'EffectResult' ||
              proposal.effectIdempotencyKey === null ||
              !HashSet.has(acceptedEffectKeys, proposal.effectIdempotencyKey)),
        )
        yield* SubscriptionRef.update(snapshotRef, snapshot => ({
          ...snapshot,
          pendingProposals: Array.reduce(
            recoverable,
            snapshot.pendingProposals,
            (pendingProposals, proposal) => {
              const maybeExisting = Array.findFirst(
                pendingProposals,
                pending => pending.proposal.proposalId === proposal.proposalId,
              )
              return Option.isSome(maybeExisting)
                ? pendingProposals
                : [
                    ...pendingProposals,
                    PendingProgramProposal.make({
                      persistence: 'Enqueued',
                      proposal,
                    }),
                  ]
            },
          ),
        }))
      })

    const whenTransportActive = <Error, Requirements>(
      generation: number,
      effect: Effect.Effect<void, Error, Requirements>,
    ): Effect.Effect<boolean, Error, Requirements> =>
      transportCallbackSemaphore.withPermit(
        Effect.gen(function* () {
          const lifecycle = yield* SynchronizedRef.get(transportLifecycleRef)
          if (
            lifecycle._tag === 'Active' &&
            lifecycle.generation === generation
          ) {
            yield* effect
            return true
          } else {
            return false
          }
        }),
      )

    const setTransportErrored = setConnection(
      Attached.make({
        transportStatus: 'errored',
      }),
    )

    const persistPending = (
      pending: PendingProgramProposal,
    ): Effect.Effect<boolean> =>
      store.appendMessageProposal(pending.proposal).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.succeed(false),
          onSuccess: outcome =>
            SubscriptionRef.update(snapshotRef, snapshot =>
              updatePendingPersistence(
                snapshot,
                pending.proposal.proposalId,
                persistenceFromOutcome(outcome),
              ),
            ).pipe(Effect.as(true)),
        }),
      )

    const flushPending = (generation: number): Effect.Effect<void> =>
      SubscriptionRef.get(snapshotRef).pipe(
        Effect.flatMap(snapshot =>
          Effect.forEach(
            Array.filter(
              snapshot.pendingProposals,
              pending => pending.persistence === 'Local',
            ),
            pending =>
              persistPending(pending).pipe(
                Effect.flatMap(didPersist =>
                  didPersist
                    ? Effect.void
                    : Effect.gen(function* () {
                        const lifecycle = yield* SynchronizedRef.get(
                          transportLifecycleRef,
                        )
                        if (
                          lifecycle._tag === 'Active' &&
                          lifecycle.generation === generation
                        ) {
                          yield* setTransportErrored
                        }
                      }),
                ),
              ),
            {
              concurrency: 1,
              discard: true,
            },
          ),
        ),
      )

    type TransportTeardownPlan =
      | Readonly<{
          _tag: 'AlreadyDisconnected'
        }>
      | Readonly<{
          _tag: 'AwaitingTeardown'
          completed: Deferred.Deferred<void>
          initialized: Deferred.Deferred<void, SharedProgramProcessorError>
        }>
      | Readonly<{
          _tag: 'StartedTeardown'
          completed: Deferred.Deferred<void>
          lifecycle: ActiveTransportLifecycle
        }>

    const transportTeardownResult = (
      plan: TransportTeardownPlan,
      lifecycle: TransportLifecycle,
    ): readonly [TransportTeardownPlan, TransportLifecycle] =>
      Tuple.make(plan, lifecycle)

    const disconnectedTransportLifecycle = (
      generation: number,
    ): TransportLifecycle => ({
      _tag: 'Disconnected',
      generation,
    })

    const runTransportTeardown = (
      lifecycle: ActiveTransportLifecycle,
      completed: Deferred.Deferred<void>,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* transportCallbackSemaphore.withPermit(
          Effect.gen(function* () {
            yield* Effect.forEach(
              lifecycle.observerFibers,
              fiber => Effect.forkIn(Fiber.interrupt(fiber), scope),
              { discard: true },
            )
            yield* SynchronizedRef.modifyEffect(
              transportLifecycleRef,
              currentLifecycle => {
                if (
                  currentLifecycle._tag === 'Disconnecting' &&
                  currentLifecycle.generation === lifecycle.generation &&
                  currentLifecycle.completed === completed
                ) {
                  return Effect.gen(function* () {
                    yield* setConnection(currentLifecycle.connection)
                    yield* Deferred.succeed(completed, undefined)
                    return Tuple.make(
                      undefined,
                      disconnectedTransportLifecycle(lifecycle.generation),
                    )
                  })
                } else {
                  return Effect.succeed(Tuple.make(undefined, currentLifecycle))
                }
              },
            )
          }),
        )
      })

    const initiateTransportTeardown = (
      maybeExpectedGeneration: Option.Option<number>,
      connection: SharedProgramConnection,
    ): Effect.Effect<Option.Option<Deferred.Deferred<void>>> =>
      Effect.uninterruptible(
        SynchronizedRef.modifyEffect(
          transportLifecycleRef,
          currentLifecycle => {
            if (currentLifecycle._tag === 'Active') {
              if (
                Option.isSome(maybeExpectedGeneration) &&
                maybeExpectedGeneration.value !== currentLifecycle.generation
              ) {
                return Effect.succeed(
                  transportTeardownResult(
                    { _tag: 'AlreadyDisconnected' },
                    currentLifecycle,
                  ),
                )
              }
              return Effect.gen(function* () {
                const completed = yield* Deferred.make<void>()
                yield* setConnection(connection)
                return transportTeardownResult(
                  {
                    _tag: 'StartedTeardown',
                    completed,
                    lifecycle: currentLifecycle,
                  },
                  {
                    _tag: 'Disconnecting',
                    completed,
                    connection,
                    generation: currentLifecycle.generation,
                    initialized: currentLifecycle.initialized,
                    observerFibers: currentLifecycle.observerFibers,
                  },
                )
              })
            } else if (currentLifecycle._tag === 'Disconnecting') {
              const isExplicitDisconnect = Option.isNone(
                maybeExpectedGeneration,
              )
              if (isExplicitDisconnect) {
                return setConnection(connection).pipe(
                  Effect.as(
                    transportTeardownResult(
                      {
                        _tag: 'AwaitingTeardown',
                        completed: currentLifecycle.completed,
                        initialized: currentLifecycle.initialized,
                      },
                      {
                        ...currentLifecycle,
                        connection,
                      },
                    ),
                  ),
                )
              } else {
                return Effect.succeed(
                  transportTeardownResult(
                    {
                      _tag: 'AwaitingTeardown',
                      completed: currentLifecycle.completed,
                      initialized: currentLifecycle.initialized,
                    },
                    currentLifecycle,
                  ),
                )
              }
            } else if (Option.isNone(maybeExpectedGeneration)) {
              return setConnection(connection).pipe(
                Effect.as(
                  transportTeardownResult(
                    { _tag: 'AlreadyDisconnected' },
                    currentLifecycle,
                  ),
                ),
              )
            } else {
              return Effect.succeed(
                transportTeardownResult(
                  { _tag: 'AlreadyDisconnected' },
                  currentLifecycle,
                ),
              )
            }
          },
        ).pipe(
          Effect.flatMap(plan => {
            if (plan._tag === 'StartedTeardown') {
              return Effect.gen(function* () {
                const teardownFiber = yield* Effect.forkIn(
                  runTransportTeardown(plan.lifecycle, plan.completed),
                  scope,
                )
                yield* Effect.sync(() => {
                  teardownFiber.addObserver(exit => {
                    Deferred.doneUnsafe(plan.completed, exit)
                  })
                })
                if (Option.isNone(maybeExpectedGeneration)) {
                  yield* Deferred.interrupt(plan.lifecycle.initialized)
                }
                return Option.some(plan.completed)
              })
            } else if (plan._tag === 'AwaitingTeardown') {
              return Effect.gen(function* () {
                if (Option.isNone(maybeExpectedGeneration)) {
                  yield* Deferred.interrupt(plan.initialized)
                }
                return Option.some(plan.completed)
              })
            } else {
              return Effect.succeed(Option.none())
            }
          }),
        ),
      )

    const connect: Effect.Effect<void, SharedProgramProcessorError> =
      Effect.suspend(() =>
        Effect.uninterruptible(
          SynchronizedRef.modifyEffect(
            transportLifecycleRef,
            currentLifecycle => {
              if (currentLifecycle._tag === 'Active') {
                return Effect.succeed(
                  Tuple.make(
                    Deferred.await(currentLifecycle.initialized),
                    currentLifecycle,
                  ),
                )
              } else if (currentLifecycle._tag === 'Disconnecting') {
                return Effect.succeed(
                  Tuple.make(
                    Deferred.await(currentLifecycle.completed).pipe(
                      Effect.andThen(connect),
                    ),
                    currentLifecycle,
                  ),
                )
              }
              return Effect.gen(function* () {
                const generation = currentLifecycle.generation + 1
                const initialized = yield* Deferred.make<
                  void,
                  SharedProgramProcessorError
                >()
                yield* setConnection(
                  Attached.make({
                    transportStatus: 'unknown',
                  }),
                )
                const acceptedInitialized = yield* Deferred.make<
                  void,
                  SharedProgramProcessorError
                >()
                const connectionInitialized = yield* Deferred.make<void>()
                const proposalsInitialized = yield* Deferred.make<
                  void,
                  SharedProgramProcessorError
                >()
                const transportExited = yield* Deferred.make<
                  never,
                  SharedProgramProcessorError
                >()
                const isFirstAcceptedSnapshot =
                  yield* SynchronizedRef.make(true)
                const isFirstProposalSnapshot =
                  yield* SynchronizedRef.make(true)
                const observeAccepted = Stream.runForEach(
                  store.observeAcceptedMessageOccurrences({
                    sessionId,
                    subjectId,
                  }),
                  occurrences =>
                    whenTransportActive(
                      generation,
                      Effect.gen(function* () {
                        yield* ingestSnapshot(occurrences)
                        const isFirst = yield* SynchronizedRef.getAndSet(
                          isFirstAcceptedSnapshot,
                          false,
                        )
                        if (isFirst) {
                          yield* Deferred.succeed(
                            acceptedInitialized,
                            undefined,
                          )
                        }
                      }),
                    ).pipe(Effect.asVoid),
                ).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onExit(exit =>
                    Effect.gen(function* () {
                      yield* Deferred.done(transportExited, exit)
                      if (Exit.isFailure(exit)) {
                        yield* Deferred.done(acceptedInitialized, exit)
                      }
                    }),
                  ),
                )
                const observeConnection = Stream.runForEach(
                  store.observeConnectionStatus,
                  transportStatus =>
                    whenTransportActive(
                      generation,
                      Effect.gen(function* () {
                        yield* setTransportStatus(transportStatus)
                        if (transportStatus === 'authenticated') {
                          yield* flushPending(generation)
                        }
                        yield* Deferred.succeed(
                          connectionInitialized,
                          undefined,
                        )
                      }),
                    ).pipe(Effect.asVoid),
                ).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onExit(exit =>
                    Effect.gen(function* () {
                      yield* Deferred.done(transportExited, exit)
                      if (Exit.isFailure(exit)) {
                        yield* Deferred.interrupt(connectionInitialized)
                      }
                    }),
                  ),
                )
                const observeProposals = Stream.runForEach(
                  store.observeMessageProposals({
                    sessionId,
                    subjectId,
                  }),
                  proposals =>
                    whenTransportActive(
                      generation,
                      Effect.gen(function* () {
                        yield* recoverClientProposals(proposals)
                        const isFirst = yield* SynchronizedRef.getAndSet(
                          isFirstProposalSnapshot,
                          false,
                        )
                        if (isFirst) {
                          yield* Deferred.succeed(
                            proposalsInitialized,
                            undefined,
                          )
                        }
                      }),
                    ).pipe(Effect.asVoid),
                ).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onExit(exit =>
                    Effect.gen(function* () {
                      yield* Deferred.done(transportExited, exit)
                      if (Exit.isFailure(exit)) {
                        yield* Deferred.done(proposalsInitialized, exit)
                      }
                    }),
                  ),
                )
                const observerFibers = yield* Effect.forEach(
                  [observeAccepted, observeConnection, observeProposals],
                  observer => Effect.forkIn(observer, scope),
                )
                const lifecycle: ActiveTransportLifecycle = {
                  _tag: 'Active',
                  generation,
                  initialized,
                  observerFibers,
                }
                const initialize = Effect.all(
                  [
                    Deferred.await(acceptedInitialized),
                    Deferred.await(connectionInitialized),
                    Deferred.await(proposalsInitialized),
                  ],
                  {
                    concurrency: 'unbounded',
                    discard: true,
                  },
                ).pipe(
                  Effect.andThen(
                    Effect.gen(function* () {
                      const isActive = yield* whenTransportActive(
                        generation,
                        flushPending(generation),
                      )
                      if (!isActive) {
                        return yield* Effect.interrupt
                      }
                    }),
                  ),
                )
                const supervise = Effect.gen(function* () {
                  const initializationExit = yield* Effect.exit(initialize)
                  if (Exit.isFailure(initializationExit)) {
                    const maybeCompleted = yield* initiateTransportTeardown(
                      Option.some(generation),
                      Attached.make({
                        transportStatus: 'errored',
                      }),
                    )
                    if (Option.isSome(maybeCompleted)) {
                      yield* Deferred.await(maybeCompleted.value)
                    }
                    yield* Deferred.done(initialized, initializationExit)
                  } else {
                    yield* Deferred.done(initialized, initializationExit)
                    yield* Effect.exit(Deferred.await(transportExited))
                    yield* initiateTransportTeardown(
                      Option.some(generation),
                      Attached.make({
                        transportStatus: 'errored',
                      }),
                    )
                  }
                })
                yield* Effect.uninterruptible(
                  Effect.flatMap(Effect.forkIn(supervise, scope), fiber =>
                    Effect.sync(() => {
                      fiber.addObserver(exit => {
                        Deferred.doneUnsafe(initialized, exit)
                      })
                    }),
                  ),
                )
                return Tuple.make(Deferred.await(initialized), lifecycle)
              })
            },
          ),
        ).pipe(Effect.flatten),
      )

    const disconnect: Effect.Effect<void> = initiateTransportTeardown(
      Option.none(),
      Detached.make({}),
    ).pipe(
      Effect.flatMap(maybeCompleted => {
        if (Option.isSome(maybeCompleted)) {
          return Deferred.await(maybeCompleted.value)
        } else {
          return Effect.void
        }
      }),
    )

    const appendPending = (
      proposal: InstantMessageProposalRecordType,
    ): Effect.Effect<void> =>
      SubscriptionRef.update(snapshotRef, snapshot => ({
        ...snapshot,
        pendingProposals: [
          ...snapshot.pendingProposals,
          PendingProgramProposal.make({
            persistence: 'Local',
            proposal,
          }),
        ],
      }))

    const proposeWithKind = (
      message: Message,
      correlation: CorrelatedProposalInput,
      effectResult: Option.Option<EffectResultProposalInput>,
    ): Effect.Effect<
      InstantMessageProposalRecordType,
      SharedProgramProposalError
    > =>
      Effect.gen(function* () {
        const actorSequence = yield* nextActorSequence.pipe(
          Effect.mapError(
            cause =>
              new SharedProgramActorSequenceError({
                cause,
              }),
          ),
        )
        const occurrenceId = makeId()
        const createdAtMs = now()
        const encoded = yield* codec.encodeProposed(message, {
          actorSequence,
          clientId,
          createdAtMs,
          maybeCausationOccurrenceId: correlation.maybeCausationOccurrenceId,
          maybeCorrelationId: correlation.maybeCorrelationId,
          occurrenceId,
          originDeviceId,
          originatingProcessorId,
          programId,
          programVersion,
          sessionId,
          subjectId,
        })
        const proposal = InstantMessageProposalRecord.make({
          actorId,
          actorSequence,
          causationOccurrenceId: Option.getOrNull(
            correlation.maybeCausationOccurrenceId,
          ),
          clientId,
          correlationId: Option.getOrNull(correlation.maybeCorrelationId),
          createdAtMs,
          effectAssignmentGeneration: Option.match(effectResult, {
            onNone: () => null,
            onSome: result => result.effectAssignmentGeneration,
          }),
          effectCancellationGeneration: Option.match(effectResult, {
            onNone: () => null,
            onSome: result => result.effectCancellationGeneration,
          }),
          effectIdempotencyKey: Option.match(effectResult, {
            onNone: () => null,
            onSome: result => result.effectIdempotencyKey,
          }),
          effectRequestId: Option.match(effectResult, {
            onNone: () => null,
            onSome: result => result.effectRequestId,
          }),
          envelopeJson: encoded.envelopeJson,
          envelopeVersion: encoded.envelopeVersion,
          eventId: encoded.eventId,
          eventVersion: encoded.eventVersion,
          executorProcessorId: Option.match(effectResult, {
            onNone: () => null,
            onSome: () => originatingProcessorId,
          }),
          id: occurrenceId,
          occurrenceId,
          originDeviceId,
          originatingProcessorId,
          payloadJson: encoded.payloadJson,
          programId,
          programVersion,
          proposalId: occurrenceId,
          proposalKind: Option.isSome(effectResult)
            ? 'EffectResult'
            : 'Message',
          sessionId,
          subjectId,
        })
        const acceptedKeys = yield* SynchronizedRef.get(
          acceptedEffectIdempotencyKeys,
        )
        const isAcceptedEffectResult = Option.match(effectResult, {
          onNone: () => false,
          onSome: result =>
            HashSet.has(acceptedKeys, result.effectIdempotencyKey),
        })
        if (!isAcceptedEffectResult) {
          yield* appendPending(proposal)
          const lifecycle = yield* SynchronizedRef.get(transportLifecycleRef)
          const maybeTransportGeneration =
            lifecycle._tag === 'Active'
              ? Option.some(lifecycle.generation)
              : Option.none()
          const didPersist = yield* persistPending(
            PendingProgramProposal.make({
              persistence: 'Local',
              proposal,
            }),
          )
          if (!didPersist && Option.isSome(maybeTransportGeneration)) {
            yield* whenTransportActive(
              maybeTransportGeneration.value,
              setTransportErrored,
            )
          }
        }
        return proposal
      })

    const inspectReplay = (
      frame: number,
    ): Effect.Effect<void, SharedProgramReplayError> =>
      runtime.replay.inspect(frame).pipe(
        Effect.mapError(
          cause =>
            new SharedProgramReplayError({
              cause,
              frame,
            }),
        ),
        Effect.flatMap(displayedModel =>
          SubscriptionRef.update(snapshotRef, snapshot => ({
            ...snapshot,
            displayedModel,
            replayMode: InspectingReplay.make({ frame }),
          })),
        ),
      )

    const returnLive = SubscriptionRef.update(snapshotRef, snapshot => ({
      ...snapshot,
      displayedModel: snapshot.acceptedModel,
      replayMode: LiveReplay.make({}),
    }))

    return {
      connect,
      disconnect,
      inspectReplay,
      propose: message =>
        proposeWithKind(
          message,
          {
            maybeCausationOccurrenceId: Option.none(),
            maybeCorrelationId: Option.none(),
          },
          Option.none(),
        ),
      proposeCorrelated: (message, input) =>
        proposeWithKind(message, input, Option.none()),
      proposeEffectResult: (message, input) =>
        proposeWithKind(message, input, Option.some(input)),
      readSnapshot: SubscriptionRef.get(snapshotRef),
      returnLive,
      snapshots: SubscriptionRef.changes(snapshotRef),
    }
  })
