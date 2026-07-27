import { Array, Cause, Effect, Exit, Layer, Option, Scope } from 'effect'
import type * as Program from 'foldkit/program'
import {
  type ProgramRuntime,
  type ProgramRuntimeEvent,
  type ProgramRuntimeJournalConfig,
  type ProgramRuntimeStartError,
  type ReplayController,
  type ReplayControllerSnapshot,
  type ReplayFrameError,
  type SendOptions,
  UnsettledReplayFrameError,
  makeReplayController,
} from 'foldkit/program-runtime'
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'

import {
  type DependencyChoice,
  type DependencySelection,
  type DependencySet,
  type DependencySetRuntime,
  DependencyStartupError,
} from './dependencyChoice.js'
import type {
  ReactProgramActions,
  ReactProgramFallback,
  ReactProgramLifecycle,
} from './reactProgram.js'

/** Replay state and operations exposed beside a React Program's domain hooks. */
export type ReactReplay<Model, Message> = Readonly<{
  mode: ReplayControllerSnapshot<unknown>['mode']
  frame: number
  finalFrame: number
  isBranchable: boolean
  maybeError: Option.Option<string>
  runtimeEvents: ReadonlyArray<ProgramRuntimeEvent>
  occurredRuntimeEvents: ReadonlyArray<ProgramRuntimeEvent>
  inspect: (frame?: number) => void
  seek: (frame: number) => void
  stepBackward: () => void
  stepForward: () => void
  stateRoute: () => Program.StateRoute<Model>
  replayRoute: () => Program.ReplayRoute<Model, Message>
}>

/** A React replay client initialized from one typed route input. */
export type ReplayableReactProgramClient<
  Model,
  Message,
  Actions extends ReactProgramActions,
  InitialRoute,
  StartupError,
> = Readonly<{
  Provider: ({
    children,
    fallback,
    initialRoute,
  }: Readonly<{
    children: ReactNode
    fallback?: ReactProgramFallback<StartupError>
    initialRoute: InitialRoute
  }>) => ReactElement
  useActions: () => Actions
  useLifecycle: () => ReactProgramLifecycle<StartupError>
  useModel: () => Model
  useReplay: () => ReactReplay<Model, Message>
}>

/** A replay client with a typed set of independently switchable dependencies. */
export type ReplayableReactProgramClientWithDependencies<
  Model,
  Message,
  Actions extends ReactProgramActions,
  InitialRoute,
  DependencyChoices,
  StartupError,
> = ReplayableReactProgramClient<
  Model,
  Message,
  Actions,
  InitialRoute,
  StartupError
> &
  Readonly<{
    useDependency: <
      ImplementationName extends string,
      ServiceIdentifier,
    >(config: {
      readonly dependencyKey: DependencyChoice<
        ImplementationName,
        ServiceIdentifier
      > &
        DependencyChoices
    }) => DependencySelection<ImplementationName>
  }>

/** Configuration for one replayable React Program client. */
export type ReplayableReactProgramClientConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  Resources = never,
  ResourceError = never,
> = Readonly<{
  createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions
  name: string
  program: Program.Program<Model, Message, Resources>
  resources: Layer.Layer<Resources, ResourceError>
  route: (
    initialRoute: InitialRoute,
  ) => Program.ResolvedProgramRoute<Model, Message>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
  onLifecycleChanged?: (
    lifecycle: ReactProgramLifecycle<
      ProgramRuntimeStartError | ReplayFrameError | ResourceError
    >,
  ) => void
}>

/** Configuration for a replay client with switchable dependencies. */
export type ReplayableReactProgramClientWithDependenciesConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  DependencyServices,
  DependencyChoices,
  Resources = never,
  ResourceError = never,
> = Readonly<{
  createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions
  dependencies: DependencySet<DependencyServices, DependencyChoices>
  name: string
  program: Program.Program<Model, Message, Resources | DependencyServices>
  resources: Layer.Layer<Resources, ResourceError>
  route: (
    initialRoute: InitialRoute,
  ) => Program.ResolvedProgramRoute<Model, Message>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
  onLifecycleChanged?: (
    lifecycle: ReactProgramLifecycle<
      | ProgramRuntimeStartError
      | ReplayFrameError
      | ResourceError
      | DependencyStartupError
    >,
  ) => void
}>

/** Compatibility bindings whose Provider names its route input `flags`. */
export type ReplayableReactProgramBindingsWithFlags<
  Model,
  Message,
  Actions extends ReactProgramActions,
  Flags,
  StartupError = ProgramRuntimeStartError | ReplayFrameError,
