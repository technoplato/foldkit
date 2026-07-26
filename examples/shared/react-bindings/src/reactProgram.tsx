import { Effect, Exit, Layer, Scope } from 'effect'
import { Program, Runtime } from 'foldkit'
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'

/** Actions exposed by one React host binding. */
export type ReactProgramActions = object

/** A React host binding over one Foldkit Program. */
export type ReactProgramBindings<
  Model,
  Actions extends ReactProgramActions,
> = Readonly<{
  Provider: ({
    children,
    fallback,
  }: Readonly<{
    children: ReactNode
    fallback?: ReactNode
  }>) => ReactElement | null
  useActions: () => Actions
  useModel: () => Model
}>

/** A React host binding whose Provider initializes a Program with typed flags. */
export type ReactProgramBindingsWithFlags<
  Model,
  Actions extends ReactProgramActions,
  Flags,
> = Readonly<{
  Provider: ({
    children,
    fallback,
    flags,
  }: Readonly<{
    children: ReactNode
    fallback?: ReactNode
    flags: Flags
  }>) => ReactElement | null
  useActions: () => Actions
  useModel: () => Model
}>

type ReactProgramStore<Model, Actions extends ReactProgramActions> = Readonly<{
  actions: Actions
  readModel: () => Model
  subscribe: (listener: () => void) => () => void
}>

type RunningProgram<Model, Message> = Readonly<{
  runtime: Runtime.ProgramRuntime<Model, Message>
  scope: Scope.Closeable
}>

/** Configuration for creating React bindings over one Foldkit Program. */
export type ReactProgramConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Resources = never,
> = Readonly<{
  createActions: (
    send: Runtime.ProgramRuntime<Model, Message>['send'],
  ) => Actions
  name: string
  program: Program.Program<Model, Message, Resources>
  resources: Layer.Layer<Resources>
  journal?: Runtime.ProgramRuntimeJournalConfig<Model, Message>
}>

/** Configuration for React bindings initialized with typed flags. */
export type ReactProgramConfigWithFlags<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
> = ReactProgramConfig<Model, Message, Actions, Resources> &
  Readonly<{
    start: (flags: Flags) => Runtime.ProgramStart<Model, Message>
  }>

/** One Program definition produced from typed React Provider flags. */
export type ReactProgramDefinition<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
> = Readonly<{
  program: Program.Program<Model, Message, Resources>
  resources: Layer.Layer<Resources>
  journal?: Runtime.ProgramRuntimeJournalConfig<Model, Message>
  start?: Runtime.ProgramStart<Model, Message>
}>

/** Configuration for React bindings whose Program is created from flags. */
export type ReactProgramFactoryConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
> = Readonly<{
  createActions: (
    send: Runtime.ProgramRuntime<Model, Message>['send'],
  ) => Actions
  makeProgram: (
    flags: Flags,
  ) => ReactProgramDefinition<Model, Message, Resources>
  name: string
}>

const startProgram = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
>(
  config: ReactProgramConfig<Model, Message, ReactProgramActions, Resources>,
  start?: Runtime.ProgramStart<Model, Message>,
): RunningProgram<Model, Message> =>
  Effect.runSync(
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const runtime = yield* Effect.provideService(
        Runtime.makeProgramRuntime({
          program: config.program,
          resources: config.resources,
          ...(start === undefined ? {} : { start }),
          ...(config.journal === undefined ? {} : { journal: config.journal }),
        }).pipe(Effect.orDie),
        Scope.Scope,
        scope,
      )
      return { runtime, scope }
    }),
  )

const closeProgram = <Model, Message>({
  scope,
}: RunningProgram<Model, Message>) =>
  Effect.runFork(Scope.close(scope, Exit.void))

const makeProgramStore = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
>(
  runtime: Runtime.ProgramRuntime<Model, Message>,
  createActions: ReactProgramConfig<Model, Message, Actions>['createActions'],
): ReactProgramStore<Model, Actions> => ({
  actions: createActions(runtime.send),
  readModel: runtime.readModel,
  subscribe: listener => runtime.observeModel(() => listener()),
})

type ProgramProviderProps = Readonly<{
  children: ReactNode
  fallback?: ReactNode
}>

const createBindings = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Resources,
  ProviderProps extends ProgramProviderProps,
>(
  config: Pick<
    ReactProgramConfig<Model, Message, Actions, Resources>,
    'createActions' | 'name'
  >,
  definitionForProps: (
    props: ProviderProps,
  ) => ReactProgramDefinition<Model, Message, Resources>,
): Readonly<{
  Provider: (props: ProviderProps) => ReactElement | null
  useActions: () => Actions
  useModel: () => Model
}> => {
  const ProgramContext = createContext<ReactProgramStore<
    Model,
    Actions
  > | null>(null)

  const useProgramStore = (): ReactProgramStore<Model, Actions> => {
    const store = useContext(ProgramContext)
    if (store === null) {
      throw new Error(
        `${config.name} hooks must be used inside ${config.name}Provider`,
      )
    }
    return store
  }

  const Provider = (props: ProviderProps): ReactElement | null => {
    const [definition] = useState(() => definitionForProps(props))
    const [store, setStore] = useState<ReactProgramStore<
      Model,
      Actions
    > | null>(null)

    useEffect(() => {
      const runningProgram = startProgram(
        { ...config, ...definition },
        definition.start,
      )
      const nextStore = makeProgramStore(
        runningProgram.runtime,
        config.createActions,
      )
      setStore(nextStore)

      return () => {
        closeProgram(runningProgram)
      }
    }, [])

    if (store === null) {
      return <>{props.fallback ?? null}</>
    }

    return (
      <ProgramContext.Provider value={store}>
        {props.children}
      </ProgramContext.Provider>
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

  return { Provider, useActions, useModel }
}

/** Creates domain-shaped React hooks and Provider for one Foldkit Program. */
export const createReactProgramBindings = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Resources = never,
>(
  config: ReactProgramConfig<Model, Message, Actions, Resources>,
): ReactProgramBindings<Model, Actions> =>
  createBindings(config, () => ({
    program: config.program,
    resources: config.resources,
  }))

/** Creates domain-shaped React hooks whose Provider accepts typed flags. */
export const createReactProgramBindingsWithFlags = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
>(
  config: ReactProgramConfigWithFlags<
    Model,
    Message,
    Actions,
    Flags,
    Resources
  >,
): ReactProgramBindingsWithFlags<Model, Actions, Flags> =>
  createBindings(config, ({ flags }) => ({
    program: config.program,
    resources: config.resources,
    start: config.start(flags),
  }))

/** Creates React bindings whose Program definition is derived from flags. */
export const createReactProgramBindingsFromFlags = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Actions extends ReactProgramActions,
  Flags,
  Resources = never,
>(
  config: ReactProgramFactoryConfig<Model, Message, Actions, Flags, Resources>,
): ReactProgramBindingsWithFlags<Model, Actions, Flags> =>
  createBindings(config, ({ flags }) => config.makeProgram(flags))
