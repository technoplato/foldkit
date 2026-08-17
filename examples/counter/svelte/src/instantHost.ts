import { startSyncedCounterHandle } from 'counter-core-example'
import { Processor } from 'foldkit'

import { FoldkitCounterV01, Instant } from '@foldkit/instant/browser'

import { installSyncedCounterHandle } from './processor.js'

/** Starts the Svelte Processor on Instant. Instant has no Model. */
export const startInstantCounter = (): void => {
  installSyncedCounterHandle(
    startSyncedCounterHandle(
      Instant({
        app: FoldkitCounterV01,
        processor: Processor.Host.Svelte(),
      }),
    ),
  )
}