> = Readonly<{
  Provider: ({
    children,
    fallback,
    flags,
  }: Readonly<{
    children: ReactNode
    fallback?: ReactProgramFallback<StartupError>
    flags: Flags
  }>) => ReactElement
  useActions: () => Actions
  useLifecycle: () => ReactProgramLifecycle<StartupError>
  useModel: () => Model
  useReplay: () => ReactReplay<Model, Message>
}>

/** Compatibility configuration for replayable bindings initialized by flags. */
export type ReplayableReactProgramConfigWithFlags<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
  ResourceError = never,
> = ReplayableReactProgramClientConfig<
  Model,
  Message,
  Actions,
  Flags,
  Resources,
  ResourceError
>

type ReplayableReactProgramStore<
  Model,
  Message,
  Actions extends ReactProgramActions,
> = Readonly<{
  actions: Actions
  readModel: () => Model
  readReplay: () => ReactReplay<Model, Message>
  stopObserving: () => void
  subscribe: (listener: () => void) => () => void
}>

type RunningReplayController<Model, Message, ResourceError> = Readonly<{
  controller: ReplayController<Model, Message, ResourceError>
  scope: Scope.Closeable
}>

type ReplayProviderSnapshot<
  Model,
  Message,
  Actions extends ReactProgramActions,
  StartupError,
> = Readonly<{
  lifecycle: ReactProgramLifecycle<StartupError>
  store: ReplayableReactProgramStore<Model, Message, Actions> | null
}>

type ReplayProviderController<
  Model,
  Message,
  Actions extends ReactProgramActions,
  StartupError,
> = Readonly<{
  mount: () => () => void
  read: () => ReplayProviderSnapshot<Model, Message, Actions, StartupError>
  readServer: () => ReplayProviderSnapshot<
    Model,
    Message,
    Actions,
    StartupError
  >
  subscribe: (listener: () => void) => () => void
}>

type ReplayClientDefinition<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ResourceError,
  DependencyServices,
> = Readonly<{
  dependencyRuntime?: DependencySetRuntime<DependencyServices>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
  program: Program.Program<Model, Message, Resources>
  resources: Layer.Layer<Resources, ResourceError>
  route: Program.ResolvedProgramRoute<Model, Message>
}>

const clampFrame = (frame: number, finalFrame: number): number =>
  Math.min(Math.max(Math.trunc(frame), 0), finalFrame)

const branchUnavailableMessage = (frame: number): string =>
  `Frame ${frame.toString()} is waiting for a Command result. Select a settled frame before branching.`

