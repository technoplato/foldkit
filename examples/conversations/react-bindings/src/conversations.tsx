import {
  ClickedDeleteConversation,
  ClickedFollow,
  ClickedGoBack,
  ClickedIngest,
  ClickedOpenChats,
  ClickedOpenConversation,
  ClickedOpenProject,
  ClickedOpenProjects,
  ClickedOpenSettings,
  ClickedStopFollow,
  ConversationsProgram,
  Message,
  Model,
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
  clickedGoBack: () => void
  clickedOpenSettings: () => void
  clickedFollow: (conversationId: string) => void
  clickedStopFollow: () => void
  clickedDeleteConversation: (conversationId: string) => void
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
    clickedGoBack: () => enqueueMessage(ClickedGoBack()),
    clickedOpenSettings: () => enqueueMessage(ClickedOpenSettings()),
    clickedFollow: conversationId =>
      enqueueMessage(ClickedFollow({ conversationId })),
    clickedStopFollow: () => enqueueMessage(ClickedStopFollow()),
    clickedDeleteConversation: conversationId =>
      enqueueMessage(ClickedDeleteConversation({ conversationId })),
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

export const useConversationsModel = ConversationsClient.useModel
export const useConversationsActions = ConversationsClient.useActions
export const useConversationsReplay = ConversationsClient.useReplay
