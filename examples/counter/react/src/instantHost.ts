import {
  counterProcessorIds,
  startCounterWindowRuntime,
} from 'counter-core-example'
import {
  makeCounterInstantDatabase,
  openLiveCounterWindowTape,
  signInCounterWindowSession,
} from 'counter-instant-example/browser'
import { installCounterWindowRuntime } from 'counter-react-bindings-example'

/** Starts the React Processor on the live Instant Counter tape. */
export const startInstantCounterWindow = (appId: string): void => {
  const database = makeCounterInstantDatabase(appId)
  const runtime = startCounterWindowRuntime({
    openTape: userId =>
      openLiveCounterWindowTape(database, counterProcessorIds.react, userId),
    signIn: () => signInCounterWindowSession(database),
  })
  installCounterWindowRuntime(runtime)
}
