import { Cause, Effect, Exit, Layer, Scope } from 'effect'
import type * as Program from 'foldkit/program'
import {
  type ProgramRuntime,
  type ProgramRuntimeJournalConfig,
  type ProgramRuntimeStartError,
  type ProgramStart,
  makeProgramRuntime,
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
  type DependencyLifecycle,
  type DependencySelection,
  type DependencySet,
  DependencyStartupError,
  defineSingleDependencySet,
} from './dependencyChoice.js'

/** Actions exposed by one React host binding. */
export type ReactProgramActions = object

/** The complete lifecycle of one React-owned Foldkit Program. */
export type ReactProgramLifecycle<StartupError> =
  | Readonly<{ _tag: 'Idle' }>
  | Readonly<{ _tag: 'Starting' }>
  | Readonly<{ _tag: 'Ready' }>
  | Readonly<{
      _tag: 'Failed'
      cause: Cause.Cause<StartupError>
    }>
  | Readonly<{ _tag: 'Stopping' }>
  | Readonly<{ _tag: 'Stopped' }>

/** Startup content selected from the Provider's stable lifecycle snapshot. */
export type ReactProgramFallback<StartupError> =
  | ReactNode
  | ((lifecycle: ReactProgramLifecycle<StartupError>) => ReactNode)

/** A React host binding over one Foldkit Program. */
export type ReactProgramBindings<
  Model,
  Actions extends ReactProgramActions,
  StartupError = ProgramRuntimeStartError,
> = Readonly<{
  Provider: ({
    children,
    fallback,
  }: Readonly<{
    children: ReactNode
    fallback?: ReactProgramFallback<StartupError>
  }>) => ReactElement
  useActions: () => Actions
  useLifecycle: () => ReactProgramLifecycle<StartupError>
  useModel: () => Model
}>

/** A React host binding whose Provider initializes a Program with typed flags. */
export type ReactProgramBindingsWithFlags<
  Model,
  Actions extends ReactProgramActions,
  Flags,
  StartupError = ProgramRuntimeStartError,
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
}>

/** A React client whose Provider starts from one typed initial route. */
export type ReactProgramClient<
  Model,
  Actions extends ReactProgramActions,
  InitialRoute,
  StartupError = ProgramRuntimeStartError,
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
}>

/** A React client with one host-switchable Effect dependency. */
export type ReactProgramClientWithDependency<
  Model,
  Actions extends ReactProgramActions,
  InitialRoute,
  ImplementationName extends string,
  ServiceIdentifier,
  StartupError = ProgramRuntimeStartError,
> = ReactProgramClient<Model, Actions, InitialRoute, StartupError> &
  Readonly<{
    useDependency: (config: {
      readonly dependencyKey: DependencyChoice<
        ImplementationName,
        ServiceIdentifier
      >
    }) => DependencySelection<ImplementationName>
  }>

/** A React client with a typed set of host-switchable Effect dependencies. */
export type ReactProgramClientWithDependencies<
  Model,
  Actions extends ReactProgramActions,
  InitialRoute,
  DependencyChoices,
  StartupError = ProgramRuntimeStartError,
> = ReactProgramClient<Model, Actions, InitialRoute, StartupError> &
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

type ReactProgramStore<Model, Actions extends ReactProgramActions> = Readonly<{
  actions: Actions
  readModel: () => Model
  subscribe: (listener: () => void) => () => void
}>

type RunningProgram<Model, Message> = Readonly<{
  runtime: ProgramRuntime<Model, Message>
  scope: Scope.Closeable
}>

/** Configuration for creating React bindings over one Foldkit Program. */
export type ReactProgramConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Resources = never,
  ResourceError = never,
> = Readonly<{
  createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions
  name: string
  program: Program.Program<Model, Message, Resources>
  resources: Layer.Layer<Resources, ResourceError>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
  onLifecycleChanged?: (
    lifecycle: ReactProgramLifecycle<ProgramRuntimeStartError | ResourceError>,
  ) => void
}>

/** Configuration for React bindings initialized with typed flags. */
export type ReactProgramConfigWithFlags<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
  ResourceError = never,
