export {
  CliDaemonDo,
  CliDaemonError,
  CliDaemonFailed,
  CliDaemonFlags,
  CliDaemonFollow,
  CliDaemonFollowEnded,
  CliDaemonFollowed,
  CliDaemonPainted,
  CliDaemonRead,
  CliDaemonShow,
  askCliDaemon,
  cliDaemonLockPath,
  cliDaemonPidPath,
  cliDaemonProtocolVersion,
  cliDaemonReadyTimeoutMs,
  cliDaemonSocketPath,
  ensureCliDaemon,
  isCliDaemonListening,
  listenCliDaemon,
  makeCliDaemonOk,
  makeCliDaemonRequest,
  makeCliDaemonResponse,
  makeCliDaemonRun,
  removeCliDaemonFiles,
  spawnCliDaemon,
  startCliDaemonServer,
  stopCliDaemon,
} from './index.js'

export type { CliDaemonPaintedResult, CliDaemonSurface } from './index.js'

export {
  type HostCommand,
  paintCommands,
  paintOffered,
  paintProgram,
  paintScreen,
  programUsage,
  type ProgramCommandOptions,
  runProgramCommand,
  screenLinkLines,
} from './program.js'
export {
  type CliFollowing,
  type CliFollowings,
  type ProgramTerminalView,
  followTopicOf,
  isTerminalViewRequest,
  makeProgramTerminalView,
  programCliSurface,
  type FollowLiveOptions,
  type LivePart,
  followLive,
  programFollowings,
} from './surface.js'

export { keyInputOfTerminal, runProgramTui } from './tui.js'
export {
  type TerminalPaint,
  type TerminalPaintPhase,
  type TerminalPaintReporting,
  type TerminalScroll,
  type TerminalSize,
  type TerminalView,
  initialTerminalView,
  paintTerminal,
  terminalPainter,
} from './terminalScreen.js'
export { type WatchOptions, paintWatch, runProgramWatch } from './watch.js'
export { localSnapshotFile, localSnapshotPath } from './localSnapshotFile.js'
export { formatTailRow, runProgramTail } from './tail.js'
export { columnRow, terminalWidth, underColumn, wrapWords } from './layout.js'

export * from './backgroundProcessor.js'
