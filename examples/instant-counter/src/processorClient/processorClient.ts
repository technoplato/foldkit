import { Effect, Exit, Fiber, Layer, Schedule, Scope, Stream } from 'effect'
import * as Processor from 'foldkit/processor'
import * as Runtime from 'foldkit/program-runtime'

import {
  type InstantProcessorPresence as InstantProcessorPresenceType,
  type ProcessorRoomService,
  type SharedProgramProcessorService,
  makeInstantProgramStore,
  makeProcessorRoom,
  makeSharedProgramProcessor,
} from '@foldkit/instant'

import type { InstantCounterDatabase } from '../../instant.schema.js'
import type { EffectExecutor } from '../domain/effect.js'
import type { Message } from '../domain/message.js'
import type { Model } from '../domain/model.js'
import { Model as ModelSchema } from '../domain/model.js'
import { InstantCounterProgram } from '../domain/program.js'
import {
  type Sha256HexDigest,
  programId,
  programVersion,
} from '../shared/identity.js'
import {
  isEffectExecutorAvailable,
  makeProcessorPresence,
} from '../shared/presence.js'
import { makeMessageCodec } from '../transport/codec.js'
import { DelegatedEffectScheduler } from '../transport/effectScheduler.js'
import {
  ProgramSessionError,
  ensureProgramSession,
  randomId,
} from '../transport/session.js'

const heartbeatInterval = '10 seconds'

/** Stable, non-secret identifiers for one Client installation and occurrence. */
export type ClientIdentity = Readonly<{
  clientId: string
  deviceId: string
}>

/** Allocates a durable per-Client actor sequence for one Program session. */
export type ActorSequenceRegistry = Readonly<{
  next: (sessionId: string) => Effect.Effect<number>
}>

/** Claims one local effect attempt before a host touches a device capability. */
export type AttemptedEffectRegistry = Readonly<{
  claim: (idempotencyKey: string) => boolean
}>

/** Host-specific Processor descriptor and Effect resources. */
export type ClientProcessorHost = Readonly<{
  isEffectExecutor: boolean
  makeDescriptor: (
    clientId: string,
    processorId: string,
  ) => Processor.Descriptor
  makeEffectExecutorLayer: (processorId: string) => Layer.Layer<EffectExecutor>
  processorKind: string
}>

/** Inputs needed to start one authenticated shared Program Processor. */
export type ClientProcessorConfig = Readonly<{
  actorSequences: ActorSequenceRegistry
  attemptRegistry: AttemptedEffectRegistry
  database: InstantCounterDatabase
  digest?: Sha256HexDigest
  host: ClientProcessorHost
  identity: ClientIdentity
  subjectId: string
}>

/** One running shared Program Processor and its detachable host surfaces. */
export type ClientProcessor = Readonly<{
  descriptor: Processor.Descriptor
  processorId: string
  publishEffectExecutorAvailability: (
    isAvailable: boolean,
  ) => Effect.Effect<void>
  room: ProcessorRoomService
  runtime: Runtime.ProgramRuntime<Model, Message>
  shared: SharedProgramProcessorService<Model, Message>
}>

/** A running Processor plus the finalizer for its owned allocation Scope. */
export type ClientProcessorAllocation = Readonly<{
  processor: ClientProcessor
  release: () => Promise<void>
}>

