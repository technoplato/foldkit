import {
  Array,
  Cause,
  Context,
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
import type { Subscriptions } from '../subscription/subscription.js'

type HostCommand<Message, Resources> = Readonly<{
  name: string
  args?: Record<string, unknown>
  effect: Effect.Effect<Message, never, Resources>
}>

type Operation = {
  pendingWorkCount: number
  readonly completion: Deferred.Deferred<void>
}

type QueuedMessage<Message> = Readonly<{
  message: Message
  maybeOperation: Option.Option<Operation>
}>

/** Configuration for a renderer-free Foldkit runtime consumed by a host. */
export type HostRuntimeConfig<Model, Message, Resources = never> = Readonly<{
  Model: Schema.Codec<Model, any, unknown, unknown>
  init: () => readonly [Model, ReadonlyArray<HostCommand<Message, Resources>>]
  update: (
    model: Model,
    message: Message,
  ) => readonly [Model, ReadonlyArray<HostCommand<Message, Resources>>]
  subscriptions?: Subscriptions<Model, Message, Resources>
  resources: Layer.Layer<Resources>
}>

/** A running renderer-free Foldkit program under a host-controlled lifecycle. */
export type HostRuntime<Model, Message> = Readonly<{
  /** Returns the current immutable Model synchronously. */
  readModel: () => Model
  /** Enqueues one Message without waiting for its causal work to complete. */
  enqueueMessage: (message: Message) => void
  /** Registers a listener for changed Models and returns an unsubscribe function. */
  observeModel: (listener: (model: Model) => void) => () => void
  /** Enqueues one Message and completes after its finite causal work completes. */
  run: (message: Message) => Effect.Effect<Model>
  /** Completes after the finite Command chain returned by init completes. */
  initialization: Effect.Effect<Model>
  /** Stops Commands and Subscriptions and releases the shared resources Layer. */
  shutdown: Effect.Effect<void>
}>

const makeOperation = (activeOperations: Set<Operation>): Operation => {
  const operation: Operation = {
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

const failOperations = (
  activeOperations: Set<Operation>,
  cause: Cause.Cause<never>,
): void => {
  activeOperations.forEach(operation => {
    Deferred.doneUnsafe(operation.completion, Effect.failCause(cause))
  })
  activeOperations.clear()
}

/**
 * Starts a renderer-free Foldkit runtime in the current Scope.
 *
 * Commands and Subscriptions share one lazily built resources Layer. Closing
 * the surrounding Scope or running `shutdown` interrupts their fibers and
 * releases that Layer.
 */
export const makeHostRuntime = <Model, Message, Resources = never>(
  config: HostRuntimeConfig<Model, Message, Resources>,
): Effect.Effect<HostRuntime<Model, Message>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const runtimeScope = yield* Scope.make()
    yield* Effect.addFinalizer(exit => Scope.close(runtimeScope, exit))
    const runtimeContext = yield* Effect.context<never>()
    const modelPubSub = yield* PubSub.unbounded<Model>()
    const activeOperations = new Set<Operation>()
    const modelListeners = new Set<(model: Model) => void>()
    const interruptRegistry = __makeInterruptRegistry()

    const acquireResourceContext: Effect.Effect<Context.Context<Resources>> =
      yield* Effect.cached(
        Effect.uninterruptible(
          Layer.buildWithScope(config.resources, runtimeScope),
        ),
      )

    const provideResources = <A>(
      effect: Effect.Effect<A, never, Resources>,
    ): Effect.Effect<A> =>
      Effect.flatMap(acquireResourceContext, resourceContext =>
        Effect.setContext(
          Effect.provideService(
            effect,
            __CurrentInterruptRegistry,
            interruptRegistry,
          ),
          resourceContext,
        ),
      )

    const [initModel, initCommands] = config.init()
    let liveModel = initModel
    let pendingMessages: Array<QueuedMessage<Message>> = []
    let isBootComplete = false
    let isProcessingMessages = false
    let isRuntimeDisposed = false
    let maybeCrashCause = Option.none<Cause.Cause<never>>()

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

    const crash = (cause: Cause.Cause<never>): void => {
      if (Option.isSome(maybeCrashCause)) {
        return
      }
      maybeCrashCause = Option.some(cause)
      failOperations(activeOperations, cause)
    }

    const enqueueQueuedMessage = (
      queuedMessage: QueuedMessage<Message>,
    ): void => {
      if (isRuntimeDisposed || Option.isSome(maybeCrashCause)) {
        return
      }
      addOperationWork(queuedMessage.maybeOperation)
      pendingMessages.push(queuedMessage)
      if (isBootComplete) {
        drainPendingMessages()
      }
    }

    const forkCommand = (
      command: HostCommand<Message, Resources>,
      maybeOperation: Option.Option<Operation>,
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
              Effect.flatMap(message =>
                Effect.sync(() =>
                  enqueueQueuedMessage({ message, maybeOperation }),
                ),
              ),
              Effect.catchCause(cause => Effect.sync(() => crash(cause))),
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
      maybeOperation,
    }: QueuedMessage<Message>): void => {
      try {
        const currentModel = liveModel
        const [nextModel, commands] = config.update(currentModel, message)

        if (currentModel !== nextModel) {
          liveModel = nextModel
          PubSub.publishUnsafe(modelPubSub, nextModel)
          notifyModelListeners(nextModel)
        }

        for (const command of commands) {
          forkCommand(command, maybeOperation)
        }
      } catch (error) {
        crash(Cause.die(error))
      } finally {
        completeOperationWork(activeOperations, maybeOperation)
      }
    }

    function drainPendingMessages(): void {
      if (
        !isBootComplete ||
        isProcessingMessages ||
        isRuntimeDisposed ||
        Option.isSome(maybeCrashCause)
      ) {
        return
      }

      isProcessingMessages = true
      try {
        while (Array.isReadonlyArrayNonEmpty(pendingMessages)) {
          const batch = pendingMessages
          pendingMessages = []
          batch.forEach(processMessage)
        }
      } finally {
        isProcessingMessages = false
      }
    }

    const enqueueMessage = (message: Message): void => {
      enqueueQueuedMessage({ message, maybeOperation: Option.none() })
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

    const run = (message: Message): Effect.Effect<Model> =>
      Effect.suspend(() => {
        if (isRuntimeDisposed) {
          return Effect.interrupt
        }
        if (Option.isSome(maybeCrashCause)) {
          return Effect.failCause(maybeCrashCause.value)
        }

        const operation = makeOperation(activeOperations)
        enqueueQueuedMessage({
          message,
          maybeOperation: Option.some(operation),
        })
        return Effect.andThen(
          Deferred.await(operation.completion),
          Effect.sync(readModel),
        )
      })

    const startSubscription = ([
      _key,
      {
        dependenciesSchema,
        modelToDependencies,
        keepAliveEquivalence,
        dependenciesToStream,
      },
    ]: readonly [string, Subscriptions<Model, Message, Resources>[string]]) =>
      Effect.gen(function* () {
        const equivalence =
          keepAliveEquivalence ?? Schema.toEquivalence(dependenciesSchema)
        const initDependencies = modelToDependencies(initModel)
        const latestDependenciesRef = yield* Ref.make(initDependencies)

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
          Stream.concat(Stream.make(initDependencies), modelChangesStream).pipe(
            Stream.changesWith(equivalence),
            Stream.switchMap(dependencies =>
              dependenciesToStream(dependencies, () =>
                Ref.getUnsafe(latestDependenciesRef),
              ),
            ),
            Stream.runForEach(message =>
              Effect.sync(() => enqueueMessage(message)),
            ),
            provideResources,
            Effect.catchCause(cause => Effect.sync(() => crash(cause))),
          ),
        )
      })

    if (config.subscriptions !== undefined) {
      yield* pipe(
        config.subscriptions,
        Record.toEntries,
        Effect.forEach(startSubscription, {
          concurrency: 'unbounded',
          discard: true,
        }),
      )
    }

    const initializationOperation = makeOperation(activeOperations)
    const maybeInitializationOperation = Option.some(initializationOperation)
    addOperationWork(maybeInitializationOperation)
    for (const command of initCommands) {
      forkCommand(command, maybeInitializationOperation)
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
      modelListeners.clear()
      pendingMessages = []
      failOperations(activeOperations, Cause.interrupt(undefined))
      return Scope.close(runtimeScope, Exit.void)
    })

    yield* Effect.addFinalizer(() => shutdown)

    return {
      readModel,
      enqueueMessage,
      observeModel,
      run,
      initialization,
      shutdown,
    }
  })
