import { BrowserLive, startLiveCounter } from 'counter-core-example'
import { Processor } from 'foldkit'

import {
  installSyncedCounterHandle,
  resetSyncedCounterHandle,
} from './processor.js'

const instanceLength = 8

/** Starts the Svelte Processor on Instant. Instant has no Model. */
export const startInstantCounter = (): void => {
  resetSyncedCounterHandle()
  installSyncedCounterHandle(
    startLiveCounter(
      BrowserLive(Processor.Host.Svelte(), {
        instance: globalThis.crypto.randomUUID().slice(0, instanceLength),
      }),
    ),
  )
  const hot = import.meta.hot
  if (hot !== undefined) {
    hot.dispose(() => {
      resetSyncedCounterHandle()
    })
  }
}