> = ReactProgramConfig<Model, Message, Actions, Resources, ResourceError> &
  Readonly<{
    start: (flags: Flags) => ProgramStart<Model, Message>
  }>

/** Configuration for a React client initialized by one typed route. */
export type ReactProgramClientConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  Resources = never,
  ResourceError = never,
> = ReactProgramConfig<Model, Message, Actions, Resources, ResourceError> &
  Readonly<{
    start: (initialRoute: InitialRoute) => ProgramStart<Model, Message>
  }>

/** Configuration for a React client with one host-switchable dependency. */
export type ReactProgramClientWithDependencyConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  ImplementationName extends string,
  ServiceIdentifier,
  Resources = never,
  ResourceError = never,
> = Readonly<{
  createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions
  dependency: DependencyChoice<ImplementationName, ServiceIdentifier>
  name: string
  onDependencyLifecycleChanged?: (
    lifecycle: DependencyLifecycle<ImplementationName>,
  ) => void
  onLifecycleChanged?: (
    lifecycle: ReactProgramLifecycle<
      ProgramRuntimeStartError | ResourceError | DependencyStartupError
    >,
  ) => void
  program: Program.Program<Model, Message, Resources | ServiceIdentifier>
  resources: Layer.Layer<Resources, ResourceError>
  start: (initialRoute: InitialRoute) => ProgramStart<Model, Message>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
}>

/** Configuration for a React client with multiple switchable dependencies. */
export type ReactProgramClientWithDependenciesConfig<
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
  onLifecycleChanged?: (
    lifecycle: ReactProgramLifecycle<
      ProgramRuntimeStartError | ResourceError | DependencyStartupError
    >,
  ) => void
  program: Program.Program<Model, Message, Resources | DependencyServices>
  resources: Layer.Layer<Resources, ResourceError>
  start: (initialRoute: InitialRoute) => ProgramStart<Model, Message>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
}>

/** One Program definition produced from typed React Provider flags. */
export type ReactProgramDefinition<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ResourceError = never,
> = Readonly<{
  program: Program.Program<Model, Message, Resources>
  resources: Layer.Layer<Resources, ResourceError>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
  start?: ProgramStart<Model, Message>
}>

/** Configuration for React bindings whose Program is created from flags. */
export type ReactProgramFactoryConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
  ResourceError = never,
> = Readonly<{
  createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions
  makeProgram: (
    flags: Flags,
  ) => ReactProgramDefinition<Model, Message, Resources, ResourceError>
  name: string
  onLifecycleChanged?: (
    lifecycle: ReactProgramLifecycle<ProgramRuntimeStartError | ResourceError>,
  ) => void
}>

const startProgram = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ResourceError,
>(
  config: Pick<
    ReactProgramConfig<
      Model,
      Message,
      ReactProgramActions,
      Resources,
      ResourceError
    >,
    'journal' | 'program' | 'resources'
  >,
  start?: ProgramStart<Model, Message>,
): Effect.Effect<
  RunningProgram<Model, Message>,
  ProgramRuntimeStartError | ResourceError
> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    return yield* makeProgramRuntime<
      Model,
      Message,
      Resources,
      never,
      undefined,
      ResourceError
    >({
      program: config.program,
      resources: config.resources,
      ...(start === undefined ? {} : { start }),
      ...(config.journal === undefined ? {} : { journal: config.journal }),
    }).pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.map(runtime => ({ runtime, scope })),
      Effect.onExit(exit =>
        Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void,
      ),
    )
  })

const stopProgram = <Model, Message>({
  runtime,
  scope,
}: RunningProgram<Model, Message>): Effect.Effect<void> =>
  runtime.shutdown.pipe(Effect.ensuring(Scope.close(scope, Exit.void)))

const makeProgramStore = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
>(
  runtime: ProgramRuntime<Model, Message>,
  createActions: (send: ProgramRuntime<Model, Message>['send']) => Actions,
  operationTracker?: ProgramOperationTracker,
): ReactProgramStore<Model, Actions> => ({
  actions: createActions(
    operationTracker === undefined
      ? runtime.send
      : (message, options) => operationTracker.send(runtime, message, options),
  ),
  readModel: runtime.readModel,
  subscribe: listener => runtime.observeModel(() => listener()),
})

