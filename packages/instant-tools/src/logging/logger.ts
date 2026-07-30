import { Context, Data, Effect } from 'effect'

import type { LogEvent } from './domain.js'

/** A structured Log Event could not be persisted by its configured transport. */
export class LoggerError extends Data.TaggedError('LoggerError')<{
  readonly cause: unknown
}> {}

/** The side-effecting capability required to append structured Log Events. */
export type LoggerService = Readonly<{
  append: (event: LogEvent) => Effect.Effect<void, LoggerError>
}>

/** An injected structured Logger whose implementation is selected by the host. */
export class Logger extends Context.Service<Logger, LoggerService>()(
  '@foldkit/instant-tools/Logger',
) {}
