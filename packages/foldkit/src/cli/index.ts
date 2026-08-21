export {
  CliDaemonDo,
  CliDaemonFailed,
  CliDaemonFlags,
  CliDaemonPainted,
  CliDaemonRead,
  CliDaemonShow,
  CliDaemonError,
  cliDaemonProtocolVersion,
  cliDaemonReadyTimeoutMs,
  makeCliDaemonOk,
  makeCliDaemonRequest,
  makeCliDaemonResponse,
  makeCliDaemonRun,
} from './protocol.js'
export type { CliDaemonDo as CliDaemonDoType } from './protocol.js'
export type { CliDaemonFailed as CliDaemonFailedType } from './protocol.js'
export type { CliDaemonFlags as CliDaemonFlagsType } from './protocol.js'
export type { CliDaemonPainted as CliDaemonPaintedType } from './protocol.js'
export type { CliDaemonPaintedResult } from './protocol.js'
export type { CliDaemonRead as CliDaemonReadType } from './protocol.js'
export type { CliDaemonShow as CliDaemonShowType } from './protocol.js'
export type { CliDaemonSurface } from './protocol.js'

export {
  cliDaemonLockPath,
  cliDaemonPidPath,
  cliDaemonSocketPath,
  removeCliDaemonFiles,
  removeCliDaemonSocketAndPid,
  tryAcquireCliDaemonLock,
  writeCliDaemonPid,
} from './paths.js'

export { listenCliDaemon, startCliDaemonServer } from './listen.js'

export {
  askCliDaemon,
  ensureCliDaemon,
  isCliDaemonListening,
  spawnCliDaemon,
  stopCliDaemon,
} from './client.js'
