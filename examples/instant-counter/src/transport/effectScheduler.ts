import {
  Array,
  Effect,
  Option,
  Order,
  Result,
  Schema as S,
  Stream,
} from 'effect'
import * as Command from 'foldkit/command'
import * as Runtime from 'foldkit/program-runtime'

import {
  type EffectResultProposalInput,
  InstantProcessorActivity,
  type ProcessorRoomService,
  type ProgramStoreScope,
  type ProgramStoreService,
} from '@foldkit/instant'

import {
  EffectRequestKind,
  type FailedEffect,
  type Message,
  type SucceededEffect,
} from '../domain/message.js'
import { encodeMessage } from '../domain/wire.js'

const EffectArguments = S.Struct({
  durationMs: S.NullOr(S.Int),
  kind: EffectRequestKind,
  requestId: S.String,
})

const isEffectResult = (
  message: Message,
): message is SucceededEffect | FailedEffect =>
  message._tag === 'SucceededEffect' || message._tag === 'FailedEffect'

const placementOrder = Order.combine(
  Order.mapInput(
    Order.Number,
    (placement: import('@foldkit/instant').InstantEffectPlacementRecord) =>
      placement.assignmentGeneration,
  ),
  Order.mapInput(
    Order.Number,
    (placement: import('@foldkit/instant').InstantEffectPlacementRecord) =>
      placement.cancellationGeneration,
  ),
)

/** A durable local claim used before touching a device effect. */
export type EffectAttemptRegistry = Readonly<{
  claim: (idempotencyKey: string) => boolean
}>

/** Configuration for one capability-driven runtime Command scheduler. */
export type DelegatedEffectSchedulerConfig = Readonly<{
  attemptRegistry: EffectAttemptRegistry
  processorId: string
  room: ProcessorRoomService
  scope: ProgramStoreScope
  store: ProgramStoreService
}>

/** The narrow accepted-intake boundary used to return a factual effect result. */
export type EffectResultProposalSink = Readonly<{
  proposeEffectResult: (
    message: Message,
    input: EffectResultProposalInput,
  ) => Effect.Effect<unknown, unknown>
}>

/** Schedules manifested Commands only when Instant assigns this Processor. */
export class DelegatedEffectScheduler {
  readonly commandScheduler: Runtime.ProgramRuntimeCommandScheduler<Message>
  readonly #config: DelegatedEffectSchedulerConfig
  #processor: EffectResultProposalSink | null = null

  constructor(config: DelegatedEffectSchedulerConfig) {
    this.#config = config
    this.commandScheduler = {
      schedule: command => this.#schedule(command).pipe(Effect.orDie),
    }
  }

  /** Attaches the accepted-Message bridge used to propose factual results. */
  attach(processor: EffectResultProposalSink): void {
    this.#processor = processor
  }

