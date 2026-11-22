/// <reference types="node" />
/**
 * The terminal host: one call that makes a Program a command.
 *
 * This module must not import Effect, Instant, or a Program, so a command
 * starts fast. The Program is imported only in the Background Processor,
 * the one long-lived process `terminal` starts on the first command.
 */
import type { ChildProcess } from 'node:child_process'
import { readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { followArgvOf, parseProgramArgv } from './argv.js'
import {
  type CompletionShell,
  completionScriptOf,
  completionShellOf,
  completionWordsWord,
  completionsWord,
  installCompletion,
} from './completions.js'
import {
  cliDaemonPidOf,
  cliDaemonSocketPath,
  terminalLogPath,
} from './paths.js'
import type { TerminalProcessor } from './serve.js'
import {
  type CliViewPainted,
  type CliViewRequest,
  askCliView,
  cliViewFailed,
  isCliViewListening,
  runCliTuiView,
  runCliView,
  spawnCliViewDaemon,
  writeCliFollow,
  writeCliViewResult,
} from './view.js'
import {
  buildWord,
  makeWayWord,
  stopWord,
  stoppedOutcome,
  wordsWord,
  workingOutcome,
} from './words.js'

export type { TerminalProcessor, TerminalProgram } from './serve.js'
export { terminalLogPath } from './paths.js'

// OPTIONS

/**
 * All a terminal host says. `name` is the command, `counter`. `entry` is
 * the host's own file, `import.meta.url`, which `terminal` starts again
 * as the Background Processor. `processor` imports the Program and says
 * how to start it; only the Background Processor calls it, so a command
 * never loads the Program.
 *
 * `socketKey` names the Background Processor on this machine when one
 * must be shared by every checkout, such as one player per library.
 * Without it each checkout of the host has its own, so a build in a
 * worktree never answers for the installed command. `idleMs` is how long
 * the Background Processor waits with nothing to do before it stops, ten
 * minutes unless said.
 *
 * A test that runs the command sets `FOLDKIT_TERMINAL_ISOLATION` to a
 * word of its own, such as the test's name, and gets a Background
 * Processor nothing else reaches, so it never answers for a person's.
 */
export type TerminalOptions<Model, Message> = Readonly<{
  name: string
  entry: string
  socketKey?: string
  idleMs?: number
  processor: () => Promise<TerminalProcessor<Model, Message>>
}>

// WORDS

/** The environment variable that gives a test a Background Processor of its own. */
export const terminalIsolationVariable = 'FOLDKIT_TERMINAL_ISOLATION'

/** The flag `terminal` starts its own entry with to run the Background Processor. */
export const backgroundProcessorFlag = '--foldkit-background-processor'

const tuiWord = 'tui'

const screenTopic = 'screen'

const logTopic = 'log'

const ANSWER_TIMEOUT_MS = 5_000

const GONE_TIMEOUT_MS = 5_000

const GONE_CHECK_EVERY_MS = 50

const notUnderstoodExitCode = 2

// BUILD

const BUILD_SEPARATOR = '@'

const newestWriteIn = (directory: string): number => {
  try {
    return readdirSync(directory).reduce((newest, file) => {
      try {
        return Math.max(newest, statSync(join(directory, file)).mtimeMs)
      } catch {
        return newest
      }
    }, 0)
  } catch {
    return 0
  }
}

/**
 * What a host was built from, as a word that changes with every build:
 * where its entry is, and when a file beside it was last written,
 * `/Users/ada/foldkit/examples/counter/cli/dist/entry.js@1795400000000`.
 * A Background Processor says it with every answer, so a command from a
 * newer build of the same host can tell the Processor is the older one.
 * It does not change when only a package the host imports is rebuilt;
 * `counter stop` ends the Processor then, and the next command starts
 * the new code.
 *
 * @example
 * ```typescript
 * terminalBuildOf(fileURLToPath(import.meta.url))
 * ```
 */
export const terminalBuildOf = (entryPath: string): string =>
  `${entryPath}${BUILD_SEPARATOR}${Math.round(newestWriteIn(dirname(entryPath))).toString()}`

const pathOfBuild = (build: string): string | undefined => {
  const at = build.lastIndexOf(BUILD_SEPARATOR)
  return at < 0 ? undefined : build.slice(0, at)
}

/**
 * What a command does about the Background Processor that answered it
 * with `theirs`, when the command itself is of the build `ours`: `Keep`
 * it when it is the same build, or when it was started from another
 * place, so a checkout in a worktree never takes over the Processor a
 * shared `socketKey` gave it; `Replace` it when it is an older or newer
 * build of this same host, or one from before builds were said.
 *
 * @example
 * ```typescript
 * handoverOf('/app/dist/entry.js@2', '/app/dist/entry.js@1') // 'Replace'
 * handoverOf('/app/dist/entry.js@2', '/worktree/dist/entry.js@9') // 'Keep'
 * ```
 */
export const handoverOf = (
  ours: string,
  theirs: string | undefined,
): 'Keep' | 'Replace' => {
  if (theirs === ours) {
    return 'Keep'
  } else if (theirs === undefined) {
    return 'Replace'
  } else {
    const theirPath = pathOfBuild(theirs)
    return theirPath === undefined || theirPath === pathOfBuild(ours)
      ? 'Replace'
      : 'Keep'
  }
}

// ASK

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

const within = <A>(promise: Promise<A>, limitMs: number): Promise<A> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('The Background Processor did not answer in time.'))
    }, limitMs)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      (cause: unknown) => {
        clearTimeout(timer)
        reject(cause instanceof Error ? cause : new Error(String(cause)))
      },
    )
  })

