import { Layer } from 'effect'
import {
  ClickedLoadFact,
  FactClient,
  FactProgram,
  type Message,
  type Model,
  initialModel,
} from 'fact-core-example'
import { Program } from 'foldkit'
import type {
  ProgramRuntimeStartError,
  ReplayFrameError,
} from 'foldkit/program-runtime'
import {
  type DependencySet,
  type DependencyStartupError,
  type ReactProgramLifecycle,
  createReplayableReactProgramClientWithDependencies,
} from 'shared-react-bindings-example'

/** The named FactClient implementations exposed by the React composition root. */
export type FactClientImplementation = 'Mock' | 'Live'

/** One portable startup instruction accepted by the Fact React Provider. */
export type FactInitialRoute = Program.ResolvedProgramRoute<Model, Message>

/** Platform composition accepted by the Fact React client. */
export type FactReactClientConfig<DependencyServices, DependencyChoices> =
  Readonly<{
    dependencies: DependencySet<
      FactClient | DependencyServices,
      DependencyChoices
    >
    onLifecycleChanged?: (
      lifecycle: ReactProgramLifecycle<
        ProgramRuntimeStartError | ReplayFrameError | DependencyStartupError
      >,
    ) => void
  }>

/** Creates domain-shaped React hooks over the canonical Fact Program. */
export const makeFactReactClient = <DependencyServices, DependencyChoices>(
  config: FactReactClientConfig<DependencyServices, DependencyChoices>,
) => {
  const client = createReplayableReactProgramClientWithDependencies({
    createActions: enqueueMessage => ({
      clickedLoadFact: () => enqueueMessage(ClickedLoadFact()),
    }),
    dependencies: config.dependencies,
    name: 'Fact',
    ...(config.onLifecycleChanged === undefined
      ? {}
      : { onLifecycleChanged: config.onLifecycleChanged }),
    program: FactProgram,
    resources: Layer.empty,
    route: (initialRoute: FactInitialRoute) => initialRoute,
  })

  return {
    Provider: client.Provider,
    useDependency: client.useDependency,
    useFactActions: client.useActions,
    useFactLifecycle: client.useLifecycle,
    useFactModel: client.useModel,
    useFactReplay: client.useReplay,
  }
}

/** The canonical fresh Fact route for React and React Native clients. */
export const initialFactRoute: FactInitialRoute = Program.state(initialModel)
