import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'

import { BuildDetail, Index } from './data'
import { Destination } from './route'

// MODEL

/** The exporter's index: loading, loaded, refreshing, or failed with why. */
export const IndexData = AsyncData.Schema(Index, S.String)

/** One build's own file, loaded when its page opens. */
export const BuildDetailData = AsyncData.Schema(BuildDetail, S.String)

/** The build page that is open, and its file as it loads. */
export const OpenBuild = S.Struct({
  appId: S.String,
  build: S.String,
  detail: BuildDetailData.schema,
})
export type OpenBuild = typeof OpenBuild.Type

/** The build a pointer rests on in one chart, which draws its crosshair and readout. */
export const Hover = S.Struct({ metricId: S.String, build: S.String })
export type Hover = typeof Hover.Type

export const Model = S.Struct({
  destination: Destination,
  index: IndexData.schema,
  maybeOpenBuild: S.Option(OpenBuild),
  maybeHover: S.Option(Hover),
})
export type Model = typeof Model.Type
