import {
  Array,
  Cause,
  Context,
  Data,
  Deferred,
  Effect,
  Exit,
  Function,
  Layer,
  Option,
  PubSub,
  Record,
  Ref,
  Schema,
  Scope,
  Stream,
  pipe,
} from 'effect'

import {
  __CurrentRegistry as __CurrentInterruptRegistry,
  __makeRegistry as __makeInterruptRegistry,
} from '../command/interruptible/index.js'
import type { ManagedResourceConfig } from '../managedResource/managedResource.js'
import { type Ports, __CurrentPortChannels } from '../port/port.js'
import { type PortHandles, makePortRuntime } from '../port/runtime.js'
import type { Program, ProgramCommand } from '../program/program.js'
import {
  type ProgramRouter,
  type ReplayRoute,
  type StateRoute,
  replay as makeReplayRoute,
  makeRouter,
  state as makeStateRoute,
} from '../program/route.js'
import type { Subscriptions } from '../subscription/subscription.js'
import {
  type CommandRecord,
  type ProgramJournalArchiveFactory,
  type ProgramJournalSnapshot,
  type Transition,
  type TransitionSource,
  fromCommand,
  fromHost,
  fromManagedResource,
  fromPort,
  fromSubscription,
  makeProgramJournal,
} from './programJournal.js'
import { type ReplaySession, makeReplaySession } from './replaySession.js'
import {
  ReplayFrameError,
  type ReplayTape,
  type ReplayTapeExportError,
  encodeReplayTape,
  fromJournal,
  replayToFrame,
} from './replayTape.js'
import {
  type RuntimeDiagnostic,
  type RuntimeFailure,
  type RuntimeFailureSource,
  acquiredManagedResource,
  commandFailureSource,
  failedAcquiringManagedResource,
  failedReleasingManagedResource,
  failedSubscription,
  managedResourceFailureSource,
  releasedManagedResource,
  startedAcquiringManagedResource,
  startedReleasingManagedResource,
  startedSubscription,
  stoppedSubscription,
  subscriptionFailureSource,
  updateFailureSource,
} from './runtimeDiagnostic.js'

type Operation = {
  readonly id: number
  pendingWorkCount: number
  readonly completion: Deferred.Deferred<void>
}

type QueuedMessage<Message> = Readonly<{
  message: Message
  source: TransitionSource
  maybeOperation: Option.Option<Operation>
}>

/** Starts a Program from its normal init function. */
export type FreshStart = Readonly<{ _tag: 'Fresh' }>

/** Starts a Program from one portable Model through its restore initializer. */
export type ModelStart<Model> = Readonly<{
  _tag: 'Model'
  model: Model
}>

/** Resumes a Program live from the settled end of a replay tape. */
export type ReplayStart<Model, Message> = Readonly<{
  _tag: 'Replay'
  tape: ReplayTape<Model, Message>
}>

/** The supported initialization modes for the shared Program runtime. */
export type ProgramStart<Model, Message> =
  | FreshStart
  | ModelStart<Model>
  | ReplayStart<Model, Message>

/** A replay tape cannot be resumed as a live Program. */
export class ProgramRuntimeStartError extends Data.TaggedError(
  'ProgramRuntimeStartError',
)<{
  readonly message: string
}> {}

/** Platform scheduling used to yield an over-budget synchronous Message burst. */
export type ProgramRuntimeScheduling = Readonly<{
  now: () => number
  defer: (resume: () => void) => () => void
  synchronousWorkBudgetMs?: number
}>

/** Journal archive and timestamp configuration for a Program runtime. */
export type ProgramRuntimeJournalConfig<Model, Message> = Readonly<{
  archive?: ProgramJournalArchiveFactory<Model, Message>
  now?: () => number
}>

/** Configuration for the shared renderer-free Program runtime. */
export type ProgramRuntimeConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  program: Program<Model, Message, Resources, ManagedResourceServices, P>
  resources: Layer.Layer<Resources>
  start?: ProgramStart<Model, Message>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
  scheduling?: ProgramRuntimeScheduling
}>

/** Options for sending a Message into the Program runtime. */
export type SendOptions = Readonly<{
  actionName?: string
  source?: TransitionSource
}>

/** The universal journal capability exposed by every Program runtime. */
export type ProgramRuntimeJournal<Model, Message> = Readonly<{
  /** Returns the retained journal snapshot synchronously. */
  read: () => ProgramJournalSnapshot<Model, Message>
  /** Observes every transition, including transitions an archive later prunes. */
  observe: (
    listener: (transition: Transition<Model, Message>) => void,
  ) => () => void
  /** Streams future transitions for Effect-based adapters. */
  transitions: Stream.Stream<Transition<Model, Message>>
}>

