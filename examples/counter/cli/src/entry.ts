#!/usr/bin/env node
/**
 * The Counter CLI. Every command comes from the Counter's Catalog and
 * the controls every Program's terminal has, through the generic Foldkit
 * CLI surface. `counter help` prints them, each line derived from its
 * declaration, so no list of commands is kept here.
 *
 * This file must not import Effect, Instant, or the Program, so the view
 * starts fast. Memory and File tapes run in this process.
 */
import {
  cliDaemonSocketPath,
  cliViewFailed,
  followArgvOf,
  parseProgramArgv,
  runCliView,
  spawnCliViewDaemon,
  writeCliFollow,
  writeCliViewResult,
} from 'foldkit/cli/view'
import { fileURLToPath } from 'node:url'

import {
  counterCliIsolationKey,
  counterCliProgramId,
  counterCliTape,
} from './settings.js'

const request = parseProgramArgv(process.argv.slice(2))
const tape = counterCliTape()

if (request._tag === 'Tail') {
  const { runTail } = await import('./tail.js')
  await runTail()
} else if (request._tag === 'Watch') {
  const { runWatch } = await import('./watch.js')
  await runWatch(tape)
} else if (tape._tag === 'Instant') {
  const socketPath = cliDaemonSocketPath({
    programId: counterCliProgramId,
    isolationKey: counterCliIsolationKey,
  })
  const spawn = () =>
    spawnCliViewDaemon({
      scriptPath: fileURLToPath(new URL('./daemon.js', import.meta.url)),
    })
  const maybeFollow = followArgvOf(process.argv.slice(2))
  if (maybeFollow !== undefined) {
    await writeCliFollow({ socketPath, spawn, request: maybeFollow })
  } else {
    try {
      writeCliViewResult(await runCliView({ socketPath, spawn, request }))
    } catch (cause) {
      writeCliViewResult(cliViewFailed(cause))
    }
  }
} else {
  const { runInProcess } = await import('./inProcess.js')
  await runInProcess(
    tape,
    request._tag === 'Show' ? [] : request.token.split(' '),
    request.flags,
  )
}
