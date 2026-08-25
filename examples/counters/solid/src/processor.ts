import {
  type Model,
  MultipleCountersProgram,
  navigationToPath,
} from 'counters-core-example'
import {
  type CountersBrowserHost,
  CountersDemoSignInError,
  type CountersTape,
  type CountersWindowActions,
  type CountersWindowModel,
  type CountersWindowRuntime,
  type CountersWindowTape,
  countersDemoEmail,
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openBrowserCountersTape,
  openCountersTapeRuntime,
  startCountersWindowRuntime,
} from 'counters-instant-example'
import {
  FailedCountersSession,
  SignedInCountersSession,
} from 'counters-instant-example/native'
import { Effect, Exit, Scope } from 'effect'

const missingAppIdError =
  'VITE_INSTANT_APP_ID is missing. Start through the Instant demo wrapper.'

let installedRuntime: CountersWindowRuntime | undefined

const failedSessionError = (error: unknown): string => {
  if (error instanceof CountersDemoSignInError) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message !== ''
  ) {
    return error.message
  }
  return 'Instant could not sign in.'
}

const openSolidWindowTape = (
  tape: CountersTape,
): Promise<CountersWindowTape> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      const opened = yield* openCountersTapeRuntime(
        tape,
        instantCountersResources,
      )
      yield* observeRemoteCountersTape(
        tape,
        opened.runtime,
        countersProcessorIds.solid,
      ).pipe(Effect.forkChild)
      return {
        readModel: () => opened.runtime.readModel(),
        send: opened.sendClientInput,
        stop: () => {
          Effect.runFork(Scope.close(scope, Exit.void))
        },
        subscribe: (listener: (model: Model) => void) =>
          opened.runtime.observeModel(listener),
      }
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}

/** Starts an in-process Multiple Counters Processor. The window does not call this. */
export const startCountersProcessor = (): Promise<CountersBrowserHost> => {
  const [initialModel] = MultipleCountersProgram.init()
  let model = initialModel
  const listeners = new Set<(next: Model) => void>()
  return Promise.resolve({
    readModel: () => model,
    send: message => {
      const [nextModel] = MultipleCountersProgram.update(model, message)
      model = nextModel
      listeners.forEach(listener => {
        listener(model)
      })
      return Promise.resolve()
    },
    stop: () => {
      listeners.clear()
      return Promise.resolve()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  })
}

/** Starts Instant for the Solid window. Failed sign-in is a snapshot. */
export const startSolidCountersWindow = (): CountersWindowRuntime => {
  let openedTape: CountersTape | undefined
  return startCountersWindowRuntime({
    openTape: () => {
      if (openedTape === undefined) {
        return Promise.reject(
          new Error('Instant could not open the Counters tape.'),
        )
      }
      return openSolidWindowTape(openedTape)
    },
    signIn: async () => {
      openedTape = undefined
      const appId = import.meta.env['VITE_INSTANT_APP_ID']
      if (typeof appId !== 'string' || appId === '') {
        return FailedCountersSession.make({ error: missingAppIdError })
      }
      try {
        const tape = await Effect.runPromise(
          openBrowserCountersTape(appId, countersProcessorIds.solid),
        )
        openedTape = tape
        return SignedInCountersSession.make({
          userId: countersDemoEmail,
        })
      } catch (error) {
        return FailedCountersSession.make({
          error: failedSessionError(error),
        })
      }
    },
  })
}

/** Installs a Counters window runtime. Tests use this. The window does not. */
export const installCountersWindowRuntime = (
  runtime: CountersWindowRuntime,
): void => {
  installedRuntime = runtime
}

const getCountersWindowRuntime = (): CountersWindowRuntime => {
  if (installedRuntime !== undefined) {
    return installedRuntime
  }
  const runtime = startSolidCountersWindow()
  installedRuntime = runtime
  return runtime
}

/**
 * Subscribes to window snapshots. Solid components call this once per
 * mount; snapshot identity changes drive fine-grained re-renders.
 */
export const subscribeToSnapshots = (
  uri: string,
  onSnapshot: (snapshot: CountersWindowModel) => void,
): (() => void) => {
  const runtime = getCountersWindowRuntime()
  let active = true
  const unsubscribe = runtime.subscribe(() => {
    if (active) {
      onSnapshot(runtime.getSnapshot(uri))
    }
  })
  onSnapshot(runtime.getSnapshot(uri))
  return () => {
    active = false
    unsubscribe()
  }
}

/** Valid buttons for one window URI. Instant stays in the Host. */
export const useActions = (uri: string): CountersWindowActions => {
  const runtime = getCountersWindowRuntime()
  return runtime.actions(uri)
}

/**
 * The window runtime projected for carrier reconciliation: router-style
 * hosts read Program navigation and send matching actions when the
 * carrier moves underneath the Program (browser back/forward).
 */
export const countersWindowCarrier = (): {
  readonly programPath: () => string
  readonly actions: (uri: string) => CountersWindowActions
} => {
  const runtime = getCountersWindowRuntime()
  return {
    programPath: () => navigationToPath(runtime.readModel().navigation),
    actions: runtime.actions,
  }
}
