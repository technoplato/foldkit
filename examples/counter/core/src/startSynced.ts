import { Effect, Exit, Layer, Option, Scope } from 'effect'
import { Processor, Program, Runtime } from 'foldkit'

import { type AppMessage, type AppModel } from './app.js'
import { type Actions, counterSyncedFactHandles } from './factHandles.js'
import { InstantEngine } from './instantEngine.js'
import { SyncedCounter } from './synced.js'

/** One live synced Counter. Hosts subscribe. Instant stays in Runtime.start. */
export type SyncedCounterHandle = Readonly<{
  actions: () => Actions
  lastWrite: () => Option.Option<Runtime.SyncWriteResult>
  readModel: () => Program.SyncedModel<AppModel, AppMessage>
  send: (message: AppMessage) => void
  stop: () => Promise<void>
  subscribe: (listener: () => void) => () => void
}>

/**
 * Starts SyncedCounter on a Scope. Long-lived Hosts must hold this handle
 * and call stop. Do not wrap a long-lived Client in Effect.scoped.
 */
export const startSyncedCounterHandle = (
  sync: Runtime.SyncEngine,
): SyncedCounterHandle => {
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
    SyncedCounter.Starting()

  const notify = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  const opening = Effect.runPromise(
    Runtime.start({
      program: SyncedCounter,
      sync,
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )

  opening.then(
    runtime => {
      started = runtime
      cachedModel = runtime.readModel()
      unsubscribeStarted = runtime.observeModel(next => {
        cachedModel = next
        notify()
      })
      notify()
    },
    error => {
      cachedModel = SyncedCounter.Failed({
        error: SyncedCounter.TransportFailed({
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
        started === undefined ? SyncedCounter.Starting() : started.readModel()
      return counterSyncedFactHandles(synced, message => {
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

/** Isolated Memory engine for one Host. The process dies with the count. */
export const memorySyncedEngine = (
  processor: Processor.Host.Host,
): Runtime.MemoryEngine => Runtime.Memory({ processor })

/**
 * Memory Instant Layer. Tests use this. COUNTER_TAPE=memory selects
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
export const describeCounterSyncError = (
  error: Program.SyncError<AppMessage>,
): string => Program.describeSyncError(error, message => message._tag)

/** Waits until the handle is Ready or Failed. */
export const waitForSyncedHandle = (
  handle: SyncedCounterHandle,
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
    }, 2000)
    const stop = handle.subscribe(() => {
      finish(handle.readModel())
    })
    finish(handle.readModel())
  })

/** Waits until Instant reports a write after send. */
export const waitForSyncedHandleWrite = (
  handle: SyncedCounterHandle,
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
