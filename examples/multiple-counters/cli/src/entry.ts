#!/usr/bin/env node
/**
 * The Multiple Counters CLI. Every command comes from the Program and
 * the controls every Program's terminal has, through the generic Foldkit
 * CLI surface, so this file names no counter, Action, or route.
 * `counters help` prints them, each line derived from its declaration.
 *
 * The counters live on the one Instant project, shared with every other
 * window; run it through `with-counter-v01-env` for the admin token. The
 * first command starts the Counters' Background Processor, which keeps
 * the Program and its sync connection warm, so later commands answer at
 * once and a follow hears every change. This file must not import
 * Effect, Instant, or the Program, so a command starts fast.
 */
import {
  backgroundProcessorSocketPath,
  cliViewFailed,
  followArgvOf,
  parseProgramArgv,
  runCliView,
  spawnBackgroundProcessorFromView,
  writeCliFollow,
  writeCliViewResult,
} from 'foldkit/cli/view'
import { fileURLToPath } from 'node:url'

import { countersProgramId } from './settings.js'

const argv = process.argv.slice(2)

const request = parseProgramArgv(argv)

const maybeFollow = followArgvOf(argv)

const socketPath = backgroundProcessorSocketPath({
  programId: countersProgramId,
})

const spawn = () =>
  spawnBackgroundProcessorFromView({
    scriptPath: fileURLToPath(new URL('./daemon.js', import.meta.url)),
  })

if (request._tag === 'Tail') {
  const { runTail } = await import('./inProcess.js')
  await runTail()
} else if (request._tag === 'Watch') {
  const { runWatch } = await import('./inProcess.js')
  await runWatch()
} else if (maybeFollow !== undefined) {
  await writeCliFollow({ socketPath, spawn, request: maybeFollow })
} else {
  try {
    writeCliViewResult(await runCliView({ socketPath, spawn, request }))
  } catch (cause) {
    writeCliViewResult(cliViewFailed(cause))
  }
}
