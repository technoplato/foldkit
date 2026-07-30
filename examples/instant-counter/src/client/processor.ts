import { Effect, Exit, Fiber, Schedule, Scope, Stream } from 'effect'
import { Processor, Runtime } from 'foldkit'

import {
  type InstantProcessorPresence as InstantProcessorPresenceType,
  type ProcessorRoomService,
  type SharedProgramProcessorService,
  makeInstantProgramStore,
  makeProcessorRoom,
  makeSharedProgramProcessor,
} from '@foldkit/instant'

import type { InstantCounterDatabase } from '../../instant.schema.js'
import type { Message } from '../domain/message.js'
import type { Model } from '../domain/model.js'
import { Model as ModelSchema } from '../domain/model.js'
import { InstantCounterProgram } from '../domain/program.js'
import { programId, programVersion } from '../shared/identity.js'
import {
  isEffectExecutorAvailable,
  makeProcessorPresence,
} from '../shared/presence.js'
import { makeMessageCodec } from '../transport/codec.js'
import { DelegatedEffectScheduler } from '../transport/effectScheduler.js'
import { ensureProgramSession, randomId } from '../transport/session.js'
import {
  browserEffectExecutorLayer,
  browserProcessorDescriptor,
} from './browserCapabilities.js'
import {
  type ActorSequenceRegistry,
  type AttemptedEffectRegistry,
  type ClientIdentity,
} from './localState.js'

const heartbeatInterval = '10 seconds'

/** Inputs needed to start one authenticated browser Processor. */
export type BrowserProcessorConfig = Readonly<{
  actorSequences: ActorSequenceRegistry
  attemptRegistry: AttemptedEffectRegistry
  database: InstantCounterDatabase
  identity: ClientIdentity
  subjectId: string
}>

/** One running browser Processor and its detachable host surfaces. */
export type BrowserProcessor = Readonly<{
  descriptor: Processor.Descriptor
  processorId: string
  publishEffectExecutorAvailability: (
    isAvailable: boolean,
  ) => Effect.Effect<void>
  room: ProcessorRoomService
  runtime: Runtime.ProgramRuntime<Model, Message>
  shared: SharedProgramProcessorService<Model, Message>
}>

/** Starts a real Foldkit runtime whose Model consumes only accepted Messages. */
export const makeBrowserProcessor = ({
  actorSequences,
  attemptRegistry,
  database,
  identity,
  subjectId,
}: BrowserProcessorConfig): Effect.Effect<
  BrowserProcessor,
  Runtime.ProgramRuntimeStartError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => ensureProgramSession(database, subjectId),
      catch: cause => cause,
    }).pipe(Effect.orDie)

    const processorId = `${identity.clientId}:browser:${randomId()}`
    const descriptor = browserProcessorDescriptor(
      identity.clientId,
      processorId,
    )
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
      resources: browserEffectExecutorLayer(processorId),
    })
    yield* runtime.initialization
    const shared = yield* makeSharedProgramProcessor({
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
            isEffectExecutorAvailable(snapshot.connection, isAvailable),
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

/** Allocates a browser Processor with an explicit lifetime for sign-out. */
export const allocateBrowserProcessor = async (
  config: BrowserProcessorConfig,
): Promise<
  Readonly<{
    processor: BrowserProcessor
    release: () => Promise<void>
  }>
> => {
  const scope = await Effect.runPromise(Scope.make())
  try {
    const processor = await Effect.runPromise(
      makeBrowserProcessor(config).pipe(
        Effect.provideService(Scope.Scope, scope),
      ),
    )
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
  processor: BrowserProcessor,
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
  processor: BrowserProcessor,
  listener: (presence: ReadonlyArray<InstantProcessorPresenceType>) => void,
): (() => Promise<void>) => {
  const fiber = Effect.runFork(
    Stream.runForEach(processor.room.observePresence, presence =>
      Effect.sync(() => listener(presence)),
    ),
  )
  return () => Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.asVoid))
}
