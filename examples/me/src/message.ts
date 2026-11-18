import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { Me, Understanding } from './data'

// MESSAGE

export const ClickedLink = m('ClickedLink', { request: UrlRequest })
export const ChangedUrl = m('ChangedUrl', { url: Url })
export const CompletedNavigateInternal = m('CompletedNavigateInternal')
export const CompletedLoadExternal = m('CompletedLoadExternal')
export const SucceededFetchMe = m('SucceededFetchMe', { me: Me })
export const FailedFetchMe = m('FailedFetchMe', { error: S.String })
export const SucceededFetchUnderstanding = m('SucceededFetchUnderstanding', {
  understanding: Understanding,
})
export const FailedFetchUnderstanding = m('FailedFetchUnderstanding', {
  error: S.String,
})
export const ClickedReload = m('ClickedReload')

export const Message = S.Union([
  ClickedLink,
  ChangedUrl,
  CompletedNavigateInternal,
  CompletedLoadExternal,
  SucceededFetchMe,
  FailedFetchMe,
  SucceededFetchUnderstanding,
  FailedFetchUnderstanding,
  ClickedReload,
])
export type Message = typeof Message.Type
