import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

export const ClickedOpenProjects = m('ClickedOpenProjects')
export const ClickedOpenChats = m('ClickedOpenChats')
export const ClickedOpenProject = m('ClickedOpenProject', {
  projectId: S.String,
})
export const ClickedOpenConversation = m('ClickedOpenConversation', {
  conversationId: S.String,
})
export const ClickedGoBack = m('ClickedGoBack')
export const ClickedOpenSettings = m('ClickedOpenSettings')
export const ClickedFollow = m('ClickedFollow', {
  conversationId: S.String,
})
export const ClickedStopFollow = m('ClickedStopFollow')
export const ClickedDeleteConversation = m('ClickedDeleteConversation', {
  conversationId: S.String,
})
export const ClickedIngest = m('ClickedIngest')
export const Ingested = m('Ingested', {
  conversationId: S.String,
  now: S.Number,
})

export const Message = S.Union([
  ClickedOpenProjects,
  ClickedOpenChats,
  ClickedOpenProject,
  ClickedOpenConversation,
  ClickedGoBack,
  ClickedOpenSettings,
  ClickedFollow,
  ClickedStopFollow,
  ClickedDeleteConversation,
  ClickedIngest,
  Ingested,
])
export type Message = typeof Message.Type
