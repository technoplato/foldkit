#!/usr/bin/env node
/**
 * Long-lived Counter CLI Processor.
 *
 * The non-captive CLI is a view of this process. First `show` or `do`
 * starts it. Later commands talk to this socket. Paint stays here.
 *
 * Do sends, waits for the local Instant write, then reads Ready. It does
 * not wait for Instant to echo this Processor's own row.
 *
 * A leftover daemon keeps the old wait. Stop it with `stopCliDaemon` on
 * the socket from `cliDaemonSocketPath`, or kill the pid in
 * `/tmp/fkc-*.pid`. The next `show` or `do` starts this file again.
 */
import {
  Message,
  Model,
  NodeLive,
  startLiveCounter,
  tokenOf,
} from 'counter-core-example'
import { Effect, Option } from 'effect'
import { Processor, Program } from 'foldkit'
import {
  CliDaemonError,
  type CliDaemonFlags,
  type CliDaemonPaintedResult,
  listenCliDaemon,
} from 'foldkit/cli'

import { NodeRuntime } from '@effect/platform-node'

import { CounterCliError, readyCount } from './cliError.js'
import {
  occupancyToOpen,
  paintDoExecution,
  paintPaletteExecution,
  paintShowExecution,
  parseDevice,
  resolveHostDo,
  resolveHostSpoken,
} from './paintHost.js'
import {
  paintScreenDo,
  paintScreenShow,
  resolveScreenDo,
} from './paintScreen.js'
import { counterCliSocketPath, settleAfterSend } from './session.js'
import { withCliTrace } from './trace.js'

const daemonReadyTimeoutMs = 20_000

const waitReady = (
  handle: ReturnType<typeof startLiveCounter>,
): Effect.Effect<void, CounterCliError> =>
  Effect.tryPromise({
    try: () =>
      new Promise((resolve, reject) => {
        const finish = (): void => {
          const model = handle.readModel()
          if (model._tag === 'Starting') {
            return
          }
          clearTimeout(timeout)
          stop()
          if (model._tag === 'Failed') {
            reject(new Error('CLI daemon Instant failed.'))
            return
          }
          resolve(undefined)
        }
        const timeout = setTimeout(() => {
          stop()
          reject(new Error('CLI daemon timed out waiting for Ready.'))
        }, daemonReadyTimeoutMs)
        const stop = handle.subscribe(() => {
          finish()
        })
        finish()
      }),
    catch: error =>
      new CounterCliError({
        message:
          error instanceof Error
            ? error.message
            : 'CLI daemon Instant stayed Starting.',
      }),
  }).pipe(Effect.as(undefined))

const toDaemonError = (error: { readonly message: string }): CliDaemonError =>
  new CliDaemonError({ message: error.message })

const linkOf = (
  write: Option.Option<{
    readonly link: 'offline' | 'queued' | 'delivered'
  }>,
): 'offline' | 'queued' | 'delivered' => {
  if (Option.isNone(write)) {
    return 'offline'
  }
  return write.value.link
}

const isScreenView = (flags: CliDaemonFlags): boolean =>
  flags['view'] === 'screen'

const paintedOf = (options: {
  readonly stdout: string
  readonly exitCode: number
  readonly stderr?: string
}): CliDaemonPaintedResult => ({
  stdout: options.stdout,
  exitCode: options.exitCode,
  ...(options.stderr === undefined || options.stderr === ''
    ? {}
    : { stderr: options.stderr }),
})

const showHost = (
  handle: ReturnType<typeof startLiveCounter>,
  flags: CliDaemonFlags,
): Effect.Effect<CliDaemonPaintedResult, CliDaemonError> =>
  Effect.gen(function* () {
    if (flags['palette'] === '1') {
      const model = yield* readyCount(handle.readModel())
      return paintedOf(paintPaletteExecution(model))
    }
    const device = parseDevice(flags['device'])
    if (device._tag === 'Failed') {
      return paintedOf({ stdout: '', stderr: device.error, exitCode: 1 })
    }
    const maybeOpen = occupancyToOpen(
      device._tag === 'None' ? undefined : device.device,
      flags['path'],
    )
    if (Option.isSome(maybeOpen)) {
      handle.send(maybeOpen.value)
      yield* settleAfterSend(
        handle,
        'CLI daemon could not append the Instant tape.',
      )
    }
    const model = yield* readyCount(handle.readModel())
    const painted = paintShowExecution(model, undefined, undefined)
    return paintedOf(painted)
  }).pipe(Effect.mapError(toDaemonError), Effect.withSpan('cli.paint'))

