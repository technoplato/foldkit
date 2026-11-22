/// <reference types="node" />
import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { type Socket, connect } from 'node:net'
import { dirname } from 'node:path'
import { createInterface, emitKeypressEvents } from 'node:readline'

import type { Host } from '../processor/host.js'
import { formatTerminalFrame } from './frameWriter.js'
import {
  cliDaemonLockPath,
  holdCliDaemonLockFor,
  removeCliDaemonFiles,
  removeCliDaemonSocketAndPid,
  tryAcquireCliDaemonLock,
} from './paths.js'

export {
  cliDaemonLockPath,
  cliDaemonPidPath,
  cliDaemonSocketPath,
  cliDaemonSocketPath as backgroundProcessorSocketPath,
  removeCliDaemonFiles,
  terminalLogPath,
} from './paths.js'
export {
  type ArgvOptions,
  type FollowArgv,
  type ProgramArgv,
  followArgvOf,
  parseProgramArgv,
  withStdinWord,
} from './argv.js'
export {
  type Asked,
  type AskedOptions,
  type HelpRow,
  askedOf,
  commandHelpOf,
  commandOf as declaredCommandOf,
  exampleOf,
  flagOf,
  givenFor,
  helpLines,
  helpRowOf,
  toggleFlagsOf,
  saidPathOf,
  usageOf,
} from './declared.js'
export {
  type CachedDerivationOptions,
  cachedDerivation,
} from './declaredCache.js'
export {
  type Addressed,
  type Declaration,
  type Node,
  type Parameters,
  type Tool,
  findByPath,
  pathsOf,
  toolsOf,
} from '../declaration/plain.js'

/**
 * All of a process's stdin as text, for {@link withStdinWord}.
 *
 * @example
 * ```typescript
 * const argv = await withStdinWord(process.argv.slice(2), () => readStdinText())
 * ```
 */
export const readStdinText = async (
  input: NodeJS.ReadableStream = process.stdin,
): Promise<string> => {
  const chunks: Array<string> = []
  for await (const chunk of input) {
    chunks.push(String(chunk))
  }
  return chunks.join('')
}

/** Ready wait copied from the Effect client so this file never imports Effect. */
export const cliViewReadyTimeoutMs = 20_000

/**
 * Show or Do a slim view sends. Paint stays in the daemon. `client` is the
 * Host of the view that sends it, `{ _tag: 'Cli' }` unless the request
 * names another, such as `{ _tag: 'Tui' }` from {@link runCliTuiView}, so
 * the daemon records what the request causes on that client's surface.
 */
export type CliViewRequest =
  | Readonly<{
      readonly _tag: 'Show'
      readonly flags?: Readonly<Record<string, string>>
      readonly client?: Host
    }>
  | Readonly<{
      readonly _tag: 'Do'
      readonly token: string
      readonly flags?: Readonly<Record<string, string>>
      readonly client?: Host
    }>

const cliClient: Host = { _tag: 'Cli' }

const tuiClient: Host = { _tag: 'Tui' }

/**
 * Painted stdout the daemon returns for Show or Do, and what came of it,
 * such as `{ outcome: 'Quit' }` after a terminal UI's `q`.
 */
export type CliViewPainted = Readonly<{
  stdout: string
  exitCode: number
  stderr: string
  flags?: Readonly<Record<string, string>>
}>

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const newlineIndex = (text: string): number | undefined => {
  const index = text.indexOf('\n')
  if (index < 0) {
    return undefined
  }
  return index
}

const connectSocket = (socketPath: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = connect(socketPath)
    const onConnect = (): void => {
      socket.off('error', onError)
      resolve(socket)
    }
    const onError = (cause: Error): void => {
      socket.off('connect', onConnect)
      reject(cause)
    }
    socket.once('connect', onConnect)
    socket.once('error', onError)
  })

const readLine = (socket: Socket): Promise<string> =>
  new Promise((resolve, reject) => {
    let buffer = ''
    const onData = (chunk: Buffer): void => {
      buffer = `${buffer}${chunk.toString('utf8')}`
      const maybeNewline = newlineIndex(buffer)
      if (maybeNewline === undefined) {
        return
      }
      cleanup()
      resolve(buffer.slice(0, maybeNewline).replace(/\r$/, ''))
    }
    const onClose = (): void => {
      cleanup()
      reject(new Error('CLI daemon closed before a response.'))
    }
    const onError = (cause: Error): void => {
      cleanup()
      reject(cause)
    }
    const cleanup = (): void => {
      socket.off('data', onData)
      socket.off('close', onClose)
      socket.off('error', onError)
    }
    socket.on('data', onData)
    socket.on('close', onClose)
    socket.on('error', onError)
  })