const whenGone = async (socketPath: string): Promise<boolean> => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < GONE_TIMEOUT_MS) {
    if (!(await isCliViewListening(socketPath))) {
      return true
    }
    await sleep(GONE_CHECK_EVERY_MS)
  }
  return false
}

const tellToEnd = (socketPath: string): void => {
  const pid = cliDaemonPidOf(socketPath)
  if (pid !== undefined) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // NOTE: it is already gone.
    }
  }
}

/**
 * Stops the Background Processor on a socket and returns what it said,
 * or nothing when none was running. It asks over the socket first, so
 * the Processor saves what it has to before it goes, and tells the
 * process to end only when it does not answer or does not know the word.
 * It never removes the socket's files: the Processor removes its own.
 *
 * @example
 * ```typescript
 * const said = await stopBackgroundProcessorGently(socketPath)
 * // 'Paused at 12:03 and saved.' from a player, or 'Stopped the counter Background Processor.'
 * ```
 */
export const stopBackgroundProcessorGently = async (
  socketPath: string,
): Promise<string | undefined> => {
  if (!(await isCliViewListening(socketPath))) {
    return undefined
  }
  const answered = await within(
    askCliView(socketPath, { _tag: 'Do', token: stopWord }),
    ANSWER_TIMEOUT_MS,
  ).then(
    painted => painted,
    () => undefined,
  )
  const isStopping = answered?.flags?.['outcome'] === stoppedOutcome
  if (!isStopping || !(await whenGone(socketPath))) {
    tellToEnd(socketPath)
    await whenGone(socketPath)
  }
  return isStopping ? answered.stdout : ''
}

const buildOfRunning = async (
  socketPath: string,
): Promise<string | undefined> =>
  within(
    askCliView(socketPath, { _tag: 'Do', token: buildWord }),
    ANSWER_TIMEOUT_MS,
  ).then(
    painted =>
      painted.exitCode === 0 && painted.stdout.includes(BUILD_SEPARATOR)
        ? painted.stdout.trim()
        : undefined,
    () => undefined,
  )

/**
 * Asks the Background Processor running on a socket to make way when it
 * is another build of this host, so the command that follows starts,
 * and is answered by, the code it came with. A Processor of this build,
 * one started from another place, and no Processor at all are left as
 * they are.
 *
 * A Processor whose Program has work going on stays, and what it says
 * about that work is returned for the command to print: the running
 * build answers the command, and the first command after the work ends
 * replaces it. One that does not say whether it is working is left too,
 * since ending it could end work nobody heard about. One from before
 * Processors knew the word is stopped as before.
 */
