import {
  type CounterWindowActions,
  type CounterWindowModel,
  type CounterWindowRuntime,
  startMemoryCounterWindow,
} from 'counter-core-example'
import { createSubscriber } from 'svelte/reactivity'

let installedRuntime: CounterWindowRuntime | undefined
let subscribeToRuntime: (() => void) | undefined

const bindRuntimeSubscriber = (runtime: CounterWindowRuntime): void => {
  subscribeToRuntime = createSubscriber(update => runtime.subscribe(update))
}

/** Installs a Counter window runtime. Tests use this. The window does not. */
export const installCounterWindowRuntime = (
  runtime: CounterWindowRuntime,
): void => {
  installedRuntime = runtime
  bindRuntimeSubscriber(runtime)
}

const getCounterWindowRuntime = (): CounterWindowRuntime => {
  if (installedRuntime !== undefined) {
    return installedRuntime
  }
  const runtime = startMemoryCounterWindow()
  installedRuntime = runtime
  bindRuntimeSubscriber(runtime)
  return runtime
}

/** Live snapshot of schema fields for one window URI. */
export const useModel = (windowUri: string): CounterWindowModel => {
  const runtime = getCounterWindowRuntime()
  subscribeToRuntime?.()
  return runtime.getSnapshot(windowUri)
}

/** Valid buttons for one window URI. Instant stays in the Host. */
export const useActions = (windowUri: string): CounterWindowActions => {
  const runtime = getCounterWindowRuntime()
  subscribeToRuntime?.()
  return runtime.actions(windowUri)
}
