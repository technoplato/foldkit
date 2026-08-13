import { type Layer } from "effect"
import { Program } from "foldkit"
import {
  ClickedIdea,
  ClosedIdea,
  IdeasProgram,
  type IdeasStore,
  type Message,
  type Model,
  StaticIdeasResources,
  UpdatedQuery,
  init,
} from "ideas-core-example"
import type { ReactNode } from "react"
import { createReplayableReactProgramClient } from "shared-react-bindings-example"

/** Actions exposed to React and React Native consumers of the Ideas Program. */
export type IdeasActions = Readonly<{
  clickedIdea: (id: string) => void
  closedIdea: () => void
  updatedQuery: (query: string) => void
}>

/** One portable state route accepted by the Ideas client. */
export type IdeasInitialRoute = Program.ResolvedProgramRoute<Model, Message>

/** The canonical fresh Ideas route shared by host carriers. */
const [initialModel] = init()
export const initialIdeasRoute: IdeasInitialRoute = Program.state(initialModel)

/** Creates a React Client over host-selected live or deterministic resources. */
export const makeIdeasReactClient = (resources: Layer.Layer<IdeasStore>) =>
  createReplayableReactProgramClient<
    Model,
    Message,
    IdeasActions,
    IdeasInitialRoute,
    IdeasStore
  >({
    createActions: enqueueMessage => ({
      clickedIdea: id => enqueueMessage(ClickedIdea.make({ id })),
      closedIdea: () => enqueueMessage(ClosedIdea.make({})),
      updatedQuery: query => enqueueMessage(UpdatedQuery.make({ query })),
    }),
    name: "Ideas",
    program: IdeasProgram,
    resources,
    route: initialRoute => initialRoute,
  })

/** Deterministic Client used by tests and offline hosts. */
export const StaticIdeasClient = makeIdeasReactClient(StaticIdeasResources)

/** Provides one static Ideas runtime to React children. */
export const IdeasProvider = ({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) => (
  <StaticIdeasClient.Provider
    initialRoute={initialIdeasRoute}
    fallback={fallback}
  >
    {children}
  </StaticIdeasClient.Provider>
)

/** Reads the current immutable Ideas Model. */
export const useIdeasModel = StaticIdeasClient.useModel

/** Returns stable Ideas actions. */
export const useIdeasActions = StaticIdeasClient.useActions
