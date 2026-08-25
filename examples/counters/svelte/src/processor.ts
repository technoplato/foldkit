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
import { createSubscriber } from 'svelte/reactivity'

const missingAppIdError =
  'VITE_INSTANT_APP_ID is missing. Start through the Instant demo wrapper.'

let installedRuntime: CountersWindowRuntime | undefined
let subscribeToRuntime: (() => void) | undefined

const bindRuntimeSubscriber = (runtime: CountersWindowRuntime): void => {
  subscribeToRuntime = createSubscriber(update => runtime.subscribe(update))
}

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

const openSvelteWindowTape = (
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
        countersProcessorIds.svelte,
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

/** Starts Instant for the Svelte window. Failed sign-in is a snapshot. */
export const startSvelteCountersWindow = (): CountersWindowRuntime => {
  let openedTape: CountersTape | undefined
  return startCountersWindowRuntime({
    openTape: () => {
      if (openedTape === undefined) {
        return Promise.reject(
          new Error('Instant could not open the Counters tape.'),
        )
      }
      return openSvelteWindowTape(openedTape)
    },
    signIn: async () => {
      openedTape = undefined
      const appId = import.meta.env.VITE_INSTANT_APP_ID
      if (typeof appId !== 'string' || appId === '') {
        return FailedCountersSession.make({ error: missingAppIdError })
      }
      try {
        const tape = await Effect.runPromise(
          openBrowserCountersTape(appId, countersProcessorIds.svelte),
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
  bindRuntimeSubscriber(runtime)
}

const getCountersWindowRuntime = (): CountersWindowRuntime => {
  if (installedRuntime !== undefined) {
    return installedRuntime
  }
  const runtime = startSvelteCountersWindow()
  installedRuntime = runtime
  bindRuntimeSubscriber(runtime)
  return runtime
}

/** Live snapshot of schema fields for one window URI. */
export const useModel = (uri: string): CountersWindowModel => {
  const runtime = getCountersWindowRuntime()
  subscribeToRuntime?.()
  return runtime.getSnapshot(uri)
}

/** Valid buttons for one window URI. Instant stays in the Host. */
export const useActions = (uri: string): CountersWindowActions => {
  const runtime = getCountersWindowRuntime()
  subscribeToRuntime?.()
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
