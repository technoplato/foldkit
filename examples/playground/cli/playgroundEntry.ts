#!/usr/bin/env node
/**
 * The `playground` command. Every command comes from the Playground Catalog
 * and the controls every Foldkit Program's terminal has, through the generic
 * Foldkit CLI surface. `playground help` prints them, each line derived from
 * its declaration, so no list of commands is kept here.
 *
 * This file must not import Effect, Instant, or the Program, so commands
 * start fast (~30ms) against the warm Background Processor.
 */
import {
  type CliViewRequest,
  backgroundProcessorSocketPath,
  cliDaemonPidPath,
  cliViewFailed,
  followArgvOf,
  parseProgramArgv,
  removeCliDaemonFiles,
  runCliView,
  spawnBackgroundProcessorFromView,
  writeCliFollow,
  writeCliViewResult,
} from 'foldkit/cli/view'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const playgroundProgramId = 'foldkit-playground'
const playgroundIsolationKey = 'instant'

const rawArgs = process.argv.slice(2)
const isStop = rawArgs.length === 1 && rawArgs.includes('stop')

const socketPath = backgroundProcessorSocketPath({
  programId: playgroundProgramId,
  isolationKey: playgroundIsolationKey,
})

if (isStop) {
  try {
    const pidText = readFileSync(cliDaemonPidPath(socketPath), 'utf8').trim()
    const pid = Number(pidText)
    if (Number.isFinite(pid) && pid > 0) {
      process.kill(pid, 'SIGTERM')
    }
  } catch {
    // Background Processor is already stopped.
  }
  try {
    removeCliDaemonFiles(socketPath)
  } catch {
    // Daemon finalizer already removed socket files.
  }
  writeCliViewResult({
    stdout: 'Stopped playground Background Processor.',
    stderr: '',
    exitCode: 0,
  })
} else if (process.env['PLAYGROUND_TAPE'] === 'memory') {
  const request = parseProgramArgv(rawArgs)
  const modulePath = './playgroundInProcess.js'
  const mod: {
    readonly runPlaygroundInProcess: (
      words: ReadonlyArray<string>,
      flags: Readonly<Record<string, string>>,
    ) => Promise<void>
  } = await import(/* @vite-ignore */ modulePath)
  await mod.runPlaygroundInProcess(
    request._tag === 'Show'
      ? []
      : request._tag === 'Do'
        ? request.token.split(' ')
        : ['show'],
    request.flags,
  )
} else {
  const spawn = () =>
    spawnBackgroundProcessorFromView({
      scriptPath: fileURLToPath(
        new URL('./playgroundDaemon.js', import.meta.url),
      ),
    })
  const maybeFollow = followArgvOf(rawArgs)
  if (maybeFollow !== undefined) {
    await writeCliFollow({ socketPath, spawn, request: maybeFollow })
  } else {
    const parsed = parseProgramArgv(rawArgs)
    const request: CliViewRequest =
      parsed._tag === 'Show' || parsed._tag === 'Do'
        ? parsed
        : { _tag: 'Show', flags: parsed.flags }
    try {
      writeCliViewResult(await runCliView({ socketPath, spawn, request }))
    } catch (cause) {
      writeCliViewResult(cliViewFailed(cause))
    }
  }
}
