import {
  counterProcessorIds,
  startCounterWindowRuntime,
} from 'counter-core-example'
import {
  makeCounterInstantDatabase,
  openLiveCounterWindowTape,
  signInCounterWindowSession,
} from 'counter-instant-example/browser'

import { installCounterWindowRuntime } from './processor.js'

/** Starts the Svelte Processor on the live Instant Counter snapshot. */
export const startInstantCounterWindow = (appId: string): void => {
  const database = makeCounterInstantDatabase(appId)
  const runtime = startCounterWindowRuntime({
    openTape: userId =>
      openLiveCounterWindowTape(database, counterProcessorIds.svelte, userId),
    signIn: () => signInCounterWindowSession(),
  })
  installCounterWindowRuntime(runtime)
}
