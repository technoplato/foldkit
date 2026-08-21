import { type Model, MultipleCountersProgram } from 'counters-core-example'
import {
  type CountersBrowserHost,
  type CountersTape,
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
import { Effect, Exit, Match as M, Schema as S, Scope } from 'effect'
import {
  type MaybeRefOrGetter,
  type Ref,
  computed,
  onUnmounted,
  ref,
  toValue,
  watch,
} from 'vue'

export type { CountersWindowActions, CountersWindowModel }

const FailedCountersSession = S.TaggedStruct('FailedCountersSession', {
  error: S.String,
})

const SignedInCountersSession = S.TaggedStruct('SignedInCountersSession', {
  userId: S.String,
})

const missingAppIdError =
  'VITE_INSTANT_APP_ID is missing. Start through the Instant demo wrapper.'

const missingSessionError = 'Sign-in failed. Instant has no session.'

let installedRuntime: CountersWindowRuntime | undefined

const instantAppId = (): string | undefined => {
  const appId = import.meta.env.VITE_INSTANT_APP_ID
  if (typeof appId !== 'string' || appId === '') {
    return undefined
  }
  return appId
}

const launchWindowTape = (tape: CountersTape): Promise<CountersWindowTape> => {
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
        countersProcessorIds.vue,
      ).pipe(Effect.forkChild)
      return {
        readModel: () => opened.runtime.readModel(),
        send: opened.sendClientInput,
        stop: () => {
          const closed = Effect.runPromise(Scope.close(scope, Exit.void))
          closed.catch(() => undefined)
        },
        subscribe: (listener: (model: Model) => void) =>
          opened.runtime.observeModel(listener),
      }
    }).pipe(Effect.provideService(Scope.Scope, scope), Effect.orDie),
  )
}

/** Starts the Instant Counters window. Failed sign-in is a snapshot, not a hang. */
export const startVueCountersWindow = (): CountersWindowRuntime => {
  let pendingTape: CountersTape | undefined
  return startCountersWindowRuntime({
    openTape: () => {
      if (pendingTape === undefined) {
        return Promise.reject(new Error(missingSessionError))
      }
      return launchWindowTape(pendingTape)
    },
    signIn: async () => {
      pendingTape = undefined
      const appId = instantAppId()
      if (appId === undefined) {
        return FailedCountersSession.make({ error: missingAppIdError })
      }
      return Effect.runPromise(
        openBrowserCountersTape(appId, countersProcessorIds.vue).pipe(
          Effect.match({
            onFailure: error =>
              FailedCountersSession.make({ error: error.message }),
            onSuccess: tape => {
              pendingTape = tape
              return SignedInCountersSession.make({
                userId: countersProcessorIds.vue,
              })
            },
          }),
        ),
      )
    },
  })
}

const getVueCountersWindow = (): CountersWindowRuntime => {
  if (installedRuntime === undefined) {
    installedRuntime = startVueCountersWindow()
  }
  return installedRuntime
}

/** Live snapshot of schema fields for one window URI. */
export const useModel = (
  uri: MaybeRefOrGetter<string>,
): Ref<CountersWindowModel> => {
  const runtime = getVueCountersWindow()
  const view = ref(runtime.getSnapshot(toValue(uri)))
  const refresh = () => {
    view.value = runtime.getSnapshot(toValue(uri))
  }
  const stop = runtime.subscribe(refresh)
  watch(() => toValue(uri), refresh)
  onUnmounted(stop)
  return view
}

/** Valid buttons for one window URI. Instant stays in the Host. */
export const useActions = (uri: MaybeRefOrGetter<string>) => {
  const view = useModel(uri)
  return computed(() =>
    M.value(view.value).pipe(
      M.withReturnType<CountersWindowActions>(),
      M.tagsExhaustive({
        StartingWindow: () => getVueCountersWindow().actions(toValue(uri)),
        FailedWindow: () => getVueCountersWindow().actions(toValue(uri)),
        ReadyWindow: () => getVueCountersWindow().actions(toValue(uri)),
      }),
    ),
  )
}

/** QA in-memory Processor. The Vue page does not call this. */
export const startCountersProcessor = (): Promise<CountersBrowserHost> => {
  const [initial] = MultipleCountersProgram.init()
  let model = initial
  const listeners = new Set<(next: Model) => void>()
  return Promise.resolve({
    readModel: () => model,
    send: async message => {
      const [next] = MultipleCountersProgram.update(model, message)
      model = next
      listeners.forEach(listener => {
        listener(model)
      })
    },
    stop: async () => {
      listeners.clear()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  })
}
