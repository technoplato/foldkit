#!/usr/bin/env node
/**
 * The Multiple Counters CLI. Every command comes from the Program through
 * the generic Foldkit CLI surface, so this file names no counter, Action,
 * or route:
 *
 *   counters                     paint the list and every Action
 *   counters add-counter         add a counter
 *   counters increment 2         count Counter 2 up
 *   counters open-counter 2      open Counter 2's page
 *   counters delete-counter 2    ask before deleting Counter 2
 *   counters confirm-delete-counter
 *   counters tail                print every Message as it lands
 *   counters help                usage derived from the Program
 *
 * The counters live on the one Instant project, shared with every other
 * window; run it through `with-counter-v01-env` for the admin token.
 */
import { Effect } from 'effect'
import { Interaction, Processor } from 'foldkit'
import { runProgramCommand, runProgramTail } from 'foldkit/cli'
import { parseProgramArgv, writeCliViewResult } from 'foldkit/cli/view'
import {
  MessageWire,
  bindCounters,
  countersEngine,
  newProcessorInstance,
  startCounters,
} from 'multiple-counters-core-example'

const name = 'counters'

const readyTimeoutMs = 10_000

const config = {
  host: Processor.Host.Cli(),
  instance: newProcessorInstance(),
}

const request = parseProgramArgv(process.argv.slice(2))

if (request._tag === 'Tail') {
  await Effect.runPromise(
    Effect.scoped(
      Effect.andThen(
        runProgramTail(countersEngine(config), MessageWire, line => {
          process.stdout.write(`${line}\n`)
        }),
        Effect.never,
      ),
    ),
  )
} else {
  const handle = startCounters(config)
  const bound = bindCounters(handle)
  await Interaction.whenSettled(bound, readyTimeoutMs)
  const painted = runProgramCommand(
    bound,
    name,
    request._tag === 'Show' ? [] : request.token.split(' '),
    request.flags,
  )
  await handle.stop()
  writeCliViewResult({ stderr: '', ...painted })
}
