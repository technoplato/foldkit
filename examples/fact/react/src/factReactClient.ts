import { Effect, Layer } from 'effect'
import { Fact, FactClient } from 'fact-core-example'
import { factEndpoint, makeFactHttpClient } from 'fact-http-client-example'
import { makeFactReactClient } from 'fact-react-bindings-example'
import {
  defineDependencyChoice,
  defineSingleDependencySet,
} from 'shared-react-bindings-example'

import { BrowserHttpClient } from '@effect/platform-browser'

const MockFactClient = Layer.succeed(FactClient, {
  fetch: Effect.succeed(
    Fact.make({
      requestId: 'mock-react-fact',
      text: 'This Fact came from the in-memory Mock Layer.',
    }),
  ),
})

const LiveFactClient = Layer.provide(
  makeFactHttpClient(factEndpoint),
  BrowserHttpClient.layerFetch,
)

/** The platform-selected FactClient implementations available to this client. */
export const FactClientDependency = defineDependencyChoice({
  service: FactClient,
  initial: 'Mock',
  implementations: {
    Mock: MockFactClient,
    Live: LiveFactClient,
  },
})

/** The React client assembled from the canonical Fact Program and platform Layers. */
export const FactReactClient = makeFactReactClient({
  dependencies: defineSingleDependencySet(FactClientDependency),
})
