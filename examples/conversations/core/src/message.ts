import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { Identifier } from './model.js'

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
export const ClickedOpenIdentifier = m('ClickedOpenIdentifier', {
  identifier: Identifier,
})
export const UpdatedFindQuery = m('UpdatedFindQuery', {
  query: S.String,
})
export const ClickedJumpTo = m('ClickedJumpTo', {
  messageId: S.String,
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
  ClickedOpenIdentifier,
  ClickedGoBack,
  ClickedOpenSettings,
  ClickedFollow,
  ClickedStopFollow,
  ClickedDeleteConversation,
  UpdatedFindQuery,
  ClickedJumpTo,
  ClickedIngest,
  Ingested,
])
export type Message = typeof Message.Type
