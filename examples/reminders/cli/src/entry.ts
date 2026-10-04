#!/usr/bin/env node
/**
 * The Reminders CLI. Every command comes from the Program through the
 * generic Foldkit CLI surface, so this file names no list, Action, or
 * route:
 *
 *   reminders                                  paint home and every Action
 *   reminders open-smart-list today            open Today
 *   reminders --at /reminders/lists/<id>       paint one list
 *   reminders --at /reminders/lists/<id> add-reminder Buy milk
 *                                              add a reminder to that list
 *   reminders complete <reminder id>           tick a reminder done
 *   reminders watch                            repaint as the lists change
 *   reminders tail                             print every Message as it lands
 *   reminders help                             usage derived from the Program
 *
 * `--at` opens an address first, the same one the web Reminders shows and
 * shares, so a one-shot command acts on that page. It signs in as your
 * Cloudflare Access login through the web Reminders' mint; run it through
 * `scripts/with-reminders-access`.
 */
import { Effect, Option } from 'effect'
import { Interaction, Navigation, Processor } from 'foldkit'
import { runProgramCommand, runProgramTail, runProgramWatch } from 'foldkit/cli'
import { parseProgramArgv, writeCliViewResult } from 'foldkit/cli/view'
import {
  type BoundReminders,
  MessageWire,
  type RemindersHandle,
  bindReminders,
  newProcessorInstance,
  remindersEngine,
  startReminders,
  whenBoardOpened,
} from 'reminders-core-example'

import { signedInOrExit } from './signIn.js'

const name = 'reminders'

const readyTimeoutMs = 15_000

const config = {
  host: Processor.Host.Cli(),
  instance: newProcessorInstance(),
}

const request = parseProgramArgv(process.argv.slice(2))

const maybeAt = Option.fromNullishOr(request.flags['at'])

const signedIn = await signedInOrExit()

const openedReminders = async (): Promise<
  Readonly<{ handle: RemindersHandle; bound: BoundReminders }>
> => {
  const handle = startReminders(signedIn, config)
  const bound = bindReminders(handle)
  await Interaction.whenSettled(bound, readyTimeoutMs)
  await whenBoardOpened(handle, readyTimeoutMs)
  if (
    Option.isSome(maybeAt) &&
    !bound.openUri(maybeAt.value, Navigation.Cli())
  ) {
    await handle.stop()
    process.stderr.write(`Cannot open ${maybeAt.value} yet.\n`)
    process.exit(1)
  }
  return { handle, bound }
}

if (request._tag === 'Tail') {
  await Effect.runPromise(
    Effect.scoped(
      Effect.andThen(
        runProgramTail(remindersEngine(signedIn, config), MessageWire, line => {
          process.stdout.write(`${line}\n`)
        }),
        Effect.never,
      ),
    ),
  )
} else if (request._tag === 'Watch') {
  const { handle, bound } = await openedReminders()
  await Effect.runPromise(
    Effect.scoped(
      runProgramWatch(
        bound,
        painted => {
          process.stdout.write(painted)
        },
        { isTerminal: process.stdout.isTTY === true },
      ),
    ),
  ).finally(handle.stop)
} else {
  const { handle, bound } = await openedReminders()
  const painted = runProgramCommand(
    bound,
    name,
    request._tag === 'Show' ? [] : request.token.split(' '),
    request.flags,
  )
  await handle.stop()
  writeCliViewResult({ stderr: '', ...painted })
  process.exit(0)
}