const madeWayForOtherBuild = async (
  name: string,
  socketPath: string,
  build: string,
): Promise<string | undefined> => {
  if (
    !(await isCliViewListening(socketPath)) ||
    handoverOf(build, await buildOfRunning(socketPath)) === 'Keep'
  ) {
    return undefined
  }
  const answered = await within(
    askCliView(socketPath, { _tag: 'Do', token: makeWayWord }),
    ANSWER_TIMEOUT_MS,
  ).then(
    painted => painted,
    () => undefined,
  )
  const outcome = answered?.flags?.['outcome']
  if (answered === undefined) {
    return `The ${name} Background Processor is another build and did not say whether it is working, so it was not replaced. \`${name} ${stopWord}\` ends it now.`
  } else if (outcome === workingOutcome) {
    return answered.stdout
  } else {
    if (outcome !== stoppedOutcome || !(await whenGone(socketPath))) {
      await stopBackgroundProcessorGently(socketPath)
    }
    return undefined
  }
}

// TERMINAL

const stoppedSentence = (name: string, said: string | undefined): string => {
  if (said === undefined) {
    return `The ${name} Background Processor is not running.`
  } else if (said === '') {
    return `Stopped the ${name} Background Processor.`
  } else {
    return said
  }
}

const completionsAnswer = (
  name: string,
  shell: CompletionShell | undefined,
  isOnlyPrinted: boolean,
): CliViewPainted => {
  if (shell === undefined) {
    return {
      stdout: '',
      stderr: `Tab completion is written for zsh, bash and fish. Name one: ${name} ${completionsWord} zsh`,
      exitCode: notUnderstoodExitCode,
    }
  } else if (isOnlyPrinted) {
    return { stdout: completionScriptOf(shell, name), stderr: '', exitCode: 0 }
  } else {
    const installed = installCompletion(shell, name)
    return {
      stdout: [
        `Tab completion for ${name} is installed for ${shell}: ${installed.scriptPath}`,
        ...(installed.startupPath === undefined
          ? []
          : [`Added one line to ${installed.startupPath} that loads it.`]),
        `Open a new terminal, type ${name} and a space, and press Tab.`,
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    }
  }
}

const NEVER_REACHED = new Set(['ENOENT', 'ECONNREFUSED'])

// NOTE: Only a command that never reached a Processor is asked again. One
// that reached it and lost the answer may already have been carried out.
const wasNeverReached = (cause: unknown): boolean =>
  typeof cause === 'object' &&
  cause !== null &&
  'code' in cause &&
  typeof cause.code === 'string' &&
  NEVER_REACHED.has(cause.code)

const takesColor = (
  env: Readonly<Record<string, string | undefined>>,
): boolean => (env['NO_COLOR'] ?? '') === '' && env['TERM'] !== 'dumb'

/**
 * Makes a Program a command, and is the whole of its terminal host.
 * `counter` paints the screen and every Action; `counter increment`
 * presses one by its derived word; `counter follow screen` and `counter
 * watch` repaint as the Model changes, from this device or any other;
 * `counter tail` prints every Message the log takes, when the host names
 * its log; `counter tui` is the live terminal UI; `counter stop` ends
 * the Background Processor after it has saved; `counter completions`
 * installs tab completion for the shell it is run in, and `counter
 * completions zsh` prints the script instead. Every other word, its
 * help, and each refusal come from the Program's own declarations; a
 * Program with an Action of its own called Stop is reached as `counter
 * do stop`.
 *
 * The Program runs in one Background Processor, started by the first
 * command and reached by every later one, so its sync connection stays
 * warm, what it started keeps going after a command returns, and a view
 * hears each change as it happens. It stops by itself once the Program
 * has had nothing to do for ten minutes, and a command from another build
 * replaces it, unless its Program has work going on: then it stays,
 * answers, and the command says which work keeps it.
 *
 * @example
 * ```typescript
 * #!/usr/bin/env node
 * import { terminal } from 'foldkit/cli/host'
 *
 * await terminal({
 *   name: 'counter',
 *   entry: import.meta.url,
 *   processor: async () => {
 *     const { SyncedCounter, startCounter, newProcessorInstance } =
 *       await import('counter-core-example')
 *     return {
 *       program: SyncedCounter,
 *       start: host => startCounter({ host, instance: newProcessorInstance() }),
 *     }
 *   },
 * })
 * ```
 */
export const terminal = async <Model, Message>(
  options: TerminalOptions<Model, Message>,
  runtime: NodeJS.Process = process,
): Promise<void> => {
  const entryPath = realpathSync(fileURLToPath(options.entry))
  const isolation = runtime.env[terminalIsolationVariable] ?? ''
  const socketPath = cliDaemonSocketPath({
    programId: options.name,
    isolationKey: `${options.socketKey ?? entryPath}${isolation}`,
  })
  const build = terminalBuildOf(entryPath)
  const argv = runtime.argv.slice(2)
  const [firstWord = '', ...otherWords] = argv

  if (firstWord === backgroundProcessorFlag) {
    const { serveTerminal } = await import('./serve.js')
    await serveTerminal({
      name: options.name,
      socketPath,
      build,
      ...(options.idleMs === undefined ? {} : { idleMs: options.idleMs }),
      processor: await options.processor(),
    })
    return
  }

  // NOTE: The Processor is started with what this command was started
  // with, such as a loader for TypeScript, so it can run the same file.
  const spawnProcessor = (): ChildProcess =>
    spawnCliViewDaemon({
      scriptPath: entryPath,
      argv: [backgroundProcessorFlag],
      env: runtime.env,
      execArgv: runtime.execArgv,
      logPath: terminalLogPath(options.name),
    })

  const answer = (painted: CliViewPainted): void => {
    writeCliViewResult(painted, runtime)
  }

  if (firstWord === stopWord && otherWords.length === 0) {
    answer({
      stdout: stoppedSentence(
        options.name,
        await stopBackgroundProcessorGently(socketPath),
      ),
      stderr: '',
      exitCode: 0,
    })
    return
  }

  const kept = await madeWayForOtherBuild(options.name, socketPath, build)
  if (kept !== undefined) {
    runtime.stderr.write(`${kept}\n`)
  }

  if (firstWord === completionsWord) {
    const [second = '', ...said] = otherWords
    if (second === completionWordsWord) {
      const words = await runCliView({
        socketPath,
        spawn: spawnProcessor,
        request: { _tag: 'Do', token: [wordsWord, ...said].join(' ') },
      }).then(
        painted => painted.stdout,
        () => '',
      )
      answer({ stdout: words, stderr: '', exitCode: 0 })
    } else {
      answer(
        completionsAnswer(
          options.name,
          second === ''
            ? completionShellOf(runtime.env['SHELL'])
            : completionShellOf(second),
          second !== '',
        ),
      )
    }
    return
  }

  const request = parseProgramArgv(argv)
  const maybeFollow = followArgvOf(argv)
  const isTerminal = runtime.stdout.isTTY === true

  if (firstWord === tuiWord && otherWords.length === 0) {
    if (runtime.stdin.isTTY !== true || !isTerminal) {
      answer({
        stdout: '',
        stderr: `${options.name} ${tuiWord} needs a terminal. Run it in one, or use \`${options.name}\`.`,
        exitCode: notUnderstoodExitCode,
      })
      return
    }
    const ground = runtime.env['COLORFGBG'] ?? ''
    const end = await runCliTuiView({
      socketPath,
      spawn: spawnProcessor,
      isColor: takesColor(runtime.env),
      ...(ground === '' ? {} : { terminalGround: ground }),
    })
    if (end._tag === 'Lost') {
      answer({
        stdout: '',
        stderr: `The ${options.name} Background Processor stopped answering: ${end.reason}`,
        exitCode: 1,
      })
    }
  } else if (request._tag === 'Watch') {
    await writeCliFollow(
      {
        socketPath,
        spawn: spawnProcessor,
        request: { topic: screenTopic, flags: request.flags },
        inPlace: isTerminal,
      },
      runtime,
    )
  } else if (request._tag === 'Tail') {
    await writeCliFollow(
      {
        socketPath,
        spawn: spawnProcessor,
        request: { topic: logTopic, flags: request.flags },
      },
      runtime,
    )
  } else if (maybeFollow !== undefined) {
    await writeCliFollow(
      { socketPath, spawn: spawnProcessor, request: maybeFollow },
      runtime,
    )
  } else {
    const viewRequest: CliViewRequest = request
    const ask = (): Promise<CliViewPainted> =>
      runCliView({ socketPath, spawn: spawnProcessor, request: viewRequest })
    // NOTE: A Processor that stops for having nothing to do may stop
    // between this command finding it and asking it. The command asks
    // once more, which starts a new one.
    try {
      answer(
        await ask().catch((cause: unknown) => {
          if (wasNeverReached(cause)) {
            return ask()
          } else {
            throw cause
          }
        }),
      )
    } catch (cause) {
      answer(cliViewFailed(cause))
    }
  }
}
