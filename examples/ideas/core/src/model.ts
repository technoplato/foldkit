import { Schema as S } from 'effect'

import { Idea } from './catalog.js'

/** Instant is the live source. StaticFallback is used when Instant is missing or unreachable. */
export const CatalogSource = S.Literals(['Instant', 'StaticFallback'])
/** Where the visible catalog came from. */
export type CatalogSource = typeof CatalogSource.Type

/** Waiting for the first catalog snapshot. */
export const LoadingCatalog = S.TaggedStruct('LoadingCatalog', {})
/** Latest catalog snapshot. */
export const LoadedCatalog = S.TaggedStruct('LoadedCatalog', {
  ideas: S.Array(Idea),
})
/** Catalog observation failed. */
export const FailedCatalog = S.TaggedStruct('FailedCatalog', {
  reason: S.String,
})
/** Every catalog observation state. */
export const CatalogState = S.Union([
  LoadingCatalog,
  LoadedCatalog,
  FailedCatalog,
])
/** Every catalog observation state. */
export type CatalogState = typeof CatalogState.Type

/** The Ideas Program Model. */
export const Model = S.Struct({
  catalog: CatalogState,
  query: S.String,
  selectedId: S.Option(S.String),
  source: CatalogSource,
})
/** An Ideas Model value. */
export type Model = typeof Model.Type
