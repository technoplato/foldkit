import { Console, Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'
import {
  ClickedRefresh,
  GateOrigin,
  GateProgram,
  type Message,
  type Model,
  gateScreen,
  whatForToken,
} from 'gate-core-example'

import { type CliPainting, paintCli } from './paintCli.js'

const binaryName = 'foldkit-gate'

const paintOptions = {
  binaryName,
  whatFor: whatForToken,
}

const withGateRuntime = <A, E>(
  resources: Layer.Layer<GateOrigin>,
  use: (runtime: Runtime.ProgramRuntime<Model, Message>) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: GateProgram,
          resources,
        }),
      )
      const result = yield* use(runtime)
      yield* runtime.shutdown
      return result
    }),
  )

const paintModel = (model: Model): CliPainting =>
  paintCli(gateScreen(model), paintOptions)

/** Waits for init, then paints gateScreen. */
export const showGate = (
  resources: Layer.Layer<GateOrigin>,
): Effect.Effect<CliPainting> =>
  withGateRuntime(resources, runtime =>
    Effect.gen(function* () {
      yield* runtime.initialization
      return paintModel(runtime.readModel())
    }),
  )

/** Waits for init, sends ClickedRefresh, then paints gateScreen. */
export const refreshGate = (
  resources: Layer.Layer<GateOrigin>,
): Effect.Effect<CliPainting> =>
  withGateRuntime(resources, runtime =>
    Effect.gen(function* () {
      yield* runtime.initialization
      yield* runtime.run(ClickedRefresh())
      return paintModel(runtime.readModel())
    }),
  )

/** Prints the Gate screen after init. */
export const runGateShow = (
  resources: Layer.Layer<GateOrigin>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const painting = yield* showGate(resources)
    yield* Console.log(painting.screen)
  })

/** Reads the origin again and prints the Gate screen. */
export const runGateRefresh = (
  resources: Layer.Layer<GateOrigin>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const painting = yield* refreshGate(resources)
    yield* Console.log(painting.screen)
  })
