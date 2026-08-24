import { Effect, Exit, Layer, Option, Scope } from 'effect'
import { Processor, Program, Runtime } from 'foldkit'

import { type AppMessage, type AppModel } from './app.js'
import { type Actions, puzzleSyncedFactHandles } from './factHandles.js'
import { InstantEngine } from './instantEngine.js'
import { SyncedPuzzle } from './synced.js'

/** One live synced Puzzle. Hosts subscribe. Instant stays in Runtime.start. */
export type SyncedPuzzleHandle = Readonly<{
  actions: () => Actions
  lastWrite: () => Option.Option<Runtime.SyncWriteResult>
  readModel: () => Program.SyncedModel<AppModel, AppMessage>
  send: (message: AppMessage) => void
  stop: () => Promise<void>
  subscribe: (listener: () => void) => () => void
}>

/** How long Runtime.start may stay Starting before the handle fails. */
export const syncedHandleSettleMs = 30_000

/**
 * Starts SyncedPuzzle on a Scope. Long-lived Hosts must hold this handle
 * and call stop. Do not wrap a long-lived Client in Effect.scoped.
 */
export const startSyncedPuzzleHandle = (
  sync: Runtime.SyncEngine,
  options?: { settleMs?: number },
): SyncedPuzzleHandle => {
  const scope = Effect.runSync(Scope.make())
  let started:
    | Runtime.StartedProgram<
        Program.SyncedModel<AppModel, AppMessage>,
        Program.SyncedMessage<AppModel, AppMessage>
      >
    | undefined
  const listeners = new Set<() => void>()
  let unsubscribeStarted: (() => void) | undefined
  let isStopped = false
  let cachedModel: Program.SyncedModel<AppModel, AppMessage> =
    SyncedPuzzle.Starting()
  const settleMs = options?.settleMs ?? syncedHandleSettleMs
  let settleTimer: ReturnType<typeof setTimeout> | undefined

  const notify = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  const clearSettleTimer = (): void => {
    if (settleTimer === undefined) {
      return
    }
    clearTimeout(settleTimer)
    settleTimer = undefined
  }

  const failSettle = (): void => {
    settleTimer = undefined
    if (cachedModel._tag !== 'Starting') {
      return
    }
    cachedModel = SyncedPuzzle.Failed({
      error: SyncedPuzzle.TransportFailed({
        what: 'This Processor never became Ready.',
        meaning: 'Runtime.start did not settle before the handle timeout.',
        fix: 'Check Instant subscribe and try again.',
        cause: 'start did not settle',
      }),
    })
    notify()
  }

  settleTimer = setTimeout(failSettle, settleMs)

  const opening = Effect.runPromise(
    Runtime.start({
      program: SyncedPuzzle,
      sync,
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )

  opening.then(
    runtime => {
      if (cachedModel._tag !== 'Starting') {
        return
      }
      clearSettleTimer()
      started = runtime
      cachedModel = runtime.readModel()
      unsubscribeStarted = runtime.observeModel(next => {
        cachedModel = next
        notify()
      })
      notify()
    },
    error => {
      if (cachedModel._tag === 'Ready') {
        return
      }
      if (cachedModel._tag !== 'Starting') {
        return
      }
      clearSettleTimer()
      cachedModel = SyncedPuzzle.Failed({
        error: SyncedPuzzle.TransportFailed({
          what: 'This Processor could not start.',
          meaning: 'Runtime.start failed before Instant returned a snapshot.',
          fix: 'Check Instant and try again.',
          cause:
            error instanceof Error ? error.message : 'Runtime.start failed.',
        }),
      })
      notify()
    },
  )

  return {
    actions: () => {
      const synced =
        started === undefined ? SyncedPuzzle.Starting() : started.readModel()
      return puzzleSyncedFactHandles(synced, message => {
        started?.send(message)
      })
    },
    lastWrite: () => {
      if (started === undefined) {
        return Option.none()
      }
      return started.lastWrite()
    },
    readModel: () => cachedModel,
    send: message => {
      if (started === undefined) {
        return
      }
      started.send(message)
      cachedModel = started.readModel()
      notify()
    },
    stop: () => {
      if (isStopped) {
        return Promise.resolve()
      }
      isStopped = true
      clearSettleTimer()
      if (unsubscribeStarted !== undefined) {
        unsubscribeStarted()
      }
      listeners.clear()
      return Effect.runPromise(Scope.close(scope, Exit.void))
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Isolated Memory engine for one Host. The process dies with the tape. */
export const memorySyncedEngine = (
  processor: Processor.Host.Host,
): Runtime.MemoryEngine => Runtime.Memory({ processor })

/**
 * Memory Instant Layer. Tests use this. PUZZLE_TAPE=memory selects
 * Memory inside NodeLive and BrowserLive.
 *
 * Caller supplies Host. Memory does not pick a surface.
 */
export const MemoryLive = (
  processor: Processor.Host.Host,
): Layer.Layer<InstantEngine> =>
  Layer.succeed(InstantEngine, memorySyncedEngine(processor))

export { InstantEngine }

/** Prints a Failed Instant error. Does not print `error._tag`. */
export const describePuzzleSyncError = (
  error: Program.SyncError<AppMessage>,
): string => Program.describeSyncError(error, message => message._tag)

/** Waits until the handle is Ready or Failed. */
export const waitForSyncedHandle = (
  handle: SyncedPuzzleHandle,
  timeoutMs = 2_000,
): Promise<Program.SyncedModel<AppModel, AppMessage>> =>
  new Promise((resolve, reject) => {
    const finish = (model: Program.SyncedModel<AppModel, AppMessage>): void => {
      if (model._tag === 'Starting') {
        return
      }
      clearTimeout(timeout)
      stop()
      resolve(model)
    }
    const timeout = setTimeout(() => {
      stop()
      reject(new Error('Timed out waiting for Ready or Failed.'))
    }, timeoutMs)
    const stop = handle.subscribe(() => {
      finish(handle.readModel())
    })
    finish(handle.readModel())
  })

/** Waits until Instant reports a write after send. */
export const waitForSyncedHandleWrite = (
  handle: SyncedPuzzleHandle,
): Promise<Option.Option<Runtime.SyncWriteResult>> =>
  new Promise((resolve, reject) => {
    const finish = (): void => {
      const write = handle.lastWrite()
      if (Option.isNone(write)) {
        return
      }
      clearTimeout(timeout)
      clearInterval(interval)
      stop()
      resolve(write)
    }
    const timeout = setTimeout(() => {
      clearInterval(interval)
      stop()
      reject(new Error('Timed out waiting for Instant write.'))
    }, 2000)
    const interval = setInterval(finish, 10)
    const stop = handle.subscribe(() => {
      finish()
    })
    finish()
  })
