import {
  type CountersBrowserHost,
  countersProcessorIds,
  launchBrowserCountersHost,
} from 'counters-instant-example'

/** Starts the SvelteKit Processor on Instant tape when an app id is present. */
export const startCountersProcessor = (): Promise<CountersBrowserHost> => {
  const appId = import.meta.env.VITE_INSTANT_APP_ID
  return launchBrowserCountersHost(
    countersProcessorIds.sveltekit,
    typeof appId === 'string' && appId !== '' ? appId : undefined,
  )
}
