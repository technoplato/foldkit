/// <reference types="node" />
import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { type Socket, connect } from 'node:net'
import { createInterface, emitKeypressEvents } from 'node:readline'

import {
  cliDaemonLockPath,
  removeCliDaemonFiles,
  removeCliDaemonSocketAndPid,
  tryAcquireCliDaemonLock,
} from './paths.js'

export {
  cliDaemonLockPath,
  cliDaemonPidPath,
  cliDaemonSocketPath,
  removeCliDaemonFiles,
} from './paths.js'
export { parseProgramArgv, type ProgramArgv } from './argv.js'

/** Ready wait copied from the Effect client so this file never imports Effect. */
export const cliViewReadyTimeoutMs = 20_000

/** Show or Do a slim view sends. Paint stays in the daemon. */
export type CliViewRequest =
  | Readonly<{
      readonly _tag: 'Show'
      readonly flags?: Readonly<Record<string, string>>
    }>
  | Readonly<{
      readonly _tag: 'Do'
      readonly token: string
      readonly flags?: Readonly<Record<string, string>>
    }>

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

/** Starts a detached daemon with this process's runtime (Bun or Node). */
export const spawnCliViewDaemon = (options: {
  readonly scriptPath: string
  readonly argv?: ReadonlyArray<string>
  readonly env?: Readonly<Record<string, string | undefined>>
}): ChildProcess => {
  const argv = options.argv ?? []
  const child = spawn(process.execPath, [options.scriptPath, ...argv], {
    detached: true,
    env: options.env ?? process.env,
    stdio: 'ignore',
  })
  child.unref()
  return child
}

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
    options.spawn()
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
  await writeLine(socket, JSON.stringify(request))
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

const writeText = (stream: NodeJS.WriteStream, text: string): void => {
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

const clearScreen = '\u001b[H\u001b[2J'

const tuiRefreshMs = 500

const escapeCodeTimeoutMs = 50

const viewIdLength = 8

const fallbackRows = 24

const fallbackColumns = 80

const flagOf = (isHeld: boolean | undefined): string => (isHeld ? '1' : '0')

const lostReasonOf = (cause: unknown): string =>
  cause instanceof Error && cause.message !== ''
    ? cause.message
    : daemonUnreachable

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
        output.write(`${clearScreen}${painted.stdout}`)
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
          draw(await askPainted(options.socketPath, request))
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