  #activity(
    activity: 'HandlingEffect' | 'WaitingForProcessor' | 'EffectUnavailable',
    requestId: string,
  ): Effect.Effect<void> {
    return this.#config.room
      .publishActivity(
        InstantProcessorActivity.make({
          activity,
          effectRequestId: requestId,
          processorId: this.#config.processorId,
        }),
      )
      .pipe(Effect.catch(() => Effect.void))
  }

  #readAcceptedResult(
    idempotencyKey: string,
  ): Effect.Effect<boolean, import('@foldkit/instant').ProgramStoreError> {
    return Stream.runHead(
      this.#config.store.observeAcceptedMessageOccurrences(this.#config.scope),
    ).pipe(
      Effect.map(
        Option.match({
          onNone: () => false,
          onSome: occurrences =>
            Array.some(
              occurrences,
              occurrence => occurrence.effectIdempotencyKey === idempotencyKey,
            ),
        }),
      ),
    )
  }

  #awaitAcceptedResult(
    idempotencyKey: string,
  ): Effect.Effect<void, import('@foldkit/instant').ProgramStoreError> {
    return this.#config.store
      .observeAcceptedMessageOccurrences(this.#config.scope)
      .pipe(
        Stream.filter(occurrences =>
          Array.some(
            occurrences,
            occurrence => occurrence.effectIdempotencyKey === idempotencyKey,
          ),
        ),
        Stream.runHead,
        Effect.flatMap(maybeOccurrences =>
          Option.isSome(maybeOccurrences) ? Effect.void : Effect.never,
        ),
      )
  }

  #awaitRequest(
    requestId: string,
  ): Effect.Effect<
    import('@foldkit/instant').InstantEffectRequestRecord,
    import('@foldkit/instant').ProgramStoreError
  > {
    return this.#config.store.observeEffectRequests(this.#config.scope).pipe(
      Stream.filterMap(requests =>
        Option.match(
          Array.findFirst(requests, request => request.requestId === requestId),
          {
            onNone: () => Result.failVoid,
            onSome: Result.succeed,
          },
        ),
      ),
      Stream.runHead,
      Effect.flatMap(maybeRequest =>
        Option.isSome(maybeRequest)
          ? Effect.succeed(maybeRequest.value)
          : Effect.never,
      ),
    )
  }

  #awaitPlacement(
    requestId: string,
  ): Effect.Effect<
    import('@foldkit/instant').InstantEffectPlacementRecord,
    import('@foldkit/instant').ProgramStoreError
  > {
    return this.#config.store.observeEffectPlacements(this.#config.scope).pipe(
      Stream.filterMap(placements => {
        const maybeLatest = Array.last(
          Array.sort(
            Array.filter(
              placements,
              placement => placement.requestId === requestId,
            ),
            placementOrder,
          ),
        )
        if (Option.isNone(maybeLatest)) {
          return Result.failVoid
        }
        const latest = maybeLatest.value
        if (
          latest.placementStatus === 'Failed' ||
          latest.placementStatus === 'Ignored'
        ) {
          return Result.succeed(latest)
        }
        if (
          latest.placementStatus === 'AssignedPreferred' ||
          latest.placementStatus === 'AssignedFallback'
        ) {
          return Result.succeed(latest)
        }
        return Result.failVoid
      }),
      Stream.runHead,
      Effect.flatMap(maybePlacement =>
        Option.isSome(maybePlacement)
          ? Effect.succeed(maybePlacement.value)
          : Effect.never,
      ),
    )
  }

  #schedule(
    command: Runtime.ScheduledProgramCommand<Message>,
  ): Effect.Effect<void, unknown> {
    const scheduler = this
    return Effect.gen(function* () {
      const args = yield* S.decodeUnknownEffect(EffectArguments)(
        command.effectManifest.publicArguments,
      ).pipe(Effect.orDie)
      yield* scheduler.#activity('WaitingForProcessor', args.requestId)
      const request = yield* scheduler.#awaitRequest(args.requestId)
      const maybePlacement = yield* Effect.raceFirst(
        scheduler.#awaitPlacement(args.requestId).pipe(Effect.map(Option.some)),
        scheduler
          .#awaitAcceptedResult(request.idempotencyKey)
          .pipe(Effect.as(Option.none())),
      )
      if (Option.isNone(maybePlacement)) {
        return
      }
      const placement = maybePlacement.value
      if (
        placement.placementStatus !== 'AssignedPreferred' &&
        placement.placementStatus !== 'AssignedFallback'
      ) {
        yield* scheduler.#activity('EffectUnavailable', args.requestId)
        return
      }
      if (placement.assignedProcessorId !== scheduler.#config.processorId) {
        return
      }

      const isAlreadyAccepted = yield* scheduler.#readAcceptedResult(
        request.idempotencyKey,
      )
      if (isAlreadyAccepted) {
        return
      }

      const processor = scheduler.#processor
      if (processor === null) {
        return yield* Effect.die(
          'The shared Program Processor was not attached before scheduling.',
        )
      }
      if (
        command.cause._tag !== 'Message' ||
        Option.isNone(command.cause.envelope)
      ) {
        return yield* Effect.die(
          'A delegated effect is missing its accepted Message provenance.',
        )
      }
      const causeEnvelope = command.cause.envelope.value
      if (causeEnvelope.occurrenceId !== request.causalOccurrenceId) {
        return yield* Effect.die(
          'A delegated effect placement does not match its causal Message.',
        )
      }
      if (!scheduler.#config.attemptRegistry.claim(request.idempotencyKey)) {
        return
      }

      yield* scheduler.#activity('HandlingEffect', args.requestId)
      const result = yield* command.execute
      if (!isEffectResult(result)) {
        return yield* Effect.die(
          'A delegated effect returned a non-result Message.',
        )
      }
      if (
        result.kind !== args.kind ||
        result.processorId !== scheduler.#config.processorId ||
        result.requestId !== request.requestId
      ) {
        return yield* Effect.die(
          'A delegated effect result does not match its assigned request.',
        )
      }
      const event = encodeMessage(result)
      if (
        !Command.permitsResultEvent(
          command.effectManifest,
          event.eventId,
          event.eventVersion,
        )
      ) {
        return yield* Effect.die(
          'A delegated effect returned an event outside its manifest.',
        )
      }
      yield* processor.proposeEffectResult(result, {
        effectAssignmentGeneration: placement.assignmentGeneration,
        effectCancellationGeneration: placement.cancellationGeneration,
        effectIdempotencyKey: request.idempotencyKey,
        effectRequestId: request.requestId,
        maybeCausationOccurrenceId: Option.some(causeEnvelope.occurrenceId),
        maybeCorrelationId: causeEnvelope.correlationId,
      })
    })
  }
}
