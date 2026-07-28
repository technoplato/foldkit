import { Effect, Layer } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { WalletTestnetServerLive } from './server.js'

Layer.launch(WalletTestnetServerLive).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
