import { Effect, Layer } from 'effect'
import { factEndpoint, makeFactHttpClient } from 'fact-http-client-example'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  defaultReplayDestination,
  makeReplayabilityTapeStore,
  parseReplayDestination,
} from 'replayability-core-example'
import { ReplayabilityProvider } from 'replayability-react-bindings-example'

import { BrowserCrypto, BrowserHttpClient } from '@effect/platform-browser'

import { App } from './App.js'
import './styles.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Missing root element')
}

Effect.runPromise(
  parseReplayDestination(
    `${window.location.pathname}${window.location.search}`,
  ).pipe(Effect.catch(() => defaultReplayDestination('Counters'))),
).then(destination => {
  createRoot(rootElement).render(
    <StrictMode>
      <ReplayabilityProvider
        flags={{
          cryptoLayer: BrowserCrypto.layer,
          destination,
          factResources: Layer.provide(
            makeFactHttpClient(factEndpoint),
            BrowserHttpClient.layerFetch,
          ),
          replayTapeStore: makeReplayabilityTapeStore(globalThis.fetch),
        }}
        fallback={
          <main className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-400">
            Loading replay…
          </main>
        }
      >
        <App />
      </ReplayabilityProvider>
    </StrictMode>,
  )
}, globalThis.console.error)
