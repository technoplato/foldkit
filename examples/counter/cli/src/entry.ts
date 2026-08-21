#!/usr/bin/env node
/**
 * Counter one-shot CLI view.
 *
 * Instant and file tapes talk to the Foldkit CLI daemon. This file
 * must not import Effect, foldkit, Instant, or the Program. Memory
 * tape and replay load the in-process host on demand.
 *
 *   counter show
 *   counter show --device phone
 *   counter do increment
 *   counter replay --tape tape.json
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
import { counterUsage, parseCounterArgv } from './parseArgv.js'

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
  const parsed = parseCounterArgv(process.argv.slice(2))
  if (parsed._tag === 'Help') {
    writeCliViewResult({ stdout: counterUsage, stderr: '', exitCode: 0 })
    return
  }
  if (parsed._tag === 'Failed') {
    writeFailed(parsed.message, parsed.exitCode)
    return
  }
  if (parsed._tag === 'Replay') {
    const { runInProcessCounter } = await import('./inProcess.js')
    runInProcessCounter(process.argv.slice(2))
    return
  }
  const flags =
    parsed._tag === 'Show'
      ? {
          ...(parsed.device === undefined ? {} : { device: parsed.device }),
          ...(parsed.path === undefined ? {} : { path: parsed.path }),
        }
      : {}
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
const parsed = parseCounterArgv(argv)
if (isCounterCliMemory() || parsed._tag === 'Replay') {
  const { runInProcessCounter } = await import('./inProcess.js')
  runInProcessCounter(argv)
} else {
  await runDaemonView()
}