const writeLine = (socket: Socket, line: string): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.write(`${line}\n`, error => {
      if (error !== undefined && error !== null) {
        reject(error)
        return
      }
      resolve()
    })
  })

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

/** True when something is accepting connections on the daemon socket. */
export const isCliViewListening = async (
  socketPath: string,
): Promise<boolean> => {
  try {
    const socket = await connectSocket(socketPath)
    socket.end()
    return true
  } catch {
    return false
  }
}

/**
 * Starts a detached daemon with this process's runtime (Bun or Node).
 * With `logPath`, what it prints and why it died are added to that file,
 * such as `terminalLogPath('books')`; without, they are dropped. With
 * `execArgv`, the runtime is started with those flags first, such as the
 * loader this command itself was started with.
 *
 * @example
 * ```typescript
 * spawnCliViewDaemon({ scriptPath, logPath: terminalLogPath('books') })
 * ```
 */
export const spawnCliViewDaemon = (options: {
  readonly scriptPath: string
  readonly argv?: ReadonlyArray<string>
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly logPath?: string
  readonly execArgv?: ReadonlyArray<string>
}): ChildProcess => {
  const argv = [
    ...(options.execArgv ?? []),
    options.scriptPath,
    ...(options.argv ?? []),
  ]
  const env = options.env ?? process.env
  if (options.logPath === undefined) {
    const child = spawn(process.execPath, argv, {
      detached: true,
      env,
      stdio: 'ignore',
    })
    child.unref()
    return child
  } else {
    mkdirSync(dirname(options.logPath), { recursive: true })
    const log = openSync(options.logPath, 'a')
    const child = spawn(process.execPath, argv, {
      detached: true,
      env,
      stdio: ['ignore', log, log],
    })
    child.unref()
    closeSync(log)
    return child
  }
}

/**
 * True when a Background Processor is running on the socket. The name to
 * use for {@link isCliViewListening}.
 */
export const isBackgroundProcessorRunning = isCliViewListening

/**
 * Starts a Background Processor detached from this command. The name to
 * use for {@link spawnCliViewDaemon}.
 */
export const spawnBackgroundProcessorFromView = spawnCliViewDaemon

const recoverStaleCliDaemonLock = (socketPath: string): void => {
  try {
    const pidText = readFileSync(cliDaemonLockPath(socketPath), 'utf8').trim()
    const pid = Number(pidText)
    if (!Number.isFinite(pid) || pid <= 0) {
      removeCliDaemonFiles(socketPath)
      return
    }
    process.kill(pid, 0)
  } catch {
    removeCliDaemonFiles(socketPath)
  }
}

const waitForListen = async (
  socketPath: string,
  timeoutMs: number,
): Promise<void> => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isCliViewListening(socketPath)) {
      return
    }
    await sleep(50)
  }
  throw new Error(`CLI daemon did not start at ${socketPath}.`)
}

/**
 * Starts the daemon on first invoke. Later views reuse the same socket.
 * A leftover process on that socket is the one that answers. Stop it
 * with `stopCliDaemon` or the pid in `/tmp/fkc-*.pid`, then invoke again.
 */
export const ensureCliViewDaemon = async (options: {
  readonly socketPath: string
  readonly spawn: () => ChildProcess
  readonly timeoutMs?: number
}): Promise<void> => {
  if (await isCliViewListening(options.socketPath)) {
    return
  }
  recoverStaleCliDaemonLock(options.socketPath)
  const wonLock = tryAcquireCliDaemonLock(options.socketPath)
  if (wonLock) {
    removeCliDaemonSocketAndPid(options.socketPath)
    holdCliDaemonLockFor(options.socketPath, options.spawn().pid)
  }
  await waitForListen(
    options.socketPath,
    options.timeoutMs ?? cliViewReadyTimeoutMs,
  )
}