const messageForError = (error: unknown): string => {
  if (error instanceof UnsettledReplayFrameError) {
    return branchUnavailableMessage(error.frame)
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

const runEffect = <Value, Error>(
  effect: Effect.Effect<Value, Error>,
  onFailure: (error: unknown) => void,
  onSettled?: () => void,
): void => {
  Effect.runCallback(effect, {
    onExit: exit => {
      onSettled?.()
      if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
        onFailure(Cause.squash(exit.cause))
      }
    },
  })
}

const isBranchableSnapshot = <Model, Message>(
  controller: ReplayController<Model, Message, unknown>,
  snapshot: ReplayControllerSnapshot<Model>,
): boolean => {
  if (snapshot.mode === 'Live') {
    return true
  }
  const tape = controller.readReplayTape()
  if (snapshot.frame === 0) {
    return Array.isReadonlyArrayEmpty(tape.initialCommands)
  }
  const maybeTransition = Array.get(tape.transitions, snapshot.frame - 1)
  return (
    Option.isSome(maybeTransition) && maybeTransition.value.isOperationSettled
  )
}

const makeReplayableProgramStore = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  ResourceError,
  DependencyServices,
>(
  controller: ReplayController<Model, Message, ResourceError>,
  createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions,
  dependencyRuntime?: DependencySetRuntime<DependencyServices>,
): ReplayableReactProgramStore<Model, Message, Actions> => {
  let snapshot = controller.read()
  let maybeError = Option.none<string>()
  let replay: ReactReplay<Model, Message>
  const listeners = new Set<() => void>()

  if (snapshot.mode === 'Inspecting') {
    dependencyRuntime?.synchronizeReplay(snapshot.runtimeEvents, snapshot.frame)
  }

  const notify = (): void => {
    listeners.forEach(listener => listener())
  }

  const setError = (error: unknown): void => {
    maybeError = Option.some(messageForError(error))
    replay = replayForSnapshot(snapshot)
    notify()
  }

  const attachLiveTimeline = (): void => {
    if (dependencyRuntime === undefined) {
      return
    }
    const maybeTimeline = controller.readTimeline()
    if (Option.isSome(maybeTimeline)) {
      dependencyRuntime.attachTimeline(maybeTimeline.value)
    }
  }

  const execute = <Value, Error>(effect: Effect.Effect<Value, Error>): void => {
    const trackedEffect = effect.pipe(
      Effect.ensuring(Effect.sync(attachLiveTimeline)),
    )
    if (dependencyRuntime === undefined) {
      runEffect(trackedEffect, setError)
    } else {
      dependencyRuntime.track(
        trackedEffect.pipe(
          Effect.catch(error => Effect.sync(() => setError(error))),
        ),
      )
    }
  }

  const inspect = (frame?: number): void => {
    maybeError = Option.none()
    execute(controller.inspect(frame))
  }

  const seek = (frame: number): void => {
    maybeError = Option.none()
    const nextFrame = clampFrame(frame, snapshot.finalFrame)
    if (snapshot.mode === 'Live') {
      execute(controller.inspect(nextFrame))
    } else {
      execute(controller.seek(nextFrame))
    }
  }

  const stepBackward = (): void => {
    if (snapshot.frame === 0) {
      return
    }
    if (snapshot.mode === 'Live') {
      execute(controller.inspect(snapshot.frame - 1))
    } else {
      execute(controller.stepBackward)
    }
  }

  const stepForward = (): void => {
    if (
      snapshot.mode === 'Inspecting' &&
      snapshot.frame < snapshot.finalFrame
    ) {
      execute(controller.stepForward)
    }
  }

  const replayForSnapshot = (
    nextSnapshot: ReplayControllerSnapshot<Model>,
  ): ReactReplay<Model, Message> => ({
    mode: nextSnapshot.mode,
    frame: nextSnapshot.frame,
    finalFrame: nextSnapshot.finalFrame,
    isBranchable: isBranchableSnapshot(controller, nextSnapshot),
    maybeError,
    runtimeEvents: nextSnapshot.runtimeEvents,
    occurredRuntimeEvents: Array.filter(
      nextSnapshot.runtimeEvents,
      event => event.afterFrame <= nextSnapshot.frame,
    ),
    inspect,
    seek,
    stepBackward,
    stepForward,
    stateRoute: controller.stateRoute,
    replayRoute: controller.replayRoute,
  })

  replay = replayForSnapshot(snapshot)
  const stopObserving = controller.observe(nextSnapshot => {
    snapshot = nextSnapshot
    if (nextSnapshot.mode === 'Inspecting') {
      dependencyRuntime?.synchronizeReplay(
        nextSnapshot.runtimeEvents,
        nextSnapshot.frame,
      )
    }
    maybeError = Option.none()
    replay = replayForSnapshot(nextSnapshot)
    notify()
  })

  const send: ProgramRuntime<Model, Message>['send'] = (
    message,
    options?: SendOptions,
  ) => {
    if (isBranchableSnapshot(controller, snapshot)) {
      maybeError = Option.none()
      execute(controller.run(message, options))
    } else {
      setError(new UnsettledReplayFrameError({ frame: snapshot.frame }))
    }
  }

  attachLiveTimeline()

  return {
    actions: createActions(send),
    readModel: () => snapshot.model,
    readReplay: () => replay,
    stopObserving,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const startReplayController = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ResourceError,
  DependencyServices,
>(
  definition: ReplayClientDefinition<
    Model,
    Message,
    Resources,
    ResourceError,
    DependencyServices
  >,
): Effect.Effect<
  RunningReplayController<Model, Message, ResourceError>,
  ProgramRuntimeStartError | ReplayFrameError | ResourceError
> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    return yield* makeReplayController({
      program: definition.program,
      resources: definition.resources,
      route: definition.route,
      ...(definition.journal === undefined
        ? {}
        : { journal: definition.journal }),
    }).pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.map(controller => ({ controller, scope })),
      Effect.onExit(exit =>
        Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void,
      ),
    )
  })

