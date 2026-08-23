import { Console, Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'
import { GateOrigin, GateProgram, gateScreen } from 'gate-core-example'

import { printGate } from './print.js'

/** Waits for init, then prints gateScreen. */
export const runGateHeadless = (
  resources: Layer.Layer<GateOrigin>,
): Effect.Effect<void> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: GateProgram,
          resources,
        }),
      )
      yield* runtime.initialization
      yield* Console.log(printGate(gateScreen(runtime.readModel())))
      yield* runtime.shutdown
    }),
  )
