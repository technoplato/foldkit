/**
 * How a `books` command reaches this machine's player: it starts the
 * player the first time a command needs it, sends the command over its
 * socket, and prints what the player answers. This module must not import
 * Effect, Instant, or the Program, so a command starts fast.
 */
import {
  type CliViewPainted,
  type CliViewRequest,
  type FollowArgv,
  askCliView,
  cliViewFailed,
  isCliViewListening,
  runCliTuiView,
  runCliView,
  spawnCliViewDaemon,
  writeCliFollow,
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
 * What `books` alone prints while no player runs here: how to use it,
 * and which commands start the player. It is plain text this module
 * holds, because printing it must start nothing.
 */
export const usageText = [
  'The Books player is not running here, and `books` alone does not start it.',
  '',
  '  books listen <title>     Starts the player and plays a title from your place',
  '  books open /books        Starts the player and prints your library',
  '  books tui                Starts the player and opens it live in this terminal',
  '  books search "<words>"   Finds where words are spoken, with links',
  '  books follow words       Prints the words as they are read',
  '  books devices            Lists the audio outputs, by number',
  '  books login              Signs in to Cloudflare Access',
  '  books stop               Pauses, saves your place, and ends the player',
  '',
  'While the player runs, `books` says what is playing and what to run next.',
].join('\n')

/**
 * What {@link showBriefOrUsage} needs from outside: whether a player is
 * listening, a way to ask it, and where to write.
 */
export type BriefRuntime = Readonly<{
  isListening: (socketPath: string) => Promise<boolean>
  ask: (socketPath: string, request: CliViewRequest) => Promise<CliViewPainted>
  write: (result: CliViewPainted) => void
}>

const briefRuntime: BriefRuntime = {
  isListening: isCliViewListening,
  ask: askCliView,
  write: writeCliViewResult,
}

/**
 * `books` alone, and `books help`: what is playing and what to run next
 * when a player runs here; otherwise how to use `books`, starting no
 * player. Reading must never start something that plays.
 */
export const showBriefOrUsage = async (
  flags: Readonly<Record<string, string>>,
  runtime: BriefRuntime = briefRuntime,
): Promise<void> => {
  const socketPath = booksPlayerSocketPath()
  if (!(await runtime.isListening(socketPath))) {
    runtime.write({ stdout: usageText, stderr: '', exitCode: 0 })
    return
  }
  try {
    runtime.write(
      await runtime.ask(socketPath, { _tag: 'Do', token: 'help', flags }),
    )
  } catch (cause) {
    runtime.write(cliViewFailed(cause))
  }
}

/**
 * `books follow words`: writes a topic of the player to stdout each time
 * it changes, starting the player first when it is not running, until
 * Ctrl-C or the pipe's reader goes away. It takes over nothing, so
 * `books follow words --json | jq .header.place` works.
 */
export const followPlayer = async (request: FollowArgv): Promise<void> => {
  const socketPath = booksPlayerSocketPath()
  await sayWhenStarting(socketPath)
  await writeCliFollow({ socketPath, spawn: spawnPlayer, request })
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
