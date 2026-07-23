import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  Message,
  Model,
  init,
  update,
} from 'counter-core-example'
import { Effect, Exit, Layer, Scope } from 'effect'
import { Runtime } from 'foldkit'
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react'

/** Actions exposed to React consumers of the Counter Program. */
export type CounterActions = Readonly<{
  clickedDecrement: () => void
  clickedIncrement: () => void
  clickedReset: () => void
}>

type CounterStore = Readonly<{
  actions: CounterActions
  cancelDispose: () => void
  readModel: () => Model
  scheduleDispose: () => void
  subscribe: (listener: () => void) => () => void
}>

const CounterContext = createContext<CounterStore | null>(null)

const createCounterRuntime = (): readonly [
  Runtime.HostRuntime<Model, Message>,
  Scope.Closeable,
] =>
  Effect.runSync(
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const runtime = yield* Effect.provideService(
        Runtime.makeHostRuntime<Model, Message>({
          Model,
          init,
          update,
          resources: Layer.empty,
        }),
        Scope.Scope,
        scope,
      )
      return [runtime, scope]
    }),
  )

const createCounterStore = (): CounterStore => {
  const [runtime, scope] = createCounterRuntime()
  Effect.runSync(runtime.initialization)
  let isDisposed = false
  let maybeDisposeTimeout: ReturnType<typeof setTimeout> | undefined

  const actions: CounterActions = {
    clickedDecrement: () => runtime.enqueueMessage(ClickedDecrement()),
    clickedIncrement: () => runtime.enqueueMessage(ClickedIncrement()),
    clickedReset: () => runtime.enqueueMessage(ClickedReset()),
  }

  const disposeNow = (): void => {
    if (isDisposed) {
      return
    }
    isDisposed = true
    Effect.runSync(
      Effect.gen(function* () {
        yield* runtime.shutdown
        yield* Scope.close(scope, Exit.void)
      }),
    )
  }

  return {
    actions,
    cancelDispose: () => {
      if (maybeDisposeTimeout !== undefined) {
        clearTimeout(maybeDisposeTimeout)
        maybeDisposeTimeout = undefined
      }
    },
    readModel: runtime.readModel,
    scheduleDispose: () => {
      maybeDisposeTimeout = setTimeout(disposeNow, 0)
    },
    subscribe: listener => runtime.observeModel(() => listener()),
  }
}

const useCounterStore = (): CounterStore => {
  const store = useContext(CounterContext)
  if (store === null) {
    throw new Error('Counter hooks must be used inside CounterProvider')
  }
  return store
}

/** Provides one Counter runtime to React or React Native children. */
export const CounterProvider = ({
  children,
}: Readonly<{ children: ReactNode }>) => {
  const storeRef = useRef<CounterStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createCounterStore()
  }

  useEffect(() => {
    const store = storeRef.current
    store?.cancelDispose()
    return () => {
      store?.scheduleDispose()
    }
  }, [])

  return (
    <CounterContext.Provider value={storeRef.current}>
      {children}
    </CounterContext.Provider>
  )
}

/** Reads the current immutable Counter Model and re-renders on Model changes. */
export const useCounterModel = (): Model => {
  const store = useCounterStore()
  return useSyncExternalStore(store.subscribe, store.readModel, store.readModel)
}

/** Returns stable, host-callable Counter actions. */
export const useCounterActions = (): CounterActions => {
  const store = useCounterStore()
  return store.actions
}
