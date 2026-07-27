import { Layer } from 'effect'
import {
  ClickedLoadFact,
  FactClient,
  FactProgram,
  type Message,
  type Model,
} from 'fact-core-example'
import type {
  ProgramRuntimeStartError,
  ProgramStart,
} from 'foldkit/program-runtime'
import {
  type DependencyChoice,
  type DependencyLifecycle,
  type DependencyStartupError,
  type ReactProgramLifecycle,
  createReactProgramClientWithDependency,
} from 'shared-react-bindings-example'

/** The named FactClient implementations exposed by the React composition root. */
export type FactClientImplementation = 'Mock' | 'Live'

/** One portable startup instruction accepted by the Fact React Provider. */
export type FactInitialRoute = ProgramStart<Model, Message>

/** Platform composition accepted by the Fact React client. */
export type FactReactClientConfig = Readonly<{
  dependency: DependencyChoice<FactClientImplementation, FactClient>
  onDependencyLifecycleChanged?: (
    lifecycle: DependencyLifecycle<FactClientImplementation>,
  ) => void
  onLifecycleChanged?: (
    lifecycle: ReactProgramLifecycle<
      ProgramRuntimeStartError | DependencyStartupError
    >,
  ) => void
}>

/** Creates domain-shaped React hooks over the canonical Fact Program. */
export const makeFactReactClient = (config: FactReactClientConfig) => {
  const client = createReactProgramClientWithDependency({
    createActions: enqueueMessage => ({
      clickedLoadFact: () => enqueueMessage(ClickedLoadFact()),
    }),
    dependency: config.dependency,
    name: 'Fact',
    ...(config.onDependencyLifecycleChanged === undefined
      ? {}
      : {
          onDependencyLifecycleChanged: config.onDependencyLifecycleChanged,
        }),
    ...(config.onLifecycleChanged === undefined
      ? {}
      : { onLifecycleChanged: config.onLifecycleChanged }),
    program: FactProgram,
    resources: Layer.empty,
    start: (initialRoute: FactInitialRoute) => initialRoute,
  })

  return {
    Provider: client.Provider,
    useDependency: client.useDependency,
    useFactActions: client.useActions,
    useFactLifecycle: client.useLifecycle,
    useFactModel: client.useModel,
  }
}
