/**
 * How a `books` command reaches this machine's player: it starts the
 * player the first time a command needs it, sends the command over its
 * socket, and prints what the player answers. This module must not import
 * Effect, Instant, or the Program, so a command starts fast.
 */
import {
  type CliViewRequest,
  askCliView,
  cliViewFailed,
  isCliViewListening,
  runCliTuiView,
  runCliView,
  spawnCliViewDaemon,
  writeCliViewResult,
} from 'foldkit/cli/view'
import { fileURLToPath } from 'node:url'

import { booksPlayerSocketPath } from './settings.js'

const daemonScriptPath = fileURLToPath(new URL('./daemon.js', import.meta.url))

const startingSentence = 'Starting the Books player…'

const noPlayerSentence =
  'Nothing is playing in this terminal’s player. `books listen <title>` starts one.'

const spawnPlayer = () => spawnCliViewDaemon({ scriptPath: daemonScriptPath })

const sayWhenStarting = async (socketPath: string): Promise<void> => {
  if (!(await isCliViewListening(socketPath))) {
    process.stderr.write(`${startingSentence}\n`)
  }
}

/**
 * Sends one command to the player, starting it first when it is not
 * running, and prints its answer: `books pause` pauses and prints the
 * brief.
 */
export const askPlayer = async (request: CliViewRequest): Promise<void> => {
  const socketPath = booksPlayerSocketPath()
  await sayWhenStarting(socketPath)
  try {
    writeCliViewResult(
      await runCliView({ socketPath, spawn: spawnPlayer, request }),
    )
  } catch (cause) {
    writeCliViewResult(cliViewFailed(cause))
  }
}

/**
 * `books stop`: asks the running player to pause, save the place, and
 * end. With no player running, it says so and starts none.
 */
export const stopPlayer = async (): Promise<void> => {
  const socketPath = booksPlayerSocketPath()
  if (!(await isCliViewListening(socketPath))) {
    writeCliViewResult({ stdout: noPlayerSentence, stderr: '', exitCode: 0 })
    return
  }
  try {
    writeCliViewResult(
      await askCliView(socketPath, { _tag: 'Do', token: 'stop' }),
    )
  } catch (cause) {
    writeCliViewResult(cliViewFailed(cause))
  }
}

/**
 * `books tui`: the player's screen, live, in this terminal, with its
 * words and controls. It is a view of the player, so `q` closes it and
 * the title plays on; the brief after says what is still playing.
 */
export const showPlayerTui = async (): Promise<void> => {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    writeCliViewResult({
      stdout: '',
      stderr: 'books tui needs a terminal. Run it in one, or use `books`.',
      exitCode: 2,
    })
    return
  }
  const socketPath = booksPlayerSocketPath()
  await sayWhenStarting(socketPath)
  try {
    const end = await runCliTuiView({ socketPath, spawn: spawnPlayer })
    if (end._tag === 'Lost') {
      writeCliViewResult({
        stdout: '',
        stderr: `The player stopped answering: ${end.reason}`,
        exitCode: 1,
      })
    } else {
      writeCliViewResult(
        await askCliView(socketPath, { _tag: 'Do', token: 'help' }),
      )
    }
  } catch (cause) {
    writeCliViewResult(cliViewFailed(cause))
  }
}
