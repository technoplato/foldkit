import { Context, Data, Effect } from 'effect'

import type { Fact } from './model.js'

/** A Fact request failed before it could produce a decoded Fact. */
export class FactClientError extends Data.TaggedError('FactClientError')<{
  readonly cause: unknown
}> {}

/** The side-effecting capability required by the Fact Program. */
export type FactClientService = Readonly<{
  fetch: Effect.Effect<Fact, FactClientError>
}>

/** An injected Fact source whose implementation is selected by the host. */
export class FactClient extends Context.Service<
  FactClient,
  FactClientService
>()('Fact/FactClient') {}
