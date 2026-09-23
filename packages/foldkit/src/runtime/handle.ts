import { Effect, Exit, Option, Scope } from 'effect'

import type { ProgramHandle } from '../interaction/bind.js'
import type { MessageOf, ModelOf } from '../program/program.js'
import type {
  SyncChild,
  SyncProgram,
  SyncedMessage,
  SyncedModel,
} from '../program/sync.js'
import type { SessionPolicy } from '../synchronization/synchronization.js'
import { type StartedProgram, start } from './start.js'
import type { SyncEngine } from './syncEngine.js'

/** The handle {@link startHandle} returns for one synced Program. */
export type SyncedHandle<Child extends SyncChild> = ProgramHandle<
  SyncedModel<ModelOf<Child>, MessageOf<Child>>,
  SyncedMessage<ModelOf<Child>, MessageOf<Child>> & Readonly<{ _tag: string }>
>

const causeOf = (error: unknown): string => {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  if (typeof error === 'object' && error !== null && '_tag' in error) {
    return String(error._tag)
  }
  return 'Runtime.start failed.'
}

/**
 * Starts a synced Program for a long-lived Client and returns a plain
 * handle. The Model is Starting until the first snapshot, then Ready. If
 * the runtime cannot start, the Model becomes Failed with the cause. It
 * never invents a count.
 *
 * Call `stop` when the Client goes away; it closes the runtime's Scope.
 *
 * @example
 * ```typescript
 * const handle = Runtime.startHandle({
 *   program: SyncedCounter,
 *   sync: Runtime.Memory({ processor: 'react-4f2a' }),
 * })
 * handle.subscribe(() => paint(handle.readModel()))
 * ```
 */
export const startHandle = <Child extends SyncChild>(
  config: Readonly<{
    program: SyncProgram<Child>
    sync: SyncEngine
    policy?: SessionPolicy
  }>,
): SyncedHandle<Child> => {
  type Model = SyncedModel<ModelOf<Child>, MessageOf<Child>>
  type Message = SyncedMessage<ModelOf<Child>, MessageOf<Child>> &
    Readonly<{ _tag: string }>

  const program = config.program
  const scope = Effect.runSync(Scope.make())
  const listeners = new Set<() => void>()
  const writesInFlight = new Set<Promise<unknown>>()
  let cachedModel: Model = program.init()[0]
  let maybeStarted: Option.Option<StartedProgram<Model, Message>> =
    Option.none()
  let isStopped = false

  const notify = (): void => {
    listeners.forEach(listener => {
      listener()
    })
  }

  const opening = Effect.runPromise(
    start({
      program,
      sync: config.sync,
      ...(config.policy === undefined ? {} : { policy: config.policy }),
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )

  opening.then(
    started => {
      if (isStopped) {
        return
      }
      maybeStarted = Option.some(started)
      cachedModel = started.readModel()
      started.observeModel(next => {
        cachedModel = next
        notify()
      })
      notify()
    },
    error => {
      if (isStopped) {
        return
      }
      cachedModel = program.Failed({
        error: program.TransportFailed({
          what: 'This Processor could not start.',
          meaning: 'Runtime.start failed before the first snapshot.',
          fix: 'Check the sync engine and the session policy, then try again.',
          cause: causeOf(error),
        }),
      })
      notify()
    },
  )

  return {
    readModel: () => cachedModel,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      if (Option.isSome(maybeStarted)) {
        const started = maybeStarted.value
        const write = Effect.runPromise(started.run(message)).finally(() => {
          writesInFlight.delete(write)
        })
        writesInFlight.add(write)
        cachedModel = started.readModel()
        notify()
      }
    },
    stop: async () => {
      if (isStopped) {
        return
      }
      isStopped = true
      listeners.clear()
      await Promise.allSettled([...writesInFlight])
      await Effect.runPromise(Scope.close(scope, Exit.void))
    },
  }
}
