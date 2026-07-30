import { Context, Data, Effect, Stream } from 'effect'

import { ProductCatalogEntry } from './domain.js'

/** A product catalog transport failed to observe or persist its data. */
export class ProductCatalogError extends Data.TaggedError(
  'ProductCatalogError',
)<{
  readonly cause: unknown
  readonly operation: 'Fetch' | 'Observe' | 'Save'
}> {}

/** The side-effecting catalog of Applications and Libraries that own Issues. */
export type ProductCatalogService = Readonly<{
  fetch: Effect.Effect<ReadonlyArray<ProductCatalogEntry>, ProductCatalogError>
  observe: Stream.Stream<
    ReadonlyArray<ProductCatalogEntry>,
    ProductCatalogError
  >
  save: (entry: ProductCatalogEntry) => Effect.Effect<void, ProductCatalogError>
}>

/** An injected product catalog whose implementation is selected by the host. */
export class ProductCatalog extends Context.Service<
  ProductCatalog,
  ProductCatalogService
>()('@foldkit/instant-tools/ProductCatalog') {}
