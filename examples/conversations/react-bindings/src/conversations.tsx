import {
  ClickedDeleteConversation,
  ClickedFollow,
  ClickedGoBack,
  ClickedIngest,
  ClickedJumpTo,
  ClickedOpenChats,
  ClickedOpenConversation,
  ClickedOpenIdentifier,
  ClickedOpenProject,
  ClickedOpenProjects,
  ClickedOpenSettings,
  ClickedStopFollow,
  ConversationsProgram,
  type Identifier,
  Message,
  Model,
  UpdatedFindQuery,
  initialModel,
} from 'conversations-core-example'
import { Layer } from 'effect'
import { Program } from 'foldkit'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

export type ConversationsActions = Readonly<{
  clickedOpenProjects: () => void
  clickedOpenChats: () => void
  clickedOpenProject: (projectId: string) => void
  clickedOpenConversation: (conversationId: string) => void
  clickedOpenIdentifier: (identifier: Identifier) => void
  clickedGoBack: () => void
  clickedOpenSettings: () => void
  clickedFollow: (conversationId: string) => void
  clickedStopFollow: () => void
  clickedDeleteConversation: (conversationId: string) => void
  updatedFindQuery: (query: string) => void
  clickedJumpTo: (messageId: string) => void
  clickedIngest: () => void
}>

export type ConversationsInitialRoute = Program.ResolvedProgramRoute<
  Model,
  Message
>

export const initialConversationsRoute: ConversationsInitialRoute =
  Program.state(initialModel)

export const ConversationsClient = createReplayableReactProgramClient<
  Model,
  Message,
  ConversationsActions,
  ConversationsInitialRoute
>({
  createActions: enqueueMessage => ({
    clickedOpenProjects: () => enqueueMessage(ClickedOpenProjects()),
    clickedOpenChats: () => enqueueMessage(ClickedOpenChats()),
    clickedOpenProject: projectId =>
      enqueueMessage(ClickedOpenProject({ projectId })),
    clickedOpenConversation: conversationId =>
      enqueueMessage(ClickedOpenConversation({ conversationId })),
    clickedOpenIdentifier: identifier =>
      enqueueMessage(ClickedOpenIdentifier({ identifier })),
    clickedGoBack: () => enqueueMessage(ClickedGoBack()),
    clickedOpenSettings: () => enqueueMessage(ClickedOpenSettings()),
    clickedFollow: conversationId =>
      enqueueMessage(ClickedFollow({ conversationId })),
    clickedStopFollow: () => enqueueMessage(ClickedStopFollow()),
    clickedDeleteConversation: conversationId =>
      enqueueMessage(ClickedDeleteConversation({ conversationId })),
    updatedFindQuery: query => enqueueMessage(UpdatedFindQuery({ query })),
    clickedJumpTo: messageId => enqueueMessage(ClickedJumpTo({ messageId })),
    clickedIngest: () => enqueueMessage(ClickedIngest()),
  }),
  name: 'Conversations',
  program: ConversationsProgram,
  resources: Layer.empty,
  route: initialRoute => initialRoute,
})

export const ConversationsProvider = ({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) => (
  <ConversationsClient.Provider
    initialRoute={initialConversationsRoute}
    fallback={fallback}
  >
    {children}
  </ConversationsClient.Provider>
)

export function useConversationsModel(): Model
export function useConversationsModel<Selected>(options: {
  readonly selector: (model: Model) => Selected
}): Selected
export function useConversationsModel<Selected = Model>(
  options?: Readonly<{ selector?: (model: Model) => Selected }>,
): Selected {
  const model = ConversationsClient.useModel()
  if (options?.selector === undefined) {
    return model as Selected
  }
  return options.selector(model)
}

export const useConversationsActions = ConversationsClient.useActions
export const useConversationsReplay = ConversationsClient.useReplay
