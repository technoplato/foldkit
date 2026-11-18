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
  declaredCommandOf,
  isCliViewListening,
  runCliTuiView,
  runCliView,
  spawnCliViewDaemon,
  writeCliFollow,
  writeCliViewResult,
} from 'foldkit/cli/view'
import { fileURLToPath } from 'node:url'

import { booksCommandName, booksPlayerSocketPath } from './settings.js'

const daemonScriptPath = fileURLToPath(new URL('./daemon.js', import.meta.url))

/** A command of this terminal as typed, its words read from its name. */
const commandLine = (path: ReadonlyArray<string>): string =>
  [booksCommandName, declaredCommandOf(path)].join(' ')

const startingSentence = 'Starting the Books player…'

const noPlayerSentence = `Nothing is playing in this terminal’s player. \`${commandLine(['Help'])}\` says how to start one.`

const spawnPlayer = () => spawnCliViewDaemon({ scriptPath: daemonScriptPath })

const notUnderstoodExitCode = 2

const stoppedAgainSentence =
  'The player was started only to read that, and is stopped again.'

/**
 * What {@link askPlayer} needs from outside: whether a player is
 * listening, a way to run a command starting the player when needed, a
 * way to ask a running one, and where to write and to say a line.
 */
export type AskRuntime = Readonly<{
  isListening: (socketPath: string) => Promise<boolean>
  run: (socketPath: string, request: CliViewRequest) => Promise<CliViewPainted>
  ask: (socketPath: string, request: CliViewRequest) => Promise<CliViewPainted>
  write: (result: CliViewPainted) => void
  say: (sentence: string) => void
}>

const askRuntime: AskRuntime = {
  isListening: isCliViewListening,
  run: (socketPath, request) =>
    runCliView({ socketPath, spawn: spawnPlayer, request }),
  ask: askCliView,
  write: writeCliViewResult,
  say: sentence => {
    process.stderr.write(`${sentence}\n`)
  },
}

const sayWhenStarting = async (socketPath: string): Promise<void> => {
  if (!(await isCliViewListening(socketPath))) {
    process.stderr.write(`${startingSentence}\n`)
  }
}

/**
 * Sends one command to the player, starting it first when it is not
 * running, and prints its answer: `books pause` pauses and prints the
 * brief. When the player could not read the command, and this command is
 * what started it, the player is stopped again and a line says so.
 */
export const askPlayer = async (
  request: CliViewRequest,
  runtime: AskRuntime = askRuntime,
): Promise<void> => {
  const socketPath = booksPlayerSocketPath()
  const wasRunning = await runtime.isListening(socketPath)
  if (!wasRunning) {
    runtime.say(startingSentence)
  }
  try {
    const result = await runtime.run(socketPath, request)
    runtime.write(result)
    // NOTE: A command the player could not read, an unknown one or one
    // that named nothing, must leave no player running that this command
    // started: he asked for nothing that needs one.
    if (!wasRunning && result.exitCode === notUnderstoodExitCode) {
      await runtime.ask(socketPath, { _tag: 'Do', token: 'stop' })
      runtime.say(stoppedAgainSentence)
    }
  } catch (cause) {
    runtime.write(cliViewFailed(cause))
  }
}

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
    const { usageText } = await import('./help.js')
    runtime.write({ stdout: usageText(), stderr: '', exitCode: 0 })
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
 * `books follow`: follows a topic of the player, the words unless another
 * is named, starting the player first when it is not running, until
 * Ctrl-C or the pipe's reader goes away. On a terminal it repaints the
 * topic in place, a few lines that change where they are; it reads no
 * key and does not take the screen over. Down a pipe it writes each event
 * on its own line, so `books follow --json | jq .text` works.
 */
export const followPlayer = async (
  request: FollowArgv,
  isTerminal: boolean = process.stdout.isTTY === true,
): Promise<void> => {
  const socketPath = booksPlayerSocketPath()
  await sayWhenStarting(socketPath)
  await writeCliFollow({
    socketPath,
    spawn: spawnPlayer,
    request,
    inPlace: isTerminal,
  })
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
 * Whether a terminal takes color: color was not refused with `NO_COLOR`
 * and the terminal is not a `dumb` one.
 *
 * @example
 * ```typescript
 * takesColor({ TERM: 'xterm-256color' }) // true
 * takesColor({ NO_COLOR: '1' }) // false
 * ```
 */
export const takesColor = (
  env: Readonly<Record<string, string | undefined>>,
): boolean => (env['NO_COLOR'] ?? '') === '' && env['TERM'] !== 'dumb'

/**
 * Whether this command paints with color: its output is a terminal that
 * takes color, or `FORCE_COLOR` asks for color whatever the output is,
 * as it does for many commands, unless color was refused.
 *
 * @example
 * ```typescript
 * paintsColor(true, { TERM: 'xterm-256color' }) // true
 * paintsColor(false, { FORCE_COLOR: '1' }) // true
 * paintsColor(false, {}) // false
 * ```
 */
export const paintsColor = (
  isTerminal: boolean,
  env: Readonly<Record<string, string | undefined>>,
): boolean => {
  const forced = env['FORCE_COLOR'] ?? ''
  return (isTerminal || (forced !== '' && forced !== '0')) && takesColor(env)
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
      stderr: `${commandLine(['Tui'])} needs a terminal. Run it in one, or use \`${booksCommandName}\`.`,
      exitCode: 2,
    })
    return
  }
  const socketPath = booksPlayerSocketPath()
  await sayWhenStarting(socketPath)
  try {
    const end = await runCliTuiView({
      socketPath,
      spawn: spawnPlayer,
      isColor: takesColor(process.env),
    })
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