/** The universal replay capability derived from a Program and its journal. */
export type ProgramRuntimeReplay<Model, Message> = Readonly<{
  /** Returns the replay tape represented by the current retained journal. */
  readTape: () => ReplayTape<Model, Message>
  /** Encodes the current retained journal as a portable replay tape. */
  exportTape: Effect.Effect<string, ReplayTapeExportError>
  /** Reconstructs one retained frame without executing historical Commands. */
  inspect: (frame: number) => Effect.Effect<Model, ReplayFrameError>
  /** Creates an inert inspection session over the current retained journal. */
  makeSession: (
    frame?: number,
  ) => Effect.Effect<ReplaySession<Model, Message>, ReplayFrameError>
  /** Returns the exact current Model as an engine-owned state route. */
  stateRoute: () => StateRoute<Model>
  /** Returns the retained tape and requested frame as an engine-owned route. */
  replayRoute: (
    frame?: number,
    isPlaying?: boolean,
  ) => ReplayRoute<Model, Message>
  /** Shared parser-printer for canonical relative state and replay URIs. */
  router: ProgramRouter<Model, Message>
}>

/** A live, renderer-free Foldkit Program runtime. */
export type ProgramRuntime<
  Model,
  Message,
  P extends Ports | undefined = undefined,
> = Readonly<{
  /** Identifies this handle as a live, effect-executing runtime. */
  mode: 'Live'
  /** Returns the current immutable Model synchronously. */
  readModel: () => Model
  /** Universal transition publication with a configurable retained archive. */
  journal: ProgramRuntimeJournal<Model, Message>
  /** Universal inert inspection, tape, and route semantics. */
  replay: ProgramRuntimeReplay<Model, Message>
  /** Sends one Message without waiting for its finite Command chain. */
  send: (message: Message, options?: SendOptions) => void
  /** Sends one Message and completes after its finite causal work completes. */
  run: (message: Message, options?: SendOptions) => Effect.Effect<Model>
  /** Observes changed Models and returns an unsubscribe function. */
  observeModel: (listener: (model: Model) => void) => () => void
  /** Returns the complete lifecycle diagnostic journal synchronously. */
  readDiagnostics: () => ReadonlyArray<RuntimeDiagnostic>
  /** Observes Subscription and ManagedResource lifecycle diagnostics. */
  observeDiagnostics: (
    listener: (diagnostic: RuntimeDiagnostic) => void,
  ) => () => void
  /** Streams Subscription and ManagedResource lifecycle diagnostics. */
  diagnostics: Stream.Stream<RuntimeDiagnostic>
  /** Returns every terminal runtime failure synchronously. */
  readFailures: () => ReadonlyArray<RuntimeFailure<Message>>
  /** Observes terminal runtime failures. */
  observeFailures: (
    listener: (failure: RuntimeFailure<Message>) => void,
  ) => () => void
  /** Streams terminal runtime failures for fire-and-forget clients. */
  failures: Stream.Stream<RuntimeFailure<Message>>
  /** Typed inbound and outbound handles for the Program's Ports. */
  ports: PortHandles<P>
  /** Completes after the finite Command chain returned by init completes. */
  initialization: Effect.Effect<Model>
  /** Stops Commands and Subscriptions and releases the shared resources Layer. */
  shutdown: Effect.Effect<void>
}>

type ResolvedStart<Model, Message, Resources> = Readonly<{
  model: Model
  commands: ReadonlyArray<ProgramCommand<Message, Resources>>
  journalInitialModel: Model
  journalInitialCommands: ReadonlyArray<CommandRecord>
  maybeReplayTape: Option.Option<ReplayTape<Model, Message>>
}>

const toCommandRecord = <Message, Resources>(
  command: ProgramCommand<Message, Resources>,
): CommandRecord => ({
  name: command.name,
  ...(command.args === undefined ? {} : { args: command.args }),
})

const resolveStart = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices,
  P extends Ports | undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  start: ProgramStart<Model, Message>,
): Effect.Effect<
  ResolvedStart<Model, Message, Resources | ManagedResourceServices>,
  ProgramRuntimeStartError