const doHost = (
  handle: ReturnType<typeof startLiveCounter>,
  token: string,
  flags: CliDaemonFlags,
): Effect.Effect<CliDaemonPaintedResult, CliDaemonError> =>
  Effect.gen(function* () {
    const initialModel = yield* readyCount(handle.readModel())
    const via = flags['via']
    const resolved =
      via === 'spoken'
        ? resolveHostSpoken(token, initialModel)
        : resolveHostDo(token, initialModel)
    if (resolved._tag === 'Unknown') {
      return paintedOf({
        stdout: '',
        stderr: resolved.message,
        exitCode: 1,
      })
    }
    if (resolved._tag === 'Invalid') {
      return paintedOf(resolved.execution)
    }
    if (via === 'palette') {
      handle.send(Program.ActionMenuCommandTriggered())
      handle.send(
        Program.ActionCommandMenuSelectionMade({
          token: tokenOf(resolved.action),
        }),
      )
    } else {
      handle.send(resolved.action())
    }
    const settled = yield* settleAfterSend(
      handle,
      'CLI daemon could not append the Instant tape.',
    )
    const receiptVia =
      via === 'palette' ? 'palette' : via === 'spoken' ? 'spoken' : 'argv'
    return paintedOf(
      paintDoExecution(
        initialModel,
        resolved.action,
        tokenOf(resolved.action),
        settled.model,
        linkOf(settled.write),
        receiptVia,
      ),
    )
  }).pipe(Effect.mapError(toDaemonError), Effect.withSpan('cli.paint'))

const showScreen = (
  handle: ReturnType<typeof startLiveCounter>,
): Effect.Effect<CliDaemonPaintedResult, CliDaemonError> =>
  readyCount(handle.readModel()).pipe(
    Effect.map(model => paintedOf(paintScreenShow(model))),
    Effect.mapError(toDaemonError),
    Effect.withSpan('cli.paint'),
  )

const doScreen = (
  handle: ReturnType<typeof startLiveCounter>,
  token: string,
): Effect.Effect<CliDaemonPaintedResult, CliDaemonError> =>
  Effect.gen(function* () {
    const initialModel = yield* readyCount(handle.readModel())
    const resolved = resolveScreenDo(token, initialModel)
    if (resolved._tag === 'Failed') {
      return paintedOf(resolved.execution)
    }
    handle.send(resolved.action())
    const settled = yield* settleAfterSend(
      handle,
      'CLI daemon could not append the Instant tape.',
    )
    return paintedOf(paintScreenDo(resolved.action, settled.model))
  }).pipe(Effect.mapError(toDaemonError), Effect.withSpan('cli.paint'))

const runDaemon = Effect.gen(function* () {
  const handle = startLiveCounter(NodeLive(Processor.Host.Cli()))
  yield* waitReady(handle)
  yield* listenCliDaemon({
    socketPath: counterCliSocketPath(),
    Model,
    Message,
    surface: {
      read: () =>
        readyCount(handle.readModel()).pipe(Effect.mapError(toDaemonError)),
      run: message =>
        Effect.gen(function* () {
          const previous = yield* readyCount(handle.readModel())
          handle.send(message)
          const settled = yield* settleAfterSend(
            handle,
            'CLI daemon could not append the Instant tape.',
          )
          return { previous, model: settled.model }
        }).pipe(Effect.mapError(toDaemonError)),
      show: flags =>
        isScreenView(flags) ? showScreen(handle) : showHost(handle, flags),
      do: (token, flags) =>
        isScreenView(flags)
          ? doScreen(handle, token)
          : doHost(handle, token, flags),
    },
  }).pipe(
    Effect.mapError(
      error =>
        new CounterCliError({
          message: error.message,
        }),
    ),
  )
})

runDaemon.pipe(
  Effect.catchTag('CounterCliError', error =>
    Effect.sync(() => {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    }),
  ),
  Effect.withSpan('counter.daemon'),
  withCliTrace,
  NodeRuntime.runMain,
)