const stopReplayController = <Model, Message, ResourceError>(
  runningController: RunningReplayController<Model, Message, ResourceError>,
  store: ReplayableReactProgramStore<Model, Message, ReactProgramActions>,
): Effect.Effect<void> => {
  store.stopObserving()
  return runningController.controller.shutdown.pipe(
    Effect.ensuring(Scope.close(runningController.scope, Exit.void)),
  )
}

const makeReplayProviderController = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Resources,
  ResourceError,
  DependencyServices,
>(
  config: Readonly<{
    createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions
    onLifecycleChanged?: (
      lifecycle: ReactProgramLifecycle<
        ProgramRuntimeStartError | ReplayFrameError | ResourceError
      >,
    ) => void
  }>,
  definition: ReplayClientDefinition<
    Model,
    Message,
    Resources,
    ResourceError,
    DependencyServices
  >,
): ReplayProviderController<
  Model,
  Message,
  Actions,
  ProgramRuntimeStartError | ReplayFrameError | ResourceError
> => {
  type StartupError =
    | ProgramRuntimeStartError
    | ReplayFrameError
    | ResourceError
  type Snapshot = ReplayProviderSnapshot<Model, Message, Actions, StartupError>

  const idle: ReactProgramLifecycle<StartupError> = { _tag: 'Idle' }
  const serverSnapshot: Snapshot = { lifecycle: idle, store: null }
  const listeners = new Set<() => void>()
  let snapshot = serverSnapshot
  let running:
    | Readonly<{
        controller: RunningReplayController<Model, Message, ResourceError>
        store: ReplayableReactProgramStore<Model, Message, Actions>
      }>
    | undefined
  let maybeInterruptStartup: (() => void) | undefined
  let isMounted = false
  let isStopping = false
  let hasReportedIdle = false
  let stopGeneration = 0

  const reportLifecycle = (
    lifecycle: ReactProgramLifecycle<StartupError>,
    store: ReplayableReactProgramStore<
      Model,
      Message,
      Actions
    > | null = snapshot.store,
  ): void => {
    snapshot = { lifecycle, store }
    listeners.forEach(listener => listener())
    try {
      config.onLifecycleChanged?.(lifecycle)
    } catch (error) {
      console.error('[foldkit] replay lifecycle observer threw:', error)
    }
  }

  const finishStopping = (): void => {
    isStopping = false
    reportLifecycle({ _tag: 'Stopped' }, null)
  }

  const stopRunning = (current: NonNullable<typeof running>): void => {
    running = undefined
    runEffect(
      stopReplayController(current.controller, current.store),
      error => console.error('[foldkit] replay shutdown failed:', error),
      finishStopping,
    )
  }

  const stop = (): void => {
    if (isStopping || snapshot.lifecycle._tag === 'Stopped') {
      return
    }
    isStopping = true
    reportLifecycle({ _tag: 'Stopping' }, null)
    maybeInterruptStartup?.()
    maybeInterruptStartup = undefined
    if (running === undefined) {
      finishStopping()
    } else {
      stopRunning(running)
    }
  }

  const start = (): void => {
    reportLifecycle({ _tag: 'Starting' }, null)
    let didComplete = false
    const interruptStartup = Effect.runCallback(
      startReplayController(definition),
      {
        onExit: exit => {
          didComplete = true
          maybeInterruptStartup = undefined
          if (Exit.isSuccess(exit)) {
            const store = makeReplayableProgramStore(
              exit.value.controller,
              config.createActions,
              definition.dependencyRuntime,
            )
            const nextRunning = { controller: exit.value, store }
            running = nextRunning
            definition.dependencyRuntime?.track(
              exit.value.controller.initialization,
            )
            if (isStopping) {
              stopRunning(nextRunning)
            } else {
              reportLifecycle({ _tag: 'Ready' }, store)
            }
          } else if (isStopping || Cause.hasInterruptsOnly(exit.cause)) {
            finishStopping()
          } else {
            reportLifecycle({ _tag: 'Failed', cause: exit.cause }, null)
          }
        },
      },
    )
    if (!didComplete) {
      maybeInterruptStartup = interruptStartup
    }
  }

  const mount = (): (() => void) => {
    isMounted = true
    stopGeneration += 1
    if (!hasReportedIdle) {
      hasReportedIdle = true
      reportLifecycle(idle)
    }
    if (
      snapshot.lifecycle._tag === 'Idle' ||
      snapshot.lifecycle._tag === 'Stopped'
    ) {
      start()
    }

    return () => {
      isMounted = false
      stopGeneration += 1
      const requestedStopGeneration = stopGeneration
      globalThis.queueMicrotask(() => {
        if (!isMounted && requestedStopGeneration === stopGeneration) {
          stop()
        }
      })
    }
  }

  return {
    mount,
    read: () => snapshot,
    readServer: () => serverSnapshot,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const fallbackForLifecycle = <StartupError,>(
  fallback: ReactProgramFallback<StartupError> | undefined,
  lifecycle: ReactProgramLifecycle<StartupError>,
): ReactNode => {
  if (typeof fallback === 'function') {
    return fallback(lifecycle)
  }
  return fallback ?? null
}

const createReplayClient = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  Resources,
  ResourceError,
  DependencyServices,
>(
  config: Readonly<{
    createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions
    dependencyRuntimeForProvider?: () => DependencySetRuntime<DependencyServices>
    journal?: ProgramRuntimeJournalConfig<Model, Message>
    name: string
    onLifecycleChanged?: (
      lifecycle: ReactProgramLifecycle<
        ProgramRuntimeStartError | ReplayFrameError | ResourceError
      >,
    ) => void
    program: Program.Program<Model, Message, Resources>
    resources: (
      dependencyRuntime: DependencySetRuntime<DependencyServices> | undefined,
    ) => Layer.Layer<Resources, ResourceError>
    route: (
      initialRoute: InitialRoute,
    ) => Program.ResolvedProgramRoute<Model, Message>
  }>,
) => {
  type StartupError =
    | ProgramRuntimeStartError
    | ReplayFrameError
    | ResourceError
  const ProgramContext = createContext<ReplayableReactProgramStore<
    Model,
    Message,
    Actions
  > | null>(null)
  const LifecycleContext =
    createContext<ReactProgramLifecycle<StartupError> | null>(null)
  const DependencyOwnerContext = createContext<object | null>(null)

  const useProgramStore = (): ReplayableReactProgramStore<
    Model,
    Message,
    Actions
  > => {
    const store = useContext(ProgramContext)
    if (store === null) {
      throw new Error(
        `${config.name} hooks must be used inside a ready ${config.name}Provider`,
      )
    }
    return store
  }

  const Provider = ({
    children,
    fallback,
    initialRoute,
  }: Readonly<{
    children: ReactNode
    fallback?: ReactProgramFallback<StartupError>
    initialRoute: InitialRoute
  }>): ReactElement => {
    const [definition] = useState(() => {
      const dependencyRuntime = config.dependencyRuntimeForProvider?.()
      return {
        program: config.program,
        resources: config.resources(dependencyRuntime),
        route: config.route(initialRoute),
        ...(dependencyRuntime === undefined ? {} : { dependencyRuntime }),
        ...(config.journal === undefined ? {} : { journal: config.journal }),
      }
    })
    const [controller] = useState(() =>
      makeReplayProviderController(config, definition),
    )
    const providerSnapshot = useSyncExternalStore(
      controller.subscribe,
      controller.read,
      controller.readServer,
    )

    useEffect(controller.mount, [controller])

    const content =
      providerSnapshot.store === null ? (
        <>{fallbackForLifecycle(fallback, providerSnapshot.lifecycle)}</>
      ) : (
        <ProgramContext.Provider value={providerSnapshot.store}>
          {children}
        </ProgramContext.Provider>
      )

    return (
      <DependencyOwnerContext.Provider
        value={definition.dependencyRuntime?.owner ?? null}
      >
        <LifecycleContext.Provider value={providerSnapshot.lifecycle}>
          {content}
        </LifecycleContext.Provider>
      </DependencyOwnerContext.Provider>
    )
  }

  const useModel = (): Model => {
    const store = useProgramStore()
    return useSyncExternalStore(
      store.subscribe,
      store.readModel,
      store.readModel,
    )
  }

  const useActions = (): Actions => useProgramStore().actions

  const useLifecycle = (): ReactProgramLifecycle<StartupError> => {
    const lifecycle = useContext(LifecycleContext)
    if (lifecycle === null) {
      throw new Error(
        `${config.name} lifecycle hook must be used inside ${config.name}Provider`,
      )
    }
    return lifecycle
  }

  const useReplay = (): ReactReplay<Model, Message> => {
    const store = useProgramStore()
    return useSyncExternalStore(
      store.subscribe,
      store.readReplay,
      store.readReplay,
    )
  }

  const useDependencyOwner = (): object => {
    const owner = useContext(DependencyOwnerContext)
    if (owner === null) {
      throw new Error(`${config.name} does not declare switchable dependencies`)
    }
    return owner
  }

  return {
    Provider,
    useActions,
    useDependencyOwner,
    useLifecycle,
    useModel,
    useReplay,
  }
}

/** Creates one ReplayController-backed React client. */
export const createReplayableReactProgramClient = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  Resources = never,
  ResourceError = never,
>(
  config: ReplayableReactProgramClientConfig<
    Model,
    Message,
    Actions,
    InitialRoute,
    Resources,
    ResourceError
  >,
): ReplayableReactProgramClient<
  Model,
  Message,
  Actions,
  InitialRoute,
  ProgramRuntimeStartError | ReplayFrameError | ResourceError
> =>
  createReplayClient({
    createActions: config.createActions,
    name: config.name,
    program: config.program,
    resources: () => config.resources,
    route: config.route,
    ...(config.journal === undefined ? {} : { journal: config.journal }),
    ...(config.onLifecycleChanged === undefined
      ? {}
      : { onLifecycleChanged: config.onLifecycleChanged }),
  })

/** Creates a replayable React client with switchable Effect dependencies. */
export const createReplayableReactProgramClientWithDependencies = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  DependencyServices,
  DependencyChoices,
  Resources = never,
  ResourceError = never,
>(
  config: ReplayableReactProgramClientWithDependenciesConfig<
    Model,
    Message,
    Actions,
    InitialRoute,
    DependencyServices,
    DependencyChoices,
    Resources,
    ResourceError
  >,
): ReplayableReactProgramClientWithDependencies<
  Model,
  Message,
  Actions,
  InitialRoute,
  DependencyChoices,
  | ProgramRuntimeStartError
  | ReplayFrameError
  | ResourceError
  | DependencyStartupError
> => {
  const bindings = createReplayClient<
    Model,
    Message,
    Actions,
    InitialRoute,
    Resources | DependencyServices,
    ResourceError | DependencyStartupError,
    DependencyServices
  >({
    createActions: config.createActions,
    dependencyRuntimeForProvider: config.dependencies.makeRuntime,
    name: config.name,
    program: config.program,
    resources: dependencyRuntime => {
      if (dependencyRuntime === undefined) {
        throw new Error(`${config.name} dependency runtime was not created`)
      }
      return Layer.merge(config.resources, dependencyRuntime.layer)
    },
    route: config.route,
    ...(config.journal === undefined ? {} : { journal: config.journal }),
    ...(config.onLifecycleChanged === undefined
      ? {}
      : { onLifecycleChanged: config.onLifecycleChanged }),
  })

  const useDependencySelection = <
    ImplementationName extends string,
    ServiceIdentifier,
  >(
    dependencyKey: DependencyChoice<ImplementationName, ServiceIdentifier>,
    owner: object,
  ): DependencySelection<ImplementationName> => {
    const store = dependencyKey.storeFor(owner)
    return useSyncExternalStore(store.subscribe, store.read, store.read)
  }

  const useDependency = <ImplementationName extends string, ServiceIdentifier>({
    dependencyKey,
  }: {
    readonly dependencyKey: DependencyChoice<
      ImplementationName,
      ServiceIdentifier
    > &
      DependencyChoices
  }): DependencySelection<ImplementationName> =>
    useDependencySelection(dependencyKey, bindings.useDependencyOwner())

  return {
    Provider: bindings.Provider,
    useActions: bindings.useActions,
    useDependency,
    useLifecycle: bindings.useLifecycle,
    useModel: bindings.useModel,
    useReplay: bindings.useReplay,
  }
}

/** Creates replayable bindings whose Provider accepts typed flags. */
export const createReplayableReactProgramBindingsWithFlags = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
  ResourceError = never,
>(
  config: ReplayableReactProgramConfigWithFlags<
    Model,
    Message,
    Actions,
    Flags,
    Resources,
    ResourceError
  >,
): ReplayableReactProgramBindingsWithFlags<
  Model,
  Message,
  Actions,
  Flags,
  ProgramRuntimeStartError | ReplayFrameError | ResourceError
> => {
  const client = createReplayableReactProgramClient(config)
  return {
    Provider: ({ children, fallback, flags }) => (
      <client.Provider initialRoute={flags} fallback={fallback}>
        {children}
      </client.Provider>
    ),
    useActions: client.useActions,
    useLifecycle: client.useLifecycle,
    useModel: client.useModel,
    useReplay: client.useReplay,
  }
}
