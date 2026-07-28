import { Effect, Layer } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { logBuildProvenance } from './buildProvenance.js'
import { WalletTestnetServerLive } from './server.js'

Effect.gen(function* () {
  yield* logBuildProvenance
  return yield* Layer.launch(WalletTestnetServerLive)
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
