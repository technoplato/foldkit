#!/usr/bin/env node
/**
 * Puzzle one-shot CLI view.
 *
 * Instant and file tapes talk to the Foldkit CLI daemon. This file
 * must not import Effect, foldkit, Instant, or the Program. Memory
 * tape and replay load the in-process host on demand.
 *
 *   puzzle show
 *   puzzle show --device phone
 *   puzzle do yes
 *   puzzle replay --tape tape.json
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
import { parsePuzzleArgv, puzzleUsage } from './parseArgv.js'

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
  const parsed = parsePuzzleArgv(process.argv.slice(2))
  if (parsed._tag === 'Help') {
    writeCliViewResult({ stdout: puzzleUsage, stderr: '', exitCode: 0 })
    return
  }
  if (parsed._tag === 'Failed') {
    writeFailed(parsed.message, parsed.exitCode)
    return
  }
  if (parsed._tag === 'Replay') {
    const { runInProcessPuzzle } = await import('./inProcess.js')
    runInProcessPuzzle(process.argv.slice(2))
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
const parsed = parsePuzzleArgv(argv)
if (isPuzzleCliMemory() || parsed._tag === 'Replay') {
  const { runInProcessPuzzle } = await import('./inProcess.js')
  runInProcessPuzzle(argv)
} else {
  await runDaemonView()
}
