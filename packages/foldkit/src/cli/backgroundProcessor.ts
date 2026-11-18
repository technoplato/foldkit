/**
 * The Background Processor: one long-lived Processor, a running synced
 * Program, held by a process a CLI starts on its first command and talks
 * to after that. It is what a CLI uses for anything that has to go on
 * after a command returns, such as audio that keeps playing, and for
 * anything that stays in sync, since the Program and its sync engine
 * connection stay warm in it. A command asks it (Show, Do, Read, Run),
 * follows it (Follow), or stops it.
 *
 * These are the names to use. Each is the function that was first spelled
 * `…CliDaemon…`; those spellings stay exported and are the same functions.
 *
 * @example
 * ```typescript
 * yield* listenBackgroundProcessor({
 *   socketPath: backgroundProcessorSocketPath({ programId: 'counter' }),
 *   Model: SyncedCounter.Model,
 *   Message: SyncedCounter.Message,
 *   surface: programCliSurface(bound, 'counter'),
 * })
 * ```
 */
export {
  askCliDaemon as askBackgroundProcessor,
  ensureCliDaemon as ensureBackgroundProcessor,
  isCliDaemonListening as isBackgroundProcessorListening,
  spawnCliDaemon as spawnBackgroundProcessor,
  stopCliDaemon as stopBackgroundProcessor,
} from './client.js'
export {
  listenCliDaemon as listenBackgroundProcessor,
  startCliDaemonServer as startBackgroundProcessorServer,
} from './listen.js'
export {
  cliDaemonLockPath as backgroundProcessorLockPath,
  cliDaemonPidPath as backgroundProcessorPidPath,
  cliDaemonSocketPath as backgroundProcessorSocketPath,
  removeCliDaemonFiles as removeBackgroundProcessorFiles,
} from './paths.js'
export { CliDaemonError as BackgroundProcessorError } from './protocol.js'
export type {
  CliDaemonFlags as BackgroundProcessorFlags,
  CliDaemonPaintedResult as BackgroundProcessorPainted,
  CliDaemonSurface as BackgroundProcessorSurface,
} from './protocol.js'
export type {
  CliFollowing as BackgroundProcessorFollowing,
  CliFollowings as BackgroundProcessorFollowings,
} from './surface.js'
