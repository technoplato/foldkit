import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { BuildDetail, Index } from './data'

// MESSAGE

export const ClickedLink = m('ClickedLink', { request: UrlRequest })
export const ChangedUrl = m('ChangedUrl', { url: Url })
export const CompletedNavigateInternal = m('CompletedNavigateInternal')
export const CompletedLoadExternal = m('CompletedLoadExternal')
export const SucceededFetchIndex = m('SucceededFetchIndex', { index: Index })
export const FailedFetchIndex = m('FailedFetchIndex', { error: S.String })
export const SucceededFetchBuild = m('SucceededFetchBuild', {
  appId: S.String,
  build: S.String,
  detail: BuildDetail,
})
export const FailedFetchBuild = m('FailedFetchBuild', {
  appId: S.String,
  build: S.String,
  error: S.String,
})
export const ClickedReload = m('ClickedReload')
export const HoveredChartColumn = m('HoveredChartColumn', {
  metricId: S.String,
  build: S.String,
})
export const LeftChart = m('LeftChart', { metricId: S.String })
export const ClickedChartColumn = m('ClickedChartColumn', {
  appId: S.String,
  build: S.String,
})

export const Message = S.Union([
  ClickedLink,
  ChangedUrl,
  CompletedNavigateInternal,
  CompletedLoadExternal,
  SucceededFetchIndex,
  FailedFetchIndex,
  SucceededFetchBuild,
  FailedFetchBuild,
  ClickedReload,
  HoveredChartColumn,
  LeftChart,
  ClickedChartColumn,
])
export type Message = typeof Message.Type
