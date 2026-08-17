import { Array, Effect, Exit, Option, Scope } from 'effect'
import { Processor, Program, Runtime } from 'foldkit'

import { Decrement, Increment, type Message, Reset } from './message.js'
import { Model } from './model.js'
import { counterValid } from './program.js'
import { SyncedCounter } from './synced.js'

/** Buttons for one synced Counter. There is no sign-in. */
export type SyncedCounterActions = Readonly<{
  clickedDecrement: () => void
  clickedIncrement: () => void
  clickedReset: () => void
}>

/** One live synced Counter. Hosts subscribe. Instant stays in Runtime.start. */
export type SyncedCounterHandle = Readonly<{
  actions: () => SyncedCounterActions
  lastWrite: () => Option.Option<Runtime.SyncWriteResult>
  readModel: () => Program.SyncedModel<Model, Message>
  send: (message: Message) => void
  stop: () => void
  subscribe: (listener: () => void) => () => void
}>

const idleActions: SyncedCounterActions = {
  clickedDecrement: () => {},
  clickedIncrement: () => {},
  clickedReset: () => {},
}

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
        Program.SyncedModel<Model, Message>,
        Program.SyncedMessage<Model, Message>
      >
    | undefined
  const listeners = new Set<() => void>()
  let unsubscribeStarted: (() => void) | undefined
  let cachedModel: Program.SyncedModel<Model, Message> =
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
      const model =
        started === undefined ? SyncedCounter.Starting() : started.readModel()
      if (model._tag !== 'Ready') {
        return idleActions
      }
      return {
        clickedDecrement: () => {
          started?.send(Decrement())
        },
        clickedIncrement: () => {
          started?.send(Increment())
        },
        clickedReset: () => {
          const isValid = Array.some(
            counterValid(Model.make({ count: model.count }), {}),
            item => item.token === 'reset' && item.valid,
          )
          if (isValid) {
            started?.send(Reset())
          }
        },
      }
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
    },
    stop: () => {
      if (unsubscribeStarted !== undefined) {
        unsubscribeStarted()
      }
      listeners.clear()
      Effect.runFork(Scope.close(scope, Exit.void))
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

/** Prints a Failed Instant error. Does not print `error._tag`. */
export const describeCounterSyncError = (
  error: Program.SyncError<Message>,
): string => Program.describeSyncError(error, message => message._tag)

/** Waits until the handle is Ready or Failed. */
export const waitForSyncedHandle = (
  handle: SyncedCounterHandle,
): Promise<Program.SyncedModel<Model, Message>> =>
  new Promise((resolve, reject) => {
    const finish = (model: Program.SyncedModel<Model, Message>): void => {
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
