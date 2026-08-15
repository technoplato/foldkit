/** Shared Instant session used by every Multiple Counters Processor. */
export const countersInstantSessionId = 'counters-session'

/** Shared Instant demo subject used by local Multiple Counters Processors. */
export const countersDemoEmail = 'counter@foldkit.dev'

/** Vite path that mints the Multiple Counters demo Instant session. */
export const countersDemoSessionPath = '/__foldkit/counters-demo-session'

/** Processor ids written onto the same Instant tape. */
export const countersProcessorIds = {
  cli: 'counters-cli',
  expoAndroid: 'counters-expo-android',
  expoIos: 'counters-expo-ios',
  foldkit: 'counters-foldkit',
  headless: 'counters-headless',
  opentui: 'counters-opentui',
  react: 'counters-react',
  svelte: 'counters-svelte',
  sveltekit: 'counters-sveltekit',
  terminal: 'counters-terminal',
  threejs: 'counters-threejs',
  vue: 'counters-vue',
}
