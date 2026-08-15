import {
  type CounterWindowActions,
  type CounterWindowModel,
  type CounterWindowRuntime,
  startMemoryCounterWindow,
} from 'counter-core-example'
import { useMemo, useRef, useSyncExternalStore } from 'react'

let installedRuntime: CounterWindowRuntime | undefined

/** Installs a Counter window runtime. Tests use this. The window does not. */
export const installCounterWindowRuntime = (
  runtime: CounterWindowRuntime,
): void => {
  installedRuntime = runtime
}

/** Clears a test runtime so the next hook call starts a fresh memory window. */
export const resetCounterWindowRuntime = (): void => {
  if (installedRuntime !== undefined) {
    installedRuntime.stop()
  }
  installedRuntime = undefined
}

const getCounterWindowRuntime = (): CounterWindowRuntime => {
  if (installedRuntime !== undefined) {
    return installedRuntime
  }
  installedRuntime = startMemoryCounterWindow()
  return installedRuntime
}

/** Live snapshot of schema fields for one window URI. */
export const useModel = (windowUri: string): CounterWindowModel => {
  const runtime = getCounterWindowRuntime()
  const uriRef = useRef(windowUri)
  uriRef.current = windowUri
  const subscribe = useMemo(() => runtime.subscribe, [runtime])
  const getSnapshot = useMemo(
    () => () => runtime.getSnapshot(uriRef.current),
    [runtime],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Valid buttons for one window URI. Instant stays in the runtime. */
export const useActions = (windowUri: string): CounterWindowActions => {
  const runtime = getCounterWindowRuntime()
  return runtime.actions(windowUri)
}
