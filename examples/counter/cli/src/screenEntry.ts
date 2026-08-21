#!/usr/bin/env node
/**
 * Counter screen-window CLI view.
 *
 * Instant and file tapes talk to the same Foldkit CLI daemon as
 * `counter`. This file must not import Effect, foldkit, Instant, or
 * the Program. Memory tape loads the in-process host on demand.
 *
 *   counter-screen
 *   counter-screen increment
 *   counter-screen reset
 */
import {
  cliDaemonSocketPath,
  runCliView,
  spawnCliViewDaemon,
  writeCliViewResult,
} from 'foldkit/cli/view'
import { fileURLToPath } from 'node:url'

import {
  counterCliIsolationKey,
  counterCliProgramId,
  isCounterCliMemory,
} from './isolation.js'
import { parseScreenArgv } from './parseArgv.js'

const daemonScriptPath = fileURLToPath(new URL('./daemon.js', import.meta.url))

const socketPath = (): string =>
  cliDaemonSocketPath({
    programId: counterCliProgramId,
    isolationKey: counterCliIsolationKey(),
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
if (isCounterCliMemory()) {
  const { runInProcessScreen } = await import('./inProcess.js')
  runInProcessScreen(argv)
} else {
  await runDaemonView()
}
