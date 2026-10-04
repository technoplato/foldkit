import {
  MessageWire,
  bindBooks,
  booksEngine,
  newProcessorInstance,
  startBooks,
  whenLibraryOpened,
} from 'books-core-example'
import { Effect } from 'effect'
import { Interaction, Processor, Telemetry } from 'foldkit'
import { runProgramTail, runProgramWatch } from 'foldkit/cli'
import { fileSink } from 'foldkit/telemetry/node'

import { signedInOrExit } from './signIn.js'

const readyTimeoutMs = 15_000

const configOf = () => ({
  host: Processor.Host.Cli(),
  instance: newProcessorInstance(),
})

/**
 * `books tail`: prints every Message the library's log takes, from every
 * device, as it lands, until Ctrl-C.
 */
export const runTail = async (): Promise<void> => {
  const signedIn = await signedInOrExit()
  await Effect.runPromise(
    Effect.scoped(
      Effect.andThen(
        runProgramTail(booksEngine(signedIn, configOf()), MessageWire, line => {
          process.stdout.write(`${line}\n`)
        }),
        Effect.never,
      ),
    ),
  )
}

/**
 * `books watch`: repaints the library as it changes on any device, until
 * Ctrl-C. It plays nothing; the player is `books listen`. Its telemetry
 * goes to `books-cli.ndjson`, beside the player's.
 */
export const runWatch = async (): Promise<void> => {
  const signedIn = await signedInOrExit()
  const handle = startBooks(signedIn, configOf())
  Telemetry.attach(handle, { app: 'books', sink: fileSink() })
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
}
