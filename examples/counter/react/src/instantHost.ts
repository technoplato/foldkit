import { BrowserLive, startLiveCounter } from 'counter-core-example'
import {
  installScreenCounterHandle,
  installSyncedCounterHandle,
  resetScreenCounterHandle,
  resetSyncedCounterHandle,
} from 'counter-react-bindings-example'
import { Processor } from 'foldkit'

const instanceLength = 8

/** Starts the React Processor on Instant. Instant has no Model. */
export const startInstantCounter = (): void => {
  resetSyncedCounterHandle()
  resetScreenCounterHandle()
  const handle = startLiveCounter(
    BrowserLive(Processor.Host.React(), {
      instance: globalThis.crypto.randomUUID().slice(0, instanceLength),
    }),
  )
  installSyncedCounterHandle(handle)
  installScreenCounterHandle(handle)
  const hot = import.meta.hot
  if (hot !== undefined) {
    hot.dispose(() => {
      resetSyncedCounterHandle()
      resetScreenCounterHandle()
    })
  }
}
