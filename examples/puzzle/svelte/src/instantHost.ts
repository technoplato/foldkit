import { Processor } from 'foldkit'
import { BrowserLive, startLivePuzzle } from 'puzzle-core-example'

import {
  installSyncedPuzzleHandle,
  resetSyncedPuzzleHandle,
} from './processor.js'

const instanceLength = 8

/** Starts the Svelte Processor on Instant. Instant has no Model. */
export const startInstantPuzzle = (): void => {
  resetSyncedPuzzleHandle()
  installSyncedPuzzleHandle(
    startLivePuzzle(
      BrowserLive(Processor.Host.Svelte(), {
        instance: globalThis.crypto.randomUUID().slice(0, instanceLength),
      }),
    ),
  )
  const hot = import.meta.hot
  if (hot !== undefined) {
    hot.dispose(() => {
      resetSyncedPuzzleHandle()
    })
  }
}
