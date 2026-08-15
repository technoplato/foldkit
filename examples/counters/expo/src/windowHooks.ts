import {
  type CountersWindowActions,
  type CountersWindowModel,
  type CountersWindowRuntime,
} from 'counters-instant-example/native'
import { useMemo, useRef, useSyncExternalStore } from 'react'

let installedRuntime: CountersWindowRuntime | undefined
let startDefaultRuntime: (() => CountersWindowRuntime) | undefined

/** Installs a Counters window runtime. Tests use this. The window does not. */
export const installCountersWindowRuntime = (
  runtime: CountersWindowRuntime,
): void => {
  installedRuntime = runtime
}

/** Registers how the Expo adapter starts Instant when no runtime is installed. */
export const setDefaultCountersWindowStart = (
  start: () => CountersWindowRuntime,
): void => {
  startDefaultRuntime = start
}

const getCountersWindowRuntime = (): CountersWindowRuntime => {
  if (installedRuntime !== undefined) {
    return installedRuntime
  }
  if (startDefaultRuntime === undefined) {
    throw new Error('Counters window runtime is not installed')
  }
  installedRuntime = startDefaultRuntime()
  return installedRuntime
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