type ProgramOperationTracker = Readonly<{
  send: <Model, Message>(
    runtime: ProgramRuntime<Model, Message>,
    message: Message,
    options?: Parameters<ProgramRuntime<Model, Message>['send']>[1],
  ) => void
  trackInitialization: <Model, Message>(
    runtime: ProgramRuntime<Model, Message>,
  ) => void
}>

type ReactProgramDependencyStore<Value> = Readonly<{
  read: () => Value
  subscribe: (listener: () => void) => () => void
}>

type ReactProgramBindingDefinition<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ResourceError,
  DependencyValue,
> = ReactProgramDefinition<Model, Message, Resources, ResourceError> &
  Readonly<{
    dependencyOwner?: object
    dependencyStore?: ReactProgramDependencyStore<DependencyValue>
    operationTracker?: ProgramOperationTracker
  }>

type ReactProgramProviderSnapshot<
  Model,
  Actions extends ReactProgramActions,
  StartupError,
> = Readonly<{
  lifecycle: ReactProgramLifecycle<StartupError>
  store: ReactProgramStore<Model, Actions> | null
}>

type ReactProgramProviderController<
  Model,
  Actions extends ReactProgramActions,
  StartupError,
> = Readonly<{
  mount: () => () => void
  read: () => ReactProgramProviderSnapshot<Model, Actions, StartupError>
  readServer: () => ReactProgramProviderSnapshot<Model, Actions, StartupError>
  subscribe: (listener: () => void) => () => void
}>

const makeProviderController = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Resources,
  ResourceError,
>(
  config: Pick<
    ReactProgramConfig<Model, Message, Actions, Resources, ResourceError>,
    'createActions' | 'name' | 'onLifecycleChanged'
  >,
  definition: ReactProgramDefinition<Model, Message, Resources, ResourceError> &
    Readonly<{ operationTracker?: ProgramOperationTracker }>,
): ReactProgramProviderController<
  Model,
  Actions,
  ProgramRuntimeStartError | ResourceError