const askPainted = async (
  socketPath: string,
  request: CliViewRequest,
): Promise<CliViewPainted> => {
  const socket = await connectSocket(socketPath)
  await writeLine(
    socket,
    JSON.stringify({ ...request, client: request.client ?? cliClient }),
  )
  const line = await readLine(socket)
  socket.end()
  const parsed: unknown = JSON.parse(line)
  if (isRecord(parsed) && parsed['_tag'] === 'Failed') {
    const cause =
      typeof parsed['cause'] === 'string'
        ? parsed['cause']
        : 'CLI daemon failed.'
    throw new Error(cause)
  }
  if (!isRecord(parsed) || parsed['_tag'] !== 'Painted') {
    throw new Error('CLI daemon response must be Painted.')
  }
  if (typeof parsed['stdout'] !== 'string') {
    throw new Error('CLI daemon Painted stdout must be a string.')
  }
  if (typeof parsed['exitCode'] !== 'number') {
    throw new Error('CLI daemon Painted exitCode must be a number.')
  }
  const stderr = typeof parsed['stderr'] === 'string' ? parsed['stderr'] : ''
  const flags = parsed['flags']
  return {
    stdout: parsed['stdout'],
    exitCode: parsed['exitCode'],
    stderr,
    ...(isRecord(flags) ? { flags: stringsOf(flags) } : {}),
  }
}