> => {
  if (start._tag === 'Fresh') {
    const [model, commands] = program.init()
    return Effect.succeed({
      model,
      commands,
      journalInitialModel: model,
      journalInitialCommands: Array.map(commands, toCommandRecord),
      maybeReplayTape: Option.none(),
    })
  }

  if (start._tag === 'Model') {
    const [model, commands] = program.restore?.(start.model) ?? [
      start.model,
      [],
    ]
    return Effect.succeed({
      model,
      commands,
      journalInitialModel: model,
      journalInitialCommands: Array.map(commands, toCommandRecord),
      maybeReplayTape: Option.none(),
    })
  }

  if (
    start.tape.programId !== program.id ||
    start.tape.programVersion !== program.version
  ) {
    return Effect.fail(
      new ProgramRuntimeStartError({
        message: `Replay tape ${start.tape.programId}@${start.tape.programVersion} does not match ${program.id}@${program.version}`,
      }),
    )
  }

  const maybeLastTransition = Array.last(start.tape.transitions)
  if (
    Option.isSome(maybeLastTransition) &&
    !maybeLastTransition.value.isOperationSettled
  ) {
    return Effect.fail(
      new ProgramRuntimeStartError({
        message: 'A live Program can resume only from a settled replay frame',
      }),
    )
  }

  return pipe(
    replayToFrame(program, start.tape, start.tape.transitions.length),
    Effect.mapError(
      error => new ProgramRuntimeStartError({ message: error.message }),
    ),
    Effect.map(model => ({
      model,
      commands: [],
      journalInitialModel: start.tape.initialModel,
      journalInitialCommands: start.tape.initialCommands,
      maybeReplayTape: Option.some(start.tape),
    })),
  )
}

const makeOperation = (
  id: number,
  activeOperations: Set<Operation>,
): Operation => {
  const operation: Operation = {
    id,
    pendingWorkCount: 0,
    completion: Deferred.makeUnsafe(),
  }
  activeOperations.add(operation)
  return operation
}

const addOperationWork = (maybeOperation: Option.Option<Operation>): void => {
  if (Option.isSome(maybeOperation)) {
    maybeOperation.value.pendingWorkCount += 1
  }
}

const completeOperationWork = (
  activeOperations: Set<Operation>,
  maybeOperation: Option.Option<Operation>,
): void => {
  if (Option.isNone(maybeOperation)) {
    return
  }

  const operation = maybeOperation.value
  operation.pendingWorkCount -= 1
  if (operation.pendingWorkCount === 0) {
    activeOperations.delete(operation)
    Deferred.doneUnsafe(operation.completion, Effect.void)
  }
}

const DEFAULT_SYNCHRONOUS_WORK_BUDGET_MS = 5

const defaultDefer = (resume: () => void): (() => void) => {
  const timeoutHandle = setTimeout(resume, 0)
  return () => clearTimeout(timeoutHandle)
}

const failOperations = (
  activeOperations: Set<Operation>,
  cause: Cause.Cause<never>,
): void => {
  activeOperations.forEach(operation => {
    Deferred.doneUnsafe(operation.completion, Effect.failCause(cause))
  })
  activeOperations.clear()
}

