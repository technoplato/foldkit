import { startLivePuzzle } from 'puzzle-core-example'
import {
  installScreenPuzzleHandle,
  installSyncedPuzzleHandle,
  resetScreenPuzzleHandle,
  resetSyncedPuzzleHandle,
} from 'puzzle-react-bindings-example'

import { ExpoLive } from './expoLive'
import './polyfill'

/** Starts the Expo Processor. ExpoLive supplies Instant and Host. */
export const startInstantPuzzle = (): void => {
  resetSyncedPuzzleHandle()
  resetScreenPuzzleHandle()
  const handle = startLivePuzzle(ExpoLive)
  installSyncedPuzzleHandle(handle)
  installScreenPuzzleHandle(handle)
}
