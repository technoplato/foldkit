import { startLiveCounter } from 'counter-core-example'
import {
  installSyncedCounterHandle,
  resetSyncedCounterHandle,
} from 'counter-react-bindings-example'

import { ExpoLive } from './expoLive'
import './polyfill'

/** Starts the Expo Processor. ExpoLive supplies Instant and Host. */
export const startInstantCounter = (): void => {
  resetSyncedCounterHandle()
  installSyncedCounterHandle(startLiveCounter(ExpoLive))
}
