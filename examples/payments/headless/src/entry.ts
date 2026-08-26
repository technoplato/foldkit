#!/usr/bin/env node
import { Console, Effect } from 'effect'
import { Runtime } from 'foldkit'
import {
  ConnectedWallet,
  InertPaymentProcessorLive,
  PaymentsProgram,
  RequestedSession,
  RequestedVerify,
  displayForModel,
} from 'payments-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

const runHeadless = Effect.scoped(
  Effect.gen(function* () {
    const runtime = yield* Effect.orDie(
      Runtime.makeProgramRuntime({
        program: PaymentsProgram,
        resources: InertPaymentProcessorLive,
      }),
    )
    yield* runtime.initialization
    yield* runtime.run(ConnectedWallet())
    yield* runtime.run(RequestedSession())
    yield* runtime.run(RequestedVerify({}))
    const model = runtime.readModel()
    yield* runtime.shutdown
    yield* Console.log(displayForModel(model))
  }),
)

runHeadless.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