> => {
  type StartupError = ProgramRuntimeStartError | ResourceError
  type Snapshot = ReactProgramProviderSnapshot<Model, Actions, StartupError>

  const idle: ReactProgramLifecycle<StartupError> = { _tag: 'Idle' }
  const serverSnapshot: Snapshot = { lifecycle: idle, store: null }
  const listeners = new Set<() => void>()
  let snapshot = serverSnapshot
  let maybeRunningProgram: RunningProgram<Model, Message> | undefined
  let maybeInterruptStartup: (() => void) | undefined
  let isMounted = false
  let isStopping = false
  let hasReportedIdle = false
  let stopGeneration = 0

  const notify = (): void => {
    listeners.forEach(listener => listener())
  }

  const reportLifecycle = (
    lifecycle: ReactProgramLifecycle<StartupError>,
    store: ReactProgramStore<Model, Actions> | null = snapshot.store,
  ): void => {
    snapshot = { lifecycle, store }
    notify()
    try {
      config.onLifecycleChanged?.(lifecycle)
    } catch (error) {
      console.error(`[foldkit] ${config.name} lifecycle observer threw:`, error)
    }
  }

  const finishStopping = (exit: Exit.Exit<void>): void => {
    maybeRunningProgram = undefined
    isStopping = false
    if (Exit.isFailure(exit)) {
      reportLifecycle({ _tag: 'Failed', cause: exit.cause }, null)
    } else {
      reportLifecycle({ _tag: 'Stopped' }, null)
    }
  }

  const stopRunningProgram = (
    runningProgram: RunningProgram<Model, Message>,
  ): void => {
    let didComplete = false
    Effect.runCallback(stopProgram(runningProgram), {
      onExit: exit => {
        didComplete = true
        finishStopping(exit)
      },
    })
    if (didComplete) {
      return
    }
  }

  const stop = (): void => {
    if (isStopping || snapshot.lifecycle._tag === 'Stopped') {
      return
    }
    isStopping = true
    reportLifecycle({ _tag: 'Stopping' })

    if (maybeRunningProgram !== undefined) {
      stopRunningProgram(maybeRunningProgram)
    } else if (maybeInterruptStartup !== undefined) {
      const interruptStartup = maybeInterruptStartup
      maybeInterruptStartup = undefined
      interruptStartup()
    } else {
      finishStopping(Exit.void)
    }
  }

  const start = (): void => {
    reportLifecycle({ _tag: 'Starting' }, null)
    let didComplete = false
    const interruptStartup = Effect.runCallback(
      startProgram(definition, definition.start),
      {
        onExit: exit => {
          didComplete = true
          maybeInterruptStartup = undefined
          if (Exit.isSuccess(exit)) {
            maybeRunningProgram = exit.value
            if (isStopping) {
              stopRunningProgram(exit.value)
            } else {
              definition.operationTracker?.trackInitialization(
                exit.value.runtime,
              )
              reportLifecycle(
                { _tag: 'Ready' },
                makeProgramStore(
                  exit.value.runtime,
                  config.createActions,
                  definition.operationTracker,
                ),
              )
            }
          } else if (isStopping || Cause.hasInterruptsOnly(exit.cause)) {
            finishStopping(Exit.void)
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

type ProgramProviderProps<StartupError> = Readonly<{
  children: ReactNode
  fallback?: ReactProgramFallback<StartupError>
}>

const fallbackForLifecycle = <StartupError,>(
  fallback: ReactProgramFallback<StartupError> | undefined,
  lifecycle: ReactProgramLifecycle<StartupError>,
): ReactNode => {
  if (typeof fallback === 'function') {
    return fallback(lifecycle)
  }
  return fallback ?? null
}

const createBindings = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Resources,
  ResourceError,
  DependencyValue,
  ProviderProps extends ProgramProviderProps<
    ProgramRuntimeStartError | ResourceError
  >,
>(
  config: Pick<
    ReactProgramConfig<Model, Message, Actions, Resources, ResourceError>,
    'createActions' | 'name' | 'onLifecycleChanged'
  >,
  definitionForProps: (
    props: ProviderProps,
  ) => ReactProgramBindingDefinition<
    Model,
    Message,
    Resources,
    ResourceError,
    DependencyValue
  >,
): Readonly<{
  Provider: (props: ProviderProps) => ReactElement
  useActions: () => Actions
  useLifecycle: () => ReactProgramLifecycle<
    ProgramRuntimeStartError | ResourceError
  >
  useDependencyValue: () => DependencyValue
  useDependencyOwner: () => object
  useModel: () => Model
}> => {
  type StartupError = ProgramRuntimeStartError | ResourceError
  const ProgramContext = createContext<ReactProgramStore<
    Model,
    Actions
  > | null>(null)
  const LifecycleContext =
    createContext<ReactProgramLifecycle<StartupError> | null>(null)
  const DependencyContext =
    createContext<ReactProgramDependencyStore<DependencyValue> | null>(null)
  const DependencyOwnerContext = createContext<object | null>(null)

  const useProgramStore = (): ReactProgramStore<Model, Actions> => {
    const store = useContext(ProgramContext)
    if (store === null) {
      throw new Error(
        `${config.name} hooks must be used inside a ready ${config.name}Provider`,
      )
    }
    return store
  }

  const Provider = (props: ProviderProps): ReactElement => {
    const [definition] = useState(() => definitionForProps(props))
    const [controller] = useState(() =>
      makeProviderController(config, definition),
    )
    const providerSnapshot = useSyncExternalStore(
      controller.subscribe,
      controller.read,
      controller.readServer,
    )

    useEffect(controller.mount, [controller])

    const content =
      providerSnapshot.store === null ? (
        <>{fallbackForLifecycle(props.fallback, providerSnapshot.lifecycle)}</>
      ) : (
        <ProgramContext.Provider value={providerSnapshot.store}>
          {props.children}
        </ProgramContext.Provider>
      )

    return (
      <DependencyOwnerContext.Provider
        value={definition.dependencyOwner ?? null}
      >
        <DependencyContext.Provider value={definition.dependencyStore ?? null}>
          <LifecycleContext.Provider value={providerSnapshot.lifecycle}>
            {content}
          </LifecycleContext.Provider>
        </DependencyContext.Provider>
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

  const useActions = (): Actions => {
    const store = useProgramStore()
    return store.actions
  }

  const useLifecycle = (): ReactProgramLifecycle<StartupError> => {
    const lifecycle = useContext(LifecycleContext)
    if (lifecycle === null) {
      throw new Error(
        `${config.name} lifecycle hook must be used inside ${config.name}Provider`,
      )
    }
    return lifecycle
  }

  const useDependencyValue = (): DependencyValue => {
    const dependencyStore = useContext(DependencyContext)
    if (dependencyStore === null) {
      throw new Error(`${config.name} does not declare a switchable dependency`)
    }
    return useSyncExternalStore(
      dependencyStore.subscribe,
      dependencyStore.read,
      dependencyStore.read,
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
    useDependencyValue,
    useLifecycle,
    useModel,
  }
}

/** Creates domain-shaped React hooks and Provider for one Foldkit Program. */
export const createReactProgramBindings = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Resources = never,
  ResourceError = never,
>(
  config: ReactProgramConfig<Model, Message, Actions, Resources, ResourceError>,
): ReactProgramBindings<
  Model,
  Actions,
  ProgramRuntimeStartError | ResourceError
> =>
  createBindings(config, () => ({
    program: config.program,
    resources: config.resources,
    ...(config.journal === undefined ? {} : { journal: config.journal }),
  }))

/** Creates domain-shaped React hooks initialized by one typed route. */
export const createReactProgramClient = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  Resources = never,
  ResourceError = never,
>(
  config: ReactProgramClientConfig<
    Model,
    Message,
    Actions,
    InitialRoute,
    Resources,
    ResourceError
  >,
): ReactProgramClient<
  Model,
  Actions,
  InitialRoute,
  ProgramRuntimeStartError | ResourceError
> =>
  createBindings(config, ({ initialRoute }) => ({
    program: config.program,
    resources: config.resources,
    start: config.start(initialRoute),
    ...(config.journal === undefined ? {} : { journal: config.journal }),
  }))

/** Creates React hooks for a Program with one host-switchable Effect Layer. */
export const createReactProgramClientWithDependency = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  ImplementationName extends string,
  ServiceIdentifier,
  Resources = never,
  ResourceError = never,
>(
  config: ReactProgramClientWithDependencyConfig<
    Model,
    Message,
    Actions,
    InitialRoute,
    ImplementationName,
    ServiceIdentifier,
    Resources,
    ResourceError
  >,
): ReactProgramClientWithDependency<
  Model,
  Actions,
  InitialRoute,
  ImplementationName,
  ServiceIdentifier,
  ProgramRuntimeStartError | ResourceError | DependencyStartupError
> => {
  type StartupError =
    | ProgramRuntimeStartError
    | ResourceError
    | DependencyStartupError
  type ProviderProps = ProgramProviderProps<StartupError> &
    Readonly<{ initialRoute: InitialRoute }>

  const bindings = createBindings<
    Model,
    Message,
    Actions,
    Resources | ServiceIdentifier,
    ResourceError | DependencyStartupError,
    DependencySelection<ImplementationName>,
    ProviderProps
  >(
    {
      createActions: config.createActions,
      name: config.name,
      ...(config.onLifecycleChanged === undefined
        ? {}
        : { onLifecycleChanged: config.onLifecycleChanged }),
    },
    ({ initialRoute }) => {
      const dependencyRuntime = defineSingleDependencySet(
        config.dependency,
        config.onDependencyLifecycleChanged,
      ).makeRuntime()
      return {
        program: config.program,
        resources: Layer.merge(config.resources, dependencyRuntime.layer),
        start: config.start(initialRoute),
        dependencyOwner: dependencyRuntime.owner,
        dependencyStore: config.dependency.storeFor(dependencyRuntime.owner),
        operationTracker: dependencyRuntime,
        ...(config.journal === undefined ? {} : { journal: config.journal }),
      }
    },
  )

  const useDependency = ({
    dependencyKey,
  }: {
    readonly dependencyKey: DependencyChoice<
      ImplementationName,
      ServiceIdentifier
    >
  }): DependencySelection<ImplementationName> => {
    const selection = bindings.useDependencyValue()
    if (dependencyKey !== config.dependency) {
      throw new Error(
        `${config.name} received a dependency key it does not own`,
      )
    }
    return selection
  }

  return {
    Provider: bindings.Provider,
    useActions: bindings.useActions,
    useDependency,
    useLifecycle: bindings.useLifecycle,
    useModel: bindings.useModel,
  }
}

/** Creates React hooks for a Program with multiple host-switchable Layers. */
export const createReactProgramClientWithDependencies = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  InitialRoute,
  DependencyServices,
  DependencyChoices,
  Resources = never,
  ResourceError = never,
>(
  config: ReactProgramClientWithDependenciesConfig<
    Model,
    Message,
    Actions,
    InitialRoute,
    DependencyServices,
    DependencyChoices,
    Resources,
    ResourceError
  >,
): ReactProgramClientWithDependencies<
  Model,
  Actions,
  InitialRoute,
  DependencyChoices,
  ProgramRuntimeStartError | ResourceError | DependencyStartupError
> => {
  type StartupError =
    | ProgramRuntimeStartError
    | ResourceError
    | DependencyStartupError
  type ProviderProps = ProgramProviderProps<StartupError> &
    Readonly<{ initialRoute: InitialRoute }>

  const bindings = createBindings<
    Model,
    Message,
    Actions,
    Resources | DependencyServices,
    ResourceError | DependencyStartupError,
    never,
    ProviderProps
  >(
    {
      createActions: config.createActions,
      name: config.name,
      ...(config.onLifecycleChanged === undefined
        ? {}
        : { onLifecycleChanged: config.onLifecycleChanged }),
    },
    ({ initialRoute }) => {
      const dependencyRuntime = config.dependencies.makeRuntime()
      return {
        program: config.program,
        resources: Layer.merge(config.resources, dependencyRuntime.layer),
        start: config.start(initialRoute),
        dependencyOwner: dependencyRuntime.owner,
        operationTracker: dependencyRuntime,
        ...(config.journal === undefined ? {} : { journal: config.journal }),
      }
    },
  )

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
  }): DependencySelection<ImplementationName> => {
    const owner = bindings.useDependencyOwner()
    return useDependencySelection(dependencyKey, owner)
  }

  return {
    Provider: bindings.Provider,
    useActions: bindings.useActions,
    useDependency,
    useLifecycle: bindings.useLifecycle,
    useModel: bindings.useModel,
  }
}

/** Creates domain-shaped React hooks whose Provider accepts typed flags. */
export const createReactProgramBindingsWithFlags = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
  ResourceError = never,
>(
  config: ReactProgramConfigWithFlags<
    Model,
    Message,
    Actions,
    Flags,
    Resources,
    ResourceError
  >,
): ReactProgramBindingsWithFlags<
  Model,
  Actions,
  Flags,
  ProgramRuntimeStartError | ResourceError
> =>
  createBindings(config, ({ flags }) => ({
    program: config.program,
    resources: config.resources,
    start: config.start(flags),
    ...(config.journal === undefined ? {} : { journal: config.journal }),
  }))

/** Creates React bindings whose Program definition is derived from flags. */
export const createReactProgramBindingsFromFlags = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
  ResourceError = never,
>(
  config: ReactProgramFactoryConfig<
    Model,
    Message,
    Actions,
    Flags,
    Resources,
    ResourceError
  >,
): ReactProgramBindingsWithFlags<
  Model,
  Actions,
  Flags,
  ProgramRuntimeStartError | ResourceError
> => createBindings(config, ({ flags }) => config.makeProgram(flags))
