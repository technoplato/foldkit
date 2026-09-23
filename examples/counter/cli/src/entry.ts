#!/usr/bin/env node
/**
 * The Counter CLI. Every command comes from the Counter's Catalog through
 * the generic Foldkit CLI surface:
 *
 *   counter                 paint the count and its Actions
 *   counter increment       press an Action by its derived word
 *   counter reset           refused with its sentence while the count is 0
 *   counter menu open       present the action menu (mirrors to peers)
 *   counter menu type re    filter it
 *   counter menu choose reset
 *   counter key k --meta    press any key
 *   counter help            usage derived from the Catalog
 *
 * This file must not import Effect, Instant, or the Program, so the view
 * starts fast. Memory and File tapes run in this process.
 */
import {
  cliDaemonSocketPath,
  parseProgramArgv,
  runCliView,
  spawnCliViewDaemon,
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

if (tape._tag === 'Instant') {
  try {
    writeCliViewResult(
      await runCliView({
        socketPath: cliDaemonSocketPath({
          programId: counterCliProgramId,
          isolationKey: counterCliIsolationKey(),
        }),
        spawn: () =>
          spawnCliViewDaemon({
            scriptPath: fileURLToPath(new URL('./daemon.js', import.meta.url)),
          }),
        request,
      }),
    )
  } catch (cause) {
    writeCliViewResult({
      stdout: '',
      stderr:
        cause instanceof Error ? cause.message : 'The Counter CLI failed.',
      exitCode: 1,
    })
  }
} else {
  const { runInProcess } = await import('./inProcess.js')
  await runInProcess(
    tape,
    request._tag === 'Show' ? [] : request.token.split(' '),
    request.flags,
  )
}
