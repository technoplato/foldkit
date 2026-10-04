#!/usr/bin/env node
/**
 * The Books CLI. Every command comes from the Program through the generic
 * Foldkit CLI surface, so this file names no title, Action, or route:
 *
 *   books                         paint the library and every Action
 *   books open a-new-earth        open a title's page
 *   books listen a-new-earth      play a title from your place
 *   books seek-to 723000          move the player to 12:03
 *   books watch                   repaint as the library changes
 *   books tail                    print every Message as it lands
 *   books help                    usage derived from the Program
 *
 * It signs in as your Cloudflare Access login through the reader's mint;
 * run it through `scripts/with-books-access`.
 */
import {
  MessageWire,
  bindBooks,
  booksEngine,
  newProcessorInstance,
  startBooks,
  whenLibraryOpened,
} from 'books-core-example'
import { Effect } from 'effect'
import { Interaction, Processor } from 'foldkit'
import { runProgramCommand, runProgramTail, runProgramWatch } from 'foldkit/cli'
import { parseProgramArgv, writeCliViewResult } from 'foldkit/cli/view'

import { signedInOrExit } from './signIn.js'

const name = 'books'

const readyTimeoutMs = 15_000

const config = {
  host: Processor.Host.Cli(),
  instance: newProcessorInstance(),
}

const request = parseProgramArgv(process.argv.slice(2))

const signedIn = await signedInOrExit()

if (request._tag === 'Tail') {
  await Effect.runPromise(
    Effect.scoped(
      Effect.andThen(
        runProgramTail(booksEngine(signedIn, config), MessageWire, line => {
          process.stdout.write(`${line}\n`)
        }),
        Effect.never,
      ),
    ),
  )
} else if (request._tag === 'Watch') {
  const handle = startBooks(signedIn, config)
  const bound = bindBooks(handle)
  await Interaction.whenSettled(bound, readyTimeoutMs)
  await whenLibraryOpened(handle, readyTimeoutMs)
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
  const handle = startBooks(signedIn, config)
  const bound = bindBooks(handle)
  await Interaction.whenSettled(bound, readyTimeoutMs)
  await whenLibraryOpened(handle, readyTimeoutMs)
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
