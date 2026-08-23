import { startLiveCounter } from 'counter-core-example'
import {
  installScreenCounterHandle,
  installSyncedCounterHandle,
  resetScreenCounterHandle,
  resetSyncedCounterHandle,
} from 'counter-react-bindings-example'

import { ExpoLive } from './expoLive'
import './polyfill'

/** Starts the Expo Processor. ExpoLive supplies Instant and Host. */
export const startInstantCounter = (): void => {
  resetSyncedCounterHandle()
  resetScreenCounterHandle()
  const handle = startLiveCounter(ExpoLive)
  installSyncedCounterHandle(handle)
  installScreenCounterHandle(handle)
}
