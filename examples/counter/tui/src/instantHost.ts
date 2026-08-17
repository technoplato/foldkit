import {
  type SyncedCounterHandle,
  startSyncedCounterHandle,
} from 'counter-core-example'
import { Processor } from 'foldkit'

import { FoldkitCounterV01, Instant } from '@foldkit/instant'

/** Starts the TUI Processor on Instant. Instant has no Model. */
export const startInstantCounter = (): SyncedCounterHandle =>
  startSyncedCounterHandle(
    Instant({
      app: FoldkitCounterV01,
      processor: Processor.Host.Tui(),
    }),
  )
