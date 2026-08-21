import { type Model } from 'counters-core-example'
import {
  type CountersWindowActions,
  type CountersWindowModel,
  type CountersWindowRuntime,
  type CountersWindowTape,
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openBrowserCountersTape,
  openCountersTapeRuntime,
  startCountersWindowRuntime,
} from 'counters-instant-example'
import { Effect, Exit, Scope } from 'effect'
import { useMemo, useRef, useSyncExternalStore } from 'react'

const missingAppIdError =
  'VITE_INSTANT_APP_ID is missing. Start through the Instant demo wrapper.'

/** Turns a thrown Instant or tape failure into a FailedWindow string. */
export const describeReactCountersWindowError = (error: unknown): string => {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  return 'Instant could not open the Multiple Counters tape.'
}

const signInReactCountersWindowSession = (
  appId: string | undefined,
): Promise<
  | { readonly _tag: 'SignedInCountersSession'; readonly userId: string }
  | { readonly _tag: 'FailedCountersSession'; readonly error: string }
> => {
  if (appId === undefined || appId === '') {
    return Promise.resolve({
      _tag: 'FailedCountersSession',
      error: missingAppIdError,
    })
  }
  return Effect.runPromise(
    openBrowserCountersTape(appId, countersProcessorIds.react),
  ).then(
    () => ({
      _tag: 'SignedInCountersSession' as const,
      userId: countersProcessorIds.react,
    }),
    error => ({
      _tag: 'FailedCountersSession' as const,
      error: describeReactCountersWindowError(error),
    }),
  )
}

const openLiveReactCountersWindowTape = (
  appId: string,
): Promise<CountersWindowTape> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      const tape = yield* openBrowserCountersTape(
        appId,
        countersProcessorIds.react,
      )
      const opened = yield* openCountersTapeRuntime(
        tape,
        instantCountersResources,
      )
      yield* observeRemoteCountersTape(
        tape,
        opened.runtime,
        countersProcessorIds.react,
      ).pipe(Effect.forkChild)
      return {
        readModel: () => opened.runtime.readModel(),
        send: opened.sendClientInput,
        stop: () => {
          const closing = Effect.runPromise(Scope.close(scope, Exit.void))
          closing.then(
            () => undefined,
            () => undefined,
          )
        },
        subscribe: (listener: (model: Model) => void) =>
          opened.runtime.observeModel(listener),
      }
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}

const startReactCountersWindowRuntime = (
  appId: string | undefined,
): CountersWindowRuntime =>
  startCountersWindowRuntime({
    openTape: () => {
      if (appId === undefined || appId === '') {
        return Promise.reject(new Error(missingAppIdError))
      }
      return openLiveReactCountersWindowTape(appId)
    },
    signIn: () => signInReactCountersWindowSession(appId),
  })

let installedRuntime: CountersWindowRuntime | undefined

/** Installs a Counters window runtime. Tests use this. The window does not. */
export const installCountersWindowRuntime = (
  runtime: CountersWindowRuntime,
): void => {
  installedRuntime = runtime
}

const instantAppId = (): string | undefined => {
  const appId = import.meta.env.VITE_INSTANT_APP_ID
  if (typeof appId !== 'string' || appId === '') {
    return undefined
  }
  return appId
}

const getCountersWindowRuntime = (): CountersWindowRuntime => {
  if (installedRuntime !== undefined) {
    return installedRuntime
  }
  installedRuntime = startReactCountersWindowRuntime(instantAppId())
  return installedRuntime
}

/** Starts the React Processor on the live Instant Multiple Counters tape. */
export const startInstantCountersWindow = (appId: string): void => {
  installCountersWindowRuntime(startReactCountersWindowRuntime(appId))
}

/** Live snapshot of schema fields for one window URI. */
export const useModel = (uri: string): CountersWindowModel => {
  const runtime = getCountersWindowRuntime()
  const uriRef = useRef(uri)
  uriRef.current = uri
  const subscribe = useMemo(() => runtime.subscribe, [runtime])
  const getSnapshot = useMemo(
    () => () => runtime.getSnapshot(uriRef.current),
    [runtime],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Valid buttons for one window URI. Instant stays in the runtime. */
export const useActions = (uri: string): CountersWindowActions => {
  const runtime = getCountersWindowRuntime()
  return runtime.actions(uri)
}
