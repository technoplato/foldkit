import { Processor } from 'foldkit'
import { BrowserLive, startLivePuzzle } from 'puzzle-core-example'
import {
  installScreenPuzzleHandle,
  installSyncedPuzzleHandle,
  resetScreenPuzzleHandle,
  resetSyncedPuzzleHandle,
} from 'puzzle-react-bindings-example'

const instanceLength = 8

/** Starts the React Processor on Instant. Instant has no Model. */
export const startInstantPuzzle = (): void => {
  resetSyncedPuzzleHandle()
  resetScreenPuzzleHandle()
  const handle = startLivePuzzle(
    BrowserLive(Processor.Host.React(), {
      instance: globalThis.crypto.randomUUID().slice(0, instanceLength),
    }),
  )
  installSyncedPuzzleHandle(handle)
  installScreenPuzzleHandle(handle)
  const hot = import.meta.hot
  if (hot !== undefined) {
    hot.dispose(() => {
      resetSyncedPuzzleHandle()
      resetScreenPuzzleHandle()
    })
  }
}