/** Starts the shared renderer-free Program runtime in the current Scope. */
export const makeProgramRuntime = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: ProgramRuntimeConfig<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  >,
): Effect.Effect<
  ProgramRuntime<Model, Message, P>,
  ProgramRuntimeStartError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const start = yield* resolveStart(config.program, config.start ?? fresh())
    const runtimeScope = yield* Scope.make()
    yield* Effect.addFinalizer(exit => Scope.close(runtimeScope, exit))
    const runtimeContext = yield* Effect.context<never>()
    const modelPubSub = yield* PubSub.unbounded<Model>({ replay: 1 })
    const journalPubSub = yield* PubSub.unbounded<Transition<Model, Message>>()
    const diagnosticsPubSub = yield* PubSub.unbounded<RuntimeDiagnostic>()
    const failuresPubSub = yield* PubSub.unbounded<RuntimeFailure<Message>>()
    const activeOperations = new Set<Operation>()
    const modelListeners = new Set<(model: Model) => void>()
    const diagnosticListeners = new Set<
      (diagnostic: RuntimeDiagnostic) => void
    >()
    const failureListeners = new Set<
      (failure: RuntimeFailure<Message>) => void
    >()
    const interruptRegistry = __makeInterruptRegistry()
    const portRuntime = makePortRuntime(config.program.ports)
    const now = config.journal?.now ?? Date.now
    const schedulingNow = config.scheduling?.now ?? Date.now
    const defer = config.scheduling?.defer ?? defaultDefer
    const synchronousWorkBudgetMs =
      config.scheduling?.synchronousWorkBudgetMs ??
      DEFAULT_SYNCHRONOUS_WORK_BUDGET_MS
    let diagnostics: ReadonlyArray<RuntimeDiagnostic> = []
    let failures: ReadonlyArray<RuntimeFailure<Message>> = []
    let nextLifecycleInstanceId = 1
    const journal = makeProgramJournal({
      program: config.program,
      initialModel: start.journalInitialModel,
      initialCommands: start.journalInitialCommands,
      ...(config.journal?.archive === undefined
        ? {}
        : { archive: config.journal.archive }),
      ...(config.journal?.now === undefined ? {} : { now: config.journal.now }),
    })
    const stopPublishingJournal = journal.observe(transition => {
      PubSub.publishUnsafe(journalPubSub, transition)
    })

    let restoredModel = start.journalInitialModel
    if (Option.isSome(start.maybeReplayTape)) {
      pipe(
        start.maybeReplayTape.value.transitions,
        Array.forEach(transition => {
          const [nextModel] = config.program.update(
            restoredModel,
            transition.message,
          )
          journal.record({
            message: transition.message,
            source: transition.source,
            ...(transition.operationId === undefined
              ? {}
              : { operationId: transition.operationId }),
            isOperationSettled: transition.isOperationSettled,
            commands: transition.commands,
            timestamp: transition.timestamp,
            model: nextModel,
          })
          restoredModel = nextModel
        }),
      )
    }

    const managedResources: {
      readonly [name: string]: ManagedResourceConfig<Model, Message>
    } = config.program.managedResources ?? {}
    const managedResourceEntries = Record.toEntries(managedResources)
    const managedResourceRefs = yield* Effect.forEach(
      managedResourceEntries,
      ([name, managedResource]) =>
        Ref.make<Option.Option<unknown>>(Option.none()).pipe(
          Effect.map(ref => ({ name, managedResource, ref })),
        ),
    )
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    const managedResourceLayer = Array.reduce(
      managedResourceRefs,
      Layer.empty,
      (layer, { managedResource, ref }) =>
        Layer.merge(layer, Layer.succeed(managedResource.resource._tag, ref)),
    ) as Layer.Layer<ManagedResourceServices>
    const acquireResourceContext: Effect.Effect<Context.Context<Resources>> =
      yield* Effect.cached(
        Effect.uninterruptible(
          Layer.buildWithScope(config.resources, runtimeScope),
        ),
      )

    const provideResources = <A>(
      effect: Effect.Effect<A, never, Resources | ManagedResourceServices>,
    ): Effect.Effect<A> =>
      Effect.flatMap(acquireResourceContext, resourceContext =>
        Effect.provide(
          Effect.provideContext(
            Effect.provideService(
              Effect.provideService(
                effect,
                __CurrentInterruptRegistry,
                interruptRegistry,
              ),
              __CurrentPortChannels,
              portRuntime.channels,
            ),
            resourceContext,
          ),
          managedResourceLayer,
        ),
      )

    let liveModel = start.model
    PubSub.publishUnsafe(modelPubSub, liveModel)
    let pendingMessages: Array<QueuedMessage<Message>> = []
    let isBootComplete = false
    let isProcessingMessages = false
    let isRuntimeDisposed = false
    let nextOperationId = 1
    let maybeCrashCause = Option.none<Cause.Cause<never>>()
    let synchronousWorkMsSinceYield = 0
    let lastDrainEndedAt = 0
    let isDrainDeferred = false
    let maybeCancelDeferredDrain = Option.none<() => void>()

    const readModel = (): Model => liveModel

    const notifyModelListeners = (model: Model): void => {
      modelListeners.forEach(listener => {
        try {
          listener(model)
        } catch (error) {
          console.error('[foldkit] A Model observer threw:', error)
        }
      })
    }

    const publishDiagnostic = (diagnostic: RuntimeDiagnostic): void => {
      diagnostics = Array.append(diagnostics, diagnostic)
      PubSub.publishUnsafe(diagnosticsPubSub, diagnostic)
      diagnosticListeners.forEach(listener => {
        try {
          listener(diagnostic)
        } catch (error) {
          console.error('[foldkit] A diagnostic observer threw:', error)
        }
      })
    }

    const publishFailure = (failure: RuntimeFailure<Message>): void => {
      failures = Array.append(failures, failure)
      PubSub.publishUnsafe(failuresPubSub, failure)
      failureListeners.forEach(listener => {
        try {
          listener(failure)
        } catch (error) {
          console.error('[foldkit] A failure observer threw:', error)
        }
      })
    }

    const crash = (
      cause: Cause.Cause<never>,
      source: RuntimeFailureSource,
      message: Option.Option<Message> = Option.none(),
    ): void => {
      if (
        isRuntimeDisposed ||
        Option.isSome(maybeCrashCause) ||
        Cause.hasInterruptsOnly(cause)
      ) {
        return
      }
      maybeCrashCause = Option.some(cause)
      publishFailure({
        programId: config.program.id,
        source,
        message,
        cause,
        timestamp: now(),
      })
      failOperations(activeOperations, cause)
    }

    const enqueueQueuedMessage = (
      queuedMessage: QueuedMessage<Message>,
      isDrainDeferred = false,
    ): void => {
      if (isRuntimeDisposed || Option.isSome(maybeCrashCause)) {
        return
      }
      addOperationWork(queuedMessage.maybeOperation)
      pendingMessages.push(queuedMessage)
      if (isBootComplete) {
        if (isDrainDeferred) {
          queueMicrotask(drainPendingMessages)
        } else {
          drainPendingMessages()
        }
      }
    }

    const forkCommand = (
      command: ProgramCommand<Message, Resources | ManagedResourceServices>,
      maybeOperation: Option.Option<Operation>,
      maybeMessage: Option.Option<Message>,
    ): void => {
      addOperationWork(maybeOperation)
      queueMicrotask(() => {
        if (isRuntimeDisposed || Option.isSome(maybeCrashCause)) {
          completeOperationWork(activeOperations, maybeOperation)
          return
        }

        Effect.runForkWith(runtimeContext)(
          Effect.forkIn(runtimeScope)(
            command.effect.pipe(
              Effect.withSpan(command.name, {
                attributes: command.args ?? {},
              }),
              provideResources,
              Effect.exit,
              Effect.flatMap(exit =>
                Exit.match(exit, {
                  onFailure: cause =>
                    Effect.sync(() =>
                      crash(
                        cause,
                        commandFailureSource(command.name),
                        maybeMessage,
                      ),
                    ),
                  onSuccess: message =>
                    Effect.sync(() =>
                      enqueueQueuedMessage(
                        {
                          message,
                          source: fromCommand(command.name),
                          maybeOperation,
                        },
                        true,
                      ),
                    ),
                }),
              ),
              Effect.ensuring(
                Effect.sync(() =>
                  completeOperationWork(activeOperations, maybeOperation),
                ),
              ),
            ),
          ),
        )
      })
    }

    const processMessage = ({
      message,
      source,
      maybeOperation,
    }: QueuedMessage<Message>): void => {
      try {
        const currentModel = liveModel
        const [nextModel, commands] = config.program.update(
          currentModel,
          message,
        )
        const isOperationSettled = Option.match(maybeOperation, {
          onNone: () => true,
          onSome: operation =>
            Array.isReadonlyArrayEmpty(commands) &&
            operation.pendingWorkCount === 1,
        })
        if (currentModel !== nextModel) {
          liveModel = nextModel
        }

        journal.record({
          message,
          source,
          ...(Option.isSome(maybeOperation)
            ? { operationId: maybeOperation.value.id }
            : {}),
          isOperationSettled,
          commands: Array.map(commands, toCommandRecord),
          model: nextModel,
        })

        if (currentModel !== nextModel) {
          PubSub.publishUnsafe(modelPubSub, nextModel)
          notifyModelListeners(nextModel)
        }

        for (const command of commands) {
          forkCommand(command, maybeOperation, Option.some(message))
        }
      } catch (error) {
        crash(
          Cause.die(error),
          updateFailureSource(message._tag),
          Option.some(message),
        )
      } finally {
        completeOperationWork(activeOperations, maybeOperation)
      }
    }

    const scheduleDeferredDrain = (): void => {
      if (isDrainDeferred || isRuntimeDisposed) {
        return
      }
      isDrainDeferred = true
      maybeCancelDeferredDrain = Option.some(
        defer(() => {
          maybeCancelDeferredDrain = Option.none()
          isDrainDeferred = false
          synchronousWorkMsSinceYield = 0
          drainPendingMessages()
        }),
      )
    }

    function drainPendingMessages(): void {
      if (
        !isBootComplete ||
        isProcessingMessages ||
        isDrainDeferred ||
        isRuntimeDisposed ||
        Option.isSome(maybeCrashCause)
      ) {
        return
      }

      const drainStartedAt = schedulingNow()
      if (drainStartedAt - lastDrainEndedAt > synchronousWorkBudgetMs) {
        synchronousWorkMsSinceYield = 0
      }
      if (synchronousWorkMsSinceYield > synchronousWorkBudgetMs) {
        scheduleDeferredDrain()
        return
      }

      isProcessingMessages = true
      try {
        while (Array.isReadonlyArrayNonEmpty(pendingMessages)) {
          let batch: ReadonlyArray<QueuedMessage<Message>> = pendingMessages
          pendingMessages = []
          while (Array.isReadonlyArrayNonEmpty(batch)) {
            const [queuedMessage, remainingBatch] = Array.matchLeft(batch, {
              onEmpty: () => {
                throw new Error('A non-empty Message batch became empty')
              },
              onNonEmpty: (head, tail) => [head, tail],
            })
            processMessage(queuedMessage)
            if (Option.isSome(maybeCrashCause)) {
              pendingMessages = []
              return
            }
            const hasRemainingWork =
              Array.isReadonlyArrayNonEmpty(remainingBatch) ||
              Array.isReadonlyArrayNonEmpty(pendingMessages)
            if (
              hasRemainingWork &&
              synchronousWorkMsSinceYield + (schedulingNow() - drainStartedAt) >
                synchronousWorkBudgetMs
            ) {
              pendingMessages = Array.appendAll(remainingBatch, pendingMessages)
              scheduleDeferredDrain()
              return
            }
            batch = remainingBatch
          }
        }
      } finally {
        const drainEndedAt = schedulingNow()
        synchronousWorkMsSinceYield += drainEndedAt - drainStartedAt
        lastDrainEndedAt = drainEndedAt
        isProcessingMessages = false
      }
    }

    const send = (message: Message, options?: SendOptions): void => {
      enqueueQueuedMessage({
        message,
        source: options?.source ?? fromHost(options?.actionName),
        maybeOperation: Option.none(),
      })
    }

    const observeModel = (listener: (model: Model) => void): (() => void) => {
      if (isRuntimeDisposed) {
        return Function.constVoid
      }
      modelListeners.add(listener)
      return () => {
        modelListeners.delete(listener)
      }
    }

    const observeDiagnostics = (
      listener: (diagnostic: RuntimeDiagnostic) => void,
    ): (() => void) => {
      if (isRuntimeDisposed) {
        return Function.constVoid
      }
      diagnosticListeners.add(listener)
      return () => {
        diagnosticListeners.delete(listener)
      }
    }

    const observeFailures = (
      listener: (failure: RuntimeFailure<Message>) => void,
    ): (() => void) => {
      if (isRuntimeDisposed) {
        return Function.constVoid
      }
      failureListeners.add(listener)
      return () => {
        failureListeners.delete(listener)
      }
    }

    const run = (
      message: Message,
      options?: SendOptions,
    ): Effect.Effect<Model> =>
      Effect.suspend(() => {
        if (isRuntimeDisposed) {
          return Effect.interrupt
        }
        if (Option.isSome(maybeCrashCause)) {
          return Effect.failCause(maybeCrashCause.value)
        }

        const operation = makeOperation(nextOperationId, activeOperations)
        nextOperationId += 1
        enqueueQueuedMessage({
          message,
          source: options?.source ?? fromHost(options?.actionName),
          maybeOperation: Option.some(operation),
        })
        return Effect.andThen(
          Deferred.await(operation.completion),
          Effect.sync(readModel),
        )
      })

    const startSubscription = ([
      name,
      {
        dependenciesSchema,
        modelToDependencies,
        keepAliveEquivalence,
        dependenciesToStream,
        source,
      },
    ]: readonly [
      string,
      Subscriptions<
        Model,
        Message,
        Resources | ManagedResourceServices
      >[string],
    ]) =>
      Effect.gen(function* () {
        const equivalence =
          keepAliveEquivalence ?? Schema.toEquivalence(dependenciesSchema)
        const initialDependencies = modelToDependencies(liveModel)
        const latestDependenciesRef = yield* Ref.make(initialDependencies)
        const transitionSource =
          source?._tag === 'Port'
            ? Option.match(portRuntime.inboundName(source.port), {
                onNone: () => fromSubscription(name),
                onSome: fromPort,
              })
            : fromSubscription(name)

        const modelChangesStream = Stream.fromPubSub(modelPubSub).pipe(
          Stream.mapEffect(model => {
            const dependencies = modelToDependencies(model)
            return Effect.as(
              Ref.set(latestDependenciesRef, dependencies),
              dependencies,
            )
          }),
        )

        yield* Effect.forkIn(runtimeScope)(
          Stream.concat(
            Stream.make(initialDependencies),
            modelChangesStream,
          ).pipe(
            Stream.changesWith(equivalence),
            Stream.switchMap(dependencies => {
              const instanceId = nextLifecycleInstanceId
              nextLifecycleInstanceId += 1
              const lifecycle = {
                programId: config.program.id,
                name,
                instanceId,
              }
              return dependenciesToStream(dependencies, () =>
                Ref.getUnsafe(latestDependenciesRef),
              ).pipe(
                Stream.onStart(
                  Effect.sync(() =>
                    publishDiagnostic(
                      startedSubscription({
                        ...lifecycle,
                        timestamp: now(),
                      }),
                    ),
                  ),
                ),
                Stream.onError(cause =>
                  Cause.hasInterruptsOnly(cause)
                    ? Effect.void
                    : Effect.sync(() =>
                        publishDiagnostic(
                          failedSubscription({
                            ...lifecycle,
                            timestamp: now(),
                            cause: Cause.pretty(cause),
                          }),
                        ),
                      ),
                ),
                Stream.ensuring(
                  Effect.sync(() =>
                    publishDiagnostic(
                      stoppedSubscription({
                        ...lifecycle,
                        timestamp: now(),
                      }),
                    ),
                  ),
                ),
              )
            }),
            Stream.runForEach(message =>
              Effect.sync(() =>
                enqueueQueuedMessage({
                  message,
                  source: transitionSource,
                  maybeOperation: Option.none(),
                }),
              ),
            ),
            provideResources,
            Effect.catchCause(cause =>
              Effect.sync(() => crash(cause, subscriptionFailureSource(name))),
            ),
          ),
        )
      })

    if (config.program.subscriptions !== undefined) {
      yield* pipe(
        config.program.subscriptions,
        Record.toEntries,
        Effect.forEach(startSubscription, {
          concurrency: 'unbounded',
          discard: true,
        }),
      )
    }

    const requirementsToLifecycle = (
      name: string,
      managedResource: ManagedResourceConfig<Model, Message>,
      resourceRef: Ref.Ref<Option.Option<unknown>>,
      maybeRequirements: unknown,
    ): Stream.Stream<Message> => {
      if (
        Option.isOption(maybeRequirements) &&
        Option.isNone(maybeRequirements)
      ) {
        return Stream.empty
      }

      const requirements = Option.isOption(maybeRequirements)
        ? Option.getOrThrow(maybeRequirements)
        : maybeRequirements
      const instanceId = nextLifecycleInstanceId
      nextLifecycleInstanceId += 1
      const lifecycle = {
        programId: config.program.id,
        name,
        instanceId,
      }
      const acquire = Effect.gen(function* () {
        yield* Effect.sync(() =>
          publishDiagnostic(
            startedAcquiringManagedResource({
              ...lifecycle,
              timestamp: now(),
            }),
          ),
        )
        const value = yield* managedResource.acquire(requirements)
        yield* Ref.set(resourceRef, Option.some(value))
        yield* Effect.sync(() =>
          publishDiagnostic(
            acquiredManagedResource({
              ...lifecycle,
              timestamp: now(),
            }),
          ),
        )
        return value
      }).pipe(
        Effect.catchCause(cause =>
          Effect.andThen(
            Effect.sync(() =>
              publishDiagnostic(
                failedAcquiringManagedResource({
                  ...lifecycle,
                  timestamp: now(),
                  cause: Cause.pretty(cause),
                }),
              ),
            ),
            Effect.failCause(cause),
          ),
        ),
      )
      const release = (value: unknown) =>
        Effect.gen(function* () {
          yield* Effect.sync(() =>
            publishDiagnostic(
              startedReleasingManagedResource({
                ...lifecycle,
                timestamp: now(),
              }),
            ),
          )
          yield* managedResource.release(value)
          yield* Ref.set(resourceRef, Option.none())
          yield* Effect.sync(() =>
            publishDiagnostic(
              releasedManagedResource({
                ...lifecycle,
                timestamp: now(),
              }),
            ),
          )
          yield* Effect.sync(() =>
            enqueueQueuedMessage({
              message: managedResource.onReleased(),
              source: fromManagedResource(name),
              maybeOperation: Option.none(),
            }),
          )
        }).pipe(
          Effect.catchCause(cause =>
            Effect.gen(function* () {
              yield* Ref.set(resourceRef, Option.none())
              yield* Effect.sync(() =>
                publishDiagnostic(
                  failedReleasingManagedResource({
                    ...lifecycle,
                    timestamp: now(),
                    cause: Cause.pretty(cause),
                  }),
                ),
              )
            }),
          ),
        )

      return pipe(
        Stream.scoped(
          Stream.fromEffect(Effect.acquireRelease(acquire, release)),
        ),
        Stream.flatMap(value =>
          Stream.concat(
            Stream.make(managedResource.onAcquired(value)),
            Stream.never,
          ),
        ),
        Stream.catch(error =>
          Stream.make(managedResource.onAcquireError(error)),
        ),
      )
    }

    const startManagedResource = ({
      name,
      managedResource,
      ref,
    }: (typeof managedResourceRefs)[number]) =>
      Effect.gen(function* () {
        const equivalence = Schema.toEquivalence(managedResource.schema)
        yield* Effect.forkIn(runtimeScope)(
          Stream.concat(
            Stream.make(liveModel),
            Stream.fromPubSub(modelPubSub),
          ).pipe(
            Stream.map(managedResource.modelToMaybeRequirements),
            Stream.changesWith(equivalence),
            Stream.switchMap(maybeRequirements =>
              requirementsToLifecycle(
                name,
                managedResource,
                ref,
                maybeRequirements,
              ),
            ),
            Stream.runForEach(message =>
              Effect.sync(() =>
                enqueueQueuedMessage({
                  message,
                  source: fromManagedResource(name),
                  maybeOperation: Option.none(),
                }),
              ),
            ),
            Effect.catchCause(cause =>
              Effect.sync(() =>
                crash(cause, managedResourceFailureSource(name)),
              ),
            ),
          ),
        )
      })

    yield* Effect.forEach(managedResourceRefs, startManagedResource, {
      concurrency: 'unbounded',
      discard: true,
    })

    const initializationOperation = makeOperation(0, activeOperations)
    const maybeInitializationOperation = Option.some(initializationOperation)
    addOperationWork(maybeInitializationOperation)
    for (const command of start.commands) {
      forkCommand(command, maybeInitializationOperation, Option.none())
    }
    completeOperationWork(activeOperations, maybeInitializationOperation)

    isBootComplete = true
    drainPendingMessages()

    const initialization = Effect.andThen(
      Deferred.await(initializationOperation.completion),
      Effect.sync(readModel),
    )

    const shutdown = Effect.suspend(() => {
      if (isRuntimeDisposed) {
        return Effect.void
      }
      isRuntimeDisposed = true
      if (Option.isSome(maybeCancelDeferredDrain)) {
        maybeCancelDeferredDrain.value()
        maybeCancelDeferredDrain = Option.none()
      }
      portRuntime.shutdown()
      modelListeners.clear()
      pendingMessages = []
      failOperations(activeOperations, Cause.interrupt(undefined))
      return Scope.close(runtimeScope, Exit.void).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            yield* PubSub.shutdown(modelPubSub)
            yield* PubSub.shutdown(journalPubSub)
            yield* PubSub.shutdown(diagnosticsPubSub)
            yield* PubSub.shutdown(failuresPubSub)
            diagnosticListeners.clear()
            failureListeners.clear()
            stopPublishingJournal()
            journal.shutdown()
          }),
        ),
      )
    })

    yield* Effect.addFinalizer(() => shutdown)

    return {
      mode: 'Live',
      readModel,
      journal: {
        read: journal.read,
        observe: journal.observe,
        transitions: Stream.fromPubSub(journalPubSub),
      },
      replay: {
        readTape: () => fromJournal(config.program, journal.read()),
        exportTape: pipe(
          Effect.sync(journal.read),
          Effect.map(snapshot => fromJournal(config.program, snapshot)),
          Effect.flatMap(tape => encodeReplayTape(config.program, tape)),
        ),
        inspect: frame =>
          pipe(
            journal.modelAt(frame),
            Option.match({
              onNone: () =>
                Effect.fail(
                  new ReplayFrameError({
                    frame,
                    maximumFrame: journal.read().transitions.length,
                  }),
                ),
              onSome: Effect.succeed,
            }),
          ),
        makeSession: frame => {
          const tape = fromJournal(config.program, journal.read())
          return makeReplaySession(
            config.program,
            tape,
            frame ?? tape.transitions.length,
          )
        },
        stateRoute: () => makeStateRoute(readModel()),
        replayRoute: (frame, isPlaying = false) => {
          const tape = fromJournal(config.program, journal.read())
          return makeReplayRoute(
            tape,
            frame ?? tape.transitions.length,
            isPlaying,
          )
        },
        router: makeRouter(config.program),
      },
      send,
      run,
      observeModel,
      readDiagnostics: () => diagnostics,
      observeDiagnostics,
      diagnostics: Stream.fromPubSub(diagnosticsPubSub),
      readFailures: () => failures,
      observeFailures,
      failures: Stream.fromPubSub(failuresPubSub),
      ports: portRuntime.handles,
      initialization,
      shutdown,
    }
  })

/** Constructs a fresh Program start value. */
export const fresh = (): FreshStart => ({ _tag: 'Fresh' })

/** Constructs a restored Model start value. */
export const fromModel = <Model>(model: Model): ModelStart<Model> => ({
  _tag: 'Model',
  model,
})

/** Constructs a live replay resumption start value. */
export const fromReplay = <Model, Message>(
  tape: ReplayTape<Model, Message>,
): ReplayStart<Model, Message> => ({ _tag: 'Replay', tape })
