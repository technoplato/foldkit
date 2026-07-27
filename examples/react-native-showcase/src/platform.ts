import { Context, Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import { Fact, FactClient } from 'fact-core-example'
import { factEndpoint, makeFactHttpClient } from 'fact-http-client-example'
import { makeFactReactClient } from 'fact-react-bindings-example'
import { Platform } from 'react-native'
import {
  defineDependencyChoice,
  defineSingleDependencySet,
} from 'shared-react-bindings-example'

/** The host platform selected by the Expo composition root. */
export type ClientPlatformService = Readonly<{ name: string }>

/** An injectable description of the current client platform. */
export class ClientPlatform extends Context.Service<
  ClientPlatform,
  ClientPlatformService
>()('ReactNativeShowcase/ClientPlatform') {}

const initialPlatform = (): 'Web' | 'iOS' | 'Android' => {
  if (Platform.OS === 'web') {
    return 'Web'
  } else if (Platform.OS === 'ios') {
    return 'iOS'
  } else {
    return 'Android'
  }
}

/** Platform implementations available to the showcase composition root. */
export const ClientPlatformDependency = defineDependencyChoice({
  service: ClientPlatform,
  initial: initialPlatform(),
  implementations: {
    Web: Layer.succeed(ClientPlatform, { name: 'Expo Web' }),
    iOS: Layer.succeed(ClientPlatform, { name: 'Expo iOS' }),
    Android: Layer.succeed(ClientPlatform, { name: 'Expo Android' }),
  },
})

const MockFactClient = Layer.succeed(FactClient, {
  fetch: Effect.succeed(
    Fact.make({
      requestId: 'mock-expo-fact',
      text: 'This Fact came from the Expo showcase Mock Layer.',
    }),
  ),
})

const LiveFactClient = Layer.provide(
  makeFactHttpClient(factEndpoint),
  FetchHttpClient.layer,
)

/** Side-effect implementations available to the Fact Program. */
export const FactClientDependency = defineDependencyChoice({
  service: FactClient,
  initial: 'Mock',
  implementations: {
    Mock: MockFactClient,
    Live: LiveFactClient,
  },
})

/** The Fact client with two independently switchable Effect dependencies. */
export const ShowcaseFactClient = makeFactReactClient({
  dependencies: defineSingleDependencySet(FactClientDependency).add(
    ClientPlatformDependency,
  ),
})
