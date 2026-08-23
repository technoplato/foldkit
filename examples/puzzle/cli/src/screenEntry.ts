#!/usr/bin/env node
/**
 * Puzzle screen-window CLI view.
 *
 * Instant and file tapes talk to the same Foldkit CLI daemon as
 * `puzzle`. This file must not import Effect, foldkit, Instant, or
 * the Program. Memory tape loads the in-process host on demand.
 *
 *   puzzle-screen
 *   puzzle-screen reset
 *   puzzle-screen yes
 */
import {
  cliDaemonSocketPath,
  runCliView,
  spawnCliViewDaemon,
  writeCliViewResult,
} from 'foldkit/cli/view'
import { fileURLToPath } from 'node:url'

import {
  isPuzzleCliMemory,
  puzzleCliIsolationKey,
  puzzleCliProgramId,
} from './isolation.js'
import { parseScreenArgv } from './parseArgv.js'

const daemonScriptPath = fileURLToPath(new URL('./daemon.js', import.meta.url))

const socketPath = (): string =>
  cliDaemonSocketPath({
    programId: puzzleCliProgramId,
    isolationKey: puzzleCliIsolationKey(),
  })

const spawnDaemon = () => spawnCliViewDaemon({ scriptPath: daemonScriptPath })

const writeFailed = (message: string, exitCode: number): void => {
  writeCliViewResult({ stdout: '', stderr: message, exitCode })
}

const runDaemonView = async (): Promise<void> => {
  const parsed = parseScreenArgv(process.argv.slice(2))
  if (parsed._tag === 'Failed') {
    writeFailed(parsed.message, parsed.exitCode)
    return
  }
  const flags = { view: 'screen' }
  const request =
    parsed._tag === 'Show'
      ? { _tag: 'Show' as const, flags }
      : { _tag: 'Do' as const, token: parsed.token, flags }
  try {
    const painted = await runCliView({
      socketPath: socketPath(),
      spawn: spawnDaemon,
      request,
    })
    writeCliViewResult(painted)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'CLI view failed.'
    writeFailed(message, 1)
  }
}

const argv = process.argv.slice(2)
if (isPuzzleCliMemory()) {
  const { runInProcessScreen } = await import('./inProcess.js')
  runInProcessScreen(argv)
} else {
  await runDaemonView()
}