const stringsOf = (
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> =>
  Object.entries(record).reduce<Readonly<Record<string, string>>>(
    (strings, [key, value]) =>
      typeof value === 'string' ? { ...strings, [key]: value } : strings,
    {},
  )

/**
 * Sends Show or Do to a daemon that is already listening, without starting
 * one, so a command such as `books stop` never starts a player to stop it.
 *
 * @example
 * ```typescript
 * if (await isCliViewListening(socketPath)) {
 *   writeCliViewResult(await askCliView(socketPath, { _tag: 'Do', token: 'stop' }))
 * }
 * ```
 */
export const askCliView = (
  socketPath: string,
  request: CliViewRequest,
): Promise<CliViewPainted> => askPainted(socketPath, request)

const formatMs = (durationMs: number): string =>
  durationMs.toFixed(1).padStart(8)

/** Prints one wall-clock line when FOLDKIT_CLI_TRACE=1. No Effect. */
export const printCliViewTrace = (
  runtime: NodeJS.Process,
  marks: Readonly<{
    ensureMs: number
    askMs: number
  }>,
): void => {
  if (runtime.env['FOLDKIT_CLI_TRACE'] !== '1') {
    return
  }
  const totalMs = runtime.uptime() * 1_000
  const lines = [
    'TRACE FOLDKIT_CLI_TRACE',
    `total                     ${formatMs(totalMs)}ms  process.uptime`,
    `cli.view.ensure           ${formatMs(marks.ensureMs)}ms  socket probe or spawn wait`,
    `cli.view.ask              ${formatMs(marks.askMs)}ms  Show or Do`,
  ]
  runtime.stderr.write(`${lines.join('\n')}\n`)
}

const writeText = (
  stream: Readonly<{ write: (text: string) => unknown }>,
  text: string,
): void => {
  if (text === '') {
    return
  }
  stream.write(text.endsWith('\n') ? text : `${text}\n`)
}

/** Writes painted stdout and sets exitCode. */
export const writeCliViewResult = (
  painted: CliViewPainted,
  runtime: NodeJS.Process = process,
): void => {
  writeText(runtime.stdout, painted.stdout)
  writeText(runtime.stderr, painted.stderr)
  runtime.exitCode = painted.exitCode
}

const daemonUnreachable = 'The CLI could not reach its daemon.'

/**
 * The result a CLI view writes when it cannot reach its daemon: the
 * cause's message, exit code 1.
 *
 * @example
 * ```typescript
 * writeCliViewResult(cliViewFailed(new Error('connect ENOENT')))
 * // stderr 'connect ENOENT', exit code 1
 * ```
 */
export const cliViewFailed = (cause: unknown): CliViewPainted => ({
  stdout: '',
  stderr:
    cause instanceof Error && cause.message !== ''
      ? cause.message
      : daemonUnreachable,
  exitCode: 1,
})

export type RunCliViewOptions = Readonly<{
  socketPath: string
  spawn: () => ChildProcess
  request: CliViewRequest
  timeoutMs?: number
}>

/**
 * Ensures the daemon, sends Show or Do, and returns painted stdout.
 * This module must not import Effect, Instant, or a Program.
 */
export const runCliView = async (
  options: RunCliViewOptions,
): Promise<CliViewPainted> => {
  const ensureStarted = Date.now()
  await ensureCliViewDaemon({
    socketPath: options.socketPath,
    spawn: options.spawn,
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
  })
  const ensureMs = Date.now() - ensureStarted
  const askStarted = Date.now()
  const painted = await askPainted(options.socketPath, options.request)
  const askMs = Date.now() - askStarted
  printCliViewTrace(process, { ensureMs, askMs })
  return painted
}

// FOLLOW

const lostReasonOf = (cause: unknown): string =>
  cause instanceof Error && cause.message !== ''
    ? cause.message
    : daemonUnreachable

/**
 * A topic a slim view follows, such as `{ topic: 'screen' }` or a
 * Program's own `{ topic: 'words', flags: { json: '1' } }`. `client` is
 * the Host of the view, `{ _tag: 'Cli' }` unless it names another.
 */
export type CliFollowRequest = Readonly<{
  topic: string
  flags?: Readonly<Record<string, string>>
  client?: Host
}>

/**
 * How a follow ended: the topic had no more to say, the view asked to
 * stop, or the daemon went away or refused, and why.
 */
export type CliFollowEnd =
  | Readonly<{ _tag: 'Ended' }>
  | Readonly<{ _tag: 'Stopped' }>
  | Readonly<{ _tag: 'Lost'; reason: string }>

/** When a follow stops on the view's side: an AbortSignal, such as Ctrl-C's. */
export type CliFollowOptions = Readonly<{ signal?: AbortSignal }>

const daemonWentAway = 'The daemon stopped answering.'

/**
 * Follows one topic of a daemon that is already listening: `onText` hears
 * each text the topic emits, as it changes, and the promise resolves with
 * how the follow ended. It takes over nothing: no raw mode, no screen, no
 * prompt, so its output pipes into another program. Aborting `signal`
 * closes the connection, and the daemon stops the topic.
 * This module must not import Effect, Instant, or a Program.
 *
 * @example
 * ```typescript
 * const end = await followCliView(socketPath, { topic: 'screen' }, text => {
 *   process.stdout.write(`${text}\n`)
 * })
 * // { _tag: 'Ended' }
 * ```
 */
export const followCliView = async (
  socketPath: string,
  request: CliFollowRequest,
  onText: (text: string) => void,
  options: CliFollowOptions = {},
): Promise<CliFollowEnd> => {
  const socket = await connectSocket(socketPath)
  await writeLine(
    socket,
    JSON.stringify({
      _tag: 'Follow',
      ...request,
      client: request.client ?? cliClient,
    }),
  )
  return new Promise(resolve => {
    const state = { buffer: '', isDone: false }
    const finish = (end: CliFollowEnd): void => {
      if (state.isDone) {
        return
      }
      state.isDone = true
      options.signal?.removeEventListener('abort', onAbort)
      socket.end()
      resolve(end)
    }
    const onAbort = (): void => {
      finish({ _tag: 'Stopped' })
    }
    const hear = (line: string): void => {
      const parsed: unknown = JSON.parse(line)
      if (!isRecord(parsed)) {
        return
      }
      if (parsed['_tag'] === 'Followed' && typeof parsed['text'] === 'string') {
        onText(parsed['text'])
      } else if (parsed['_tag'] === 'FollowEnded') {
        finish({ _tag: 'Ended' })
      } else if (parsed['_tag'] === 'Failed') {
        finish({
          _tag: 'Lost',
          reason:
            typeof parsed['cause'] === 'string'
              ? parsed['cause']
              : daemonWentAway,
        })
      }
    }
    socket.on('data', (chunk: Buffer) => {
      state.buffer = `${state.buffer}${chunk.toString('utf8')}`
      let maybeNewline = newlineIndex(state.buffer)
      while (maybeNewline !== undefined && !state.isDone) {
        const line = state.buffer.slice(0, maybeNewline).replace(/\r$/, '')
        state.buffer = state.buffer.slice(maybeNewline + 1)
        if (line !== '') {
          hear(line)
        }
        maybeNewline = newlineIndex(state.buffer)
      }
    })
    socket.on('close', () => {
      finish({ _tag: 'Lost', reason: daemonWentAway })
    })
    socket.on('error', cause => {
      finish({ _tag: 'Lost', reason: lostReasonOf(cause) })
    })
    if (options.signal?.aborted === true) {
      onAbort()
    } else {
      options.signal?.addEventListener('abort', onAbort)
    }
  })
}

export type RunCliFollowViewOptions = Readonly<{
  socketPath: string
  spawn: () => ChildProcess
  request: CliFollowRequest
  onText: (text: string) => void
  signal?: AbortSignal
  timeoutMs?: number
}>

/**
 * Ensures the daemon, then follows one topic of its Program until the
 * topic ends, the view stops, or the daemon goes away: `books words
 * --follow` prints the paragraph being read each time it changes.
 * This module must not import Effect, Instant, or a Program.
 *
 * @example
 * ```typescript
 * const stopping = new AbortController()
 * process.once('SIGINT', () => stopping.abort())
 * await runCliFollowView({ socketPath, spawn, request: { topic: 'words' }, onText: print, signal: stopping.signal })
 * ```
 */
export const runCliFollowView = async (
  options: RunCliFollowViewOptions,
): Promise<CliFollowEnd> => {
  await ensureCliViewDaemon({
    socketPath: options.socketPath,
    spawn: options.spawn,
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
  })
  return followCliView(
    options.socketPath,
    options.request,
    options.onText,
    options.signal === undefined ? {} : { signal: options.signal },
  )
}

/**
 * What {@link writeCliFollow} needs of the process it writes for: where
 * the texts and a refusal go, the signals that stop it, and the exit code
 * it sets. `process` is one.
 */
export type CliFollowRuntime = {
  readonly stdout: Readonly<{
    write: (text: string) => unknown
    once: (event: 'error', listener: () => void) => unknown
    isTTY?: boolean
    columns?: number
    rows?: number
    on?: (event: 'resize', listener: () => void) => unknown
    off?: (event: 'resize', listener: () => void) => unknown
  }>
  readonly stderr: Readonly<{ write: (text: string) => unknown }>
  readonly once: (event: 'SIGINT' | 'SIGTERM', listener: () => void) => unknown
  exitCode?: number | string | null | undefined
}

export type WriteCliFollowOptions = Readonly<{
  socketPath: string
  request: CliFollowRequest
  spawn?: () => ChildProcess
  timeoutMs?: number
  /**
   * Rewrite the topic in place, for a terminal: each text is written over
   * the last one instead of under it, so a few lines change where they
   * are and nothing scrolls. No key is read and the screen is not taken
   * over; Ctrl-C ends it and leaves the last text. Leave it out for a
   * pipe, which gets every text on its own lines.
   */
  inPlace?: boolean
}>

const fallbackFollowColumns = 80

const fallbackFollowRows = 24

/**
 * Follows one topic and writes it where a pipe can read it: each text on
 * its own lines on stdout, or with `inPlace` each text over the last for
 * a terminal, nothing else, until the topic ends, the
 * process is told to stop (Ctrl-C, SIGTERM), or the reader of the pipe
 * goes away, as after `books follow words | head -3`. Those exit 0. When
 * the daemon refuses the topic or goes away, the reason goes to stderr
 * and the exit code is 1. With `spawn`, a daemon that is not running is
 * started first. This module must not import Effect, Instant, or a
 * Program.
 *
 * @example
 * ```typescript
 * const follow = followArgvOf(process.argv.slice(2))
 * if (follow !== undefined) {
 *   await writeCliFollow({ socketPath, spawn, request: follow })
 * }
 * ```
 */
export const writeCliFollow = async (
  options: WriteCliFollowOptions,
  runtime: CliFollowRuntime = process,
): Promise<void> => {
  const stopping = new AbortController()
  const stop = (): void => {
    stopping.abort()
  }
  runtime.once('SIGINT', stop)
  runtime.once('SIGTERM', stop)
  runtime.stdout.once('error', stop)
  const isInPlace = options.inPlace === true && runtime.stdout.isTTY !== false
  try {
    if (options.spawn !== undefined) {
      await ensureCliViewDaemon({
        socketPath: options.socketPath,
        spawn: options.spawn,
        ...(options.timeoutMs === undefined
          ? {}
          : { timeoutMs: options.timeoutMs }),
      })
    }
    const write = (text: string): void => {
      if (!isInPlace) {
        writeText(runtime.stdout, text)
      } else if (text !== '') {
        runtime.stdout.write(
          formatTerminalFrame(text, {
            columns: runtime.stdout.columns ?? fallbackFollowColumns,
            rows: runtime.stdout.rows ?? fallbackFollowRows,
          }),
        )
      }
    }
    // NOTE: A view that rewrites in place tells the topic so, and its
    // size as facts. When the terminal is resized it asks again with the
    // new size; the next frame is written over the last one.
    const requestNow = (): CliFollowRequest =>
      isInPlace
        ? {
            ...options.request,
            flags: {
              ...options.request.flags,
              'in-place': '1',
              columns: String(runtime.stdout.columns ?? fallbackFollowColumns),
              rows: String(runtime.stdout.rows ?? fallbackFollowRows),
            },
          }
        : options.request
    const followUntilResized = async (): Promise<CliFollowEnd> => {
      const resized = new AbortController()
      const onResize = (): void => {
        resized.abort()
      }
      const onStop = (): void => {
        resized.abort()
      }
      if (isInPlace) {
        runtime.stdout.on?.('resize', onResize)
      }
      stopping.signal.addEventListener('abort', onStop)
      const end = await followCliView(options.socketPath, requestNow(), write, {
        signal: resized.signal,
      })
      stopping.signal.removeEventListener('abort', onStop)
      runtime.stdout.off?.('resize', onResize)
      return end._tag === 'Stopped' && !stopping.signal.aborted
        ? followUntilResized()
        : end
    }
    const end = await followUntilResized()
    if (end._tag === 'Lost') {
      writeText(runtime.stderr, end.reason)
      runtime.exitCode = 1
    } else {
      runtime.exitCode = 0
    }
  } catch (cause) {
    const failed = cliViewFailed(cause)
    writeText(runtime.stderr, failed.stderr)
    runtime.exitCode = failed.exitCode
  }
}

// TERMINAL UI

/** How a terminal UI view ended: the person quit, or the daemon went away. */
export type CliTuiViewEnd =
  | Readonly<{ _tag: 'Quit' }>
  | Readonly<{ _tag: 'Lost'; reason: string }>

/** The keyboard a terminal UI view reads: a terminal's stdin. */
export type CliTuiInput = NodeJS.ReadableStream &
  Readonly<{
    isTTY?: boolean
    setRawMode?: (mode: boolean) => unknown
  }>

/** The screen a terminal UI view paints: a terminal's stdout. */
export type CliTuiOutput = NodeJS.WritableStream &
  Readonly<{
    rows?: number
    columns?: number
  }>

export type RunCliTuiViewOptions = Readonly<{
  socketPath: string
  spawn: () => ChildProcess
  refreshMs?: number
  timeoutMs?: number
  input?: CliTuiInput
  output?: CliTuiOutput
  /**
   * Whether this view's output takes color: a terminal, with color not
   * refused. The view says so with every frame it asks for, and a Program
   * that paints from a theme inks the frame; otherwise frames are plain.
   */
  isColor?: boolean
  /**
   * The terminal's ground from `COLORFGBG`, when set, so the daemon inks
   * quiet text for the terminal's actual background.
   */
  terminalGround?: string
}>

type KeypressKey = Readonly<{
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
}>

const enterScreen = '\u001b[?1049h\u001b[?25l'

const leaveScreen = '\u001b[?25h\u001b[?1049l'

const tuiRefreshMs = 500

const escapeCodeTimeoutMs = 50

const viewIdLength = 8

const fallbackRows = 24

const fallbackColumns = 80

const flagOf = (isHeld: boolean | undefined): string => (isHeld ? '1' : '0')

/**
 * Runs a terminal UI for a Program its daemon holds, so the UI is a view
 * and the Program keeps running when it closes, such as a player that goes
 * on playing in the background after `q`. It paints the daemon's frame on
 * the terminal's own screen, restored on quit, sends each key to the
 * daemon, which routes it through the Program's interaction and answers
 * with the next frame, and asks for a fresh frame twice a second and when
 * the terminal resizes, so the words being spoken move along. Ctrl-C
 * quits, and so does a key the daemon answers with `{ outcome: 'Quit' }`.
 * This module must not import Effect, Instant, or a Program.
 *
 * @example
 * ```typescript
 * const end = await runCliTuiView({ socketPath, spawn: () => spawnCliViewDaemon({ scriptPath }) })
 * // { _tag: 'Quit' } after `q`; the daemon still plays
 * ```
 */
export const runCliTuiView = async (
  options: RunCliTuiViewOptions,
): Promise<CliTuiViewEnd> => {
  await ensureCliViewDaemon({
    socketPath: options.socketPath,
    spawn: options.spawn,
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
  })
  const input: CliTuiInput = options.input ?? process.stdin
  const output: CliTuiOutput = options.output ?? process.stdout
  return new Promise(resolve => {
    const state = {
      lastFrame: '',
      pending: Promise.resolve(),
      isPolling: false,
      isDone: false,
    }
    const keyboard = createInterface({
      input,
      escapeCodeTimeout: escapeCodeTimeoutMs,
    })
    emitKeypressEvents(input, keyboard)
    const viewId = randomUUID().slice(0, viewIdLength)
    const sizeFlags = (): Readonly<Record<string, string>> => ({
      view: 'tui',
      viewId,
      rows: String(output.rows ?? fallbackRows),
      columns: String(output.columns ?? fallbackColumns),
      ...(options.isColor === true ? { color: '1' } : {}),
      ...(options.terminalGround !== undefined && options.terminalGround !== ''
        ? { 'terminal-ground': options.terminalGround }
        : {}),
    })
    const finish = (end: CliTuiViewEnd): void => {
      if (state.isDone) {
        return
      }
      state.isDone = true
      clearInterval(refresh)
      input.off('keypress', onKeypress)
      output.off('resize', onResize)
      input.setRawMode?.(false)
      keyboard.close()
      input.pause()
      output.write(leaveScreen)
      resolve(end)
    }
    const draw = (painted: CliViewPainted): void => {
      if (state.isDone) {
        return
      }
      if (painted.stdout !== state.lastFrame) {
        state.lastFrame = painted.stdout
        output.write(
          formatTerminalFrame(painted.stdout, {
            columns: output.columns ?? fallbackColumns,
            rows: output.rows ?? fallbackRows,
          }),
        )
      }
      if (painted.flags?.['outcome'] === 'Quit') {
        finish({ _tag: 'Quit' })
      }
    }
    const ask = (request: CliViewRequest): Promise<void> => {
      const asked = state.pending.then(async () => {
        if (state.isDone) {
          return
        }
        try {
          draw(
            await askPainted(options.socketPath, {
              ...request,
              client: tuiClient,
            }),
          )
        } catch (cause) {
          finish({ _tag: 'Lost', reason: lostReasonOf(cause) })
        }
      })
      state.pending = asked
      return asked
    }
    const poll = (): void => {
      if (state.isPolling || state.isDone) {
        return
      }
      state.isPolling = true
      void ask({ _tag: 'Show', flags: sizeFlags() }).finally(() => {
        state.isPolling = false
      })
    }
    const onKeypress = (
      sequence: string | undefined,
      key: KeypressKey | undefined,
    ): void => {
      if (key?.ctrl === true && key.name === 'c') {
        finish({ _tag: 'Quit' })
        return
      }
      void ask({
        _tag: 'Do',
        token: 'key',
        flags: {
          ...sizeFlags(),
          name: key?.name ?? '',
          sequence: key?.sequence ?? sequence ?? '',
          meta: flagOf(key?.meta),
          ctrl: flagOf(key?.ctrl),
          shift: flagOf(key?.shift),
        },
      })
    }
    const onResize = (): void => {
      state.lastFrame = ''
      void ask({ _tag: 'Show', flags: sizeFlags() })
    }
    input.setRawMode?.(true)
    input.on('keypress', onKeypress)
    output.on('resize', onResize)
    input.resume()
    output.write(enterScreen)
    const refresh = setInterval(poll, options.refreshMs ?? tuiRefreshMs)
    void ask({ _tag: 'Show', flags: sizeFlags() })
  })
}