/** Starts the canonical Counter coordinator over the accepted Instant tape. */
export const makeClientProcessor = ({
  actorSequences,
  attemptRegistry,
  database,
  digest,
  host,
  identity,
  subjectId,
}: ClientProcessorConfig): Effect.Effect<
  ClientProcessor,
  ProgramSessionError | Runtime.ProgramRuntimeStartError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: signal => {
        if (digest === undefined) {
          return ensureProgramSession(database, subjectId, { signal })
        }
        return ensureProgramSession(database, subjectId, { digest, signal })
      },
      catch: cause =>
        cause instanceof ProgramSessionError
          ? cause
          : new ProgramSessionError({
              cause,
              operation: 'ObserveSession',
            }),
    })

    const processorId = `${identity.clientId}:${host.processorKind}:${randomId()}`
    const descriptor = host.makeDescriptor(identity.clientId, processorId)
    const store = makeInstantProgramStore(database)
    const room = yield* makeProcessorRoom(
      database,
      session.processorRoomId,
      makeProcessorPresence(descriptor, false, 0),
    )
    const scheduler = new DelegatedEffectScheduler({
      attemptRegistry,
      processorId,
      room,
      scope: {
        sessionId: session.sessionId,
        subjectId,
      },
      store,
    })
    const runtime = yield* Runtime.makeProgramRuntime({
      commandScheduler: scheduler.commandScheduler,
      program: InstantCounterProgram,
      resources: host.makeEffectExecutorLayer(processorId),
    })
    yield* runtime.initialization
    const shared = yield* makeSharedProgramProcessor({
      admissionSequencerProcessorId: session.authorityProcessorId,
      actorId: subjectId,
      clientId: identity.clientId,
      codec: makeMessageCodec({
        actor: Processor.AuthenticatedActor.make({ subjectId }),
      }),
      makeId: randomId,
      Model: ModelSchema,
      nextActorSequence: actorSequences.next(session.sessionId),
      now: Date.now,
      originDeviceId: identity.deviceId,
      originatingProcessorId: processorId,
      programId,
      programVersion,
      runtime,
      sessionId: session.sessionId,
      store,
      subjectId,
    })
    scheduler.attach(shared)

    const scope = yield* Effect.scope
    const publishEffectExecutorAvailability = (
      isAvailable: boolean,
    ): Effect.Effect<void> =>
      Effect.flatMap(shared.readSnapshot, snapshot =>
        room.publishPresence(
          makeProcessorPresence(
            descriptor,
            isEffectExecutorAvailable(
              snapshot.connection,
              host.isEffectExecutor && isAvailable,
            ),
            snapshot.acceptedSequence,
          ),
        ),
      ).pipe(Effect.catch(() => Effect.void))
    yield* Effect.forkIn(
      publishEffectExecutorAvailability(true).pipe(
        Effect.catch(() => Effect.void),
        Effect.repeat(Schedule.spaced(heartbeatInterval)),
      ),
      scope,
    )
    return {
      descriptor,
      processorId,
      publishEffectExecutorAvailability,
      room,
      runtime,
      shared,
    }
  })

/** Allocates a Processor with an interruptible startup and explicit lifetime. */
export const allocateClientProcessor = async (
  config: ClientProcessorConfig,
  signal?: AbortSignal,
): Promise<ClientProcessorAllocation> => {
  const scope = await Effect.runPromise(Scope.make())
  try {
    const effect = Effect.provideService(
      makeClientProcessor(config),
      Scope.Scope,
      scope,
    )
    const processor =
      signal === undefined
        ? await Effect.runPromise(effect)
        : await Effect.runPromise(effect, { signal })
    return {
      processor,
      release: () => Effect.runPromise(Scope.close(scope, Exit.void)),
    }
  } catch (error) {
    await Effect.runPromise(Scope.close(scope, Exit.die(error)))
    throw error
  }
}

/** Runs a snapshot observer and returns an asynchronous detach function. */
export const observeProcessorSnapshots = (
  processor: ClientProcessor,
  listener: (
    snapshot: import('@foldkit/instant').SharedProgramProcessorSnapshot<Model>,
  ) => void,
): (() => Promise<void>) => {
  const fiber = Effect.runFork(
    Stream.runForEach(processor.shared.snapshots, snapshot =>
      Effect.sync(() => listener(snapshot)),
    ),
  )
  return () => Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.asVoid))
}

/** Runs a presence observer and returns an asynchronous detach function. */
export const observeProcessorPresence = (
  processor: ClientProcessor,
  listener: (presence: ReadonlyArray<InstantProcessorPresenceType>) => void,
): (() => Promise<void>) => {
  const fiber = Effect.runFork(
    Stream.runForEach(processor.room.observePresence, presence =>
      Effect.sync(() => listener(presence)),
    ),
  )
  return () => Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.asVoid))
}
