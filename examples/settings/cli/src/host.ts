import { Console, Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'
import {
  ClickedRefresh,
  type Message,
  type Model,
  SettingsOrigin,
  SettingsProgram,
  settingsScreen,
  whatForToken,
} from 'settings-core-example'

import { type CliPainting, paintCli } from './paintCli.js'

const binaryName = 'foldkit-settings'

const paintOptions = {
  binaryName,
  whatFor: whatForToken,
}

const withSettingsRuntime = <A, E>(
  resources: Layer.Layer<SettingsOrigin>,
  use: (runtime: Runtime.ProgramRuntime<Model, Message>) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: SettingsProgram,
          resources,
        }),
      )
      const result = yield* use(runtime)
      yield* runtime.shutdown
      return result
    }),
  )

const paintModel = (model: Model): CliPainting =>
  paintCli(settingsScreen(model), paintOptions)

/** Waits for init, then paints settingsScreen. */
export const showSettings = (
  resources: Layer.Layer<SettingsOrigin>,
): Effect.Effect<CliPainting> =>
  withSettingsRuntime(resources, runtime =>
    Effect.gen(function* () {
      yield* runtime.initialization
      return paintModel(runtime.readModel())
    }),
  )

/** Waits for init, sends ClickedRefresh, then paints settingsScreen. */
export const refreshSettings = (
  resources: Layer.Layer<SettingsOrigin>,
): Effect.Effect<CliPainting> =>
  withSettingsRuntime(resources, runtime =>
    Effect.gen(function* () {
      yield* runtime.initialization
      yield* runtime.run(ClickedRefresh())
      return paintModel(runtime.readModel())
    }),
  )

/** Prints the Settings screen after init. */
export const runSettingsShow = (
  resources: Layer.Layer<SettingsOrigin>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const painting = yield* showSettings(resources)
    yield* Console.log(painting.screen)
  })

/** Reads the origin again and prints the Settings screen. */
export const runSettingsRefresh = (
  resources: Layer.Layer<SettingsOrigin>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const painting = yield* refreshSettings(resources)
    yield* Console.log(painting.screen)
  })
