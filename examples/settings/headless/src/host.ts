import { Console, Effect, Layer } from 'effect'
import { Runtime } from 'foldkit'
import {
  SettingsOrigin,
  SettingsProgram,
  settingsScreen,
} from 'settings-core-example'

import { printSettings } from './print.js'

/** Waits for init, then prints settingsScreen. */
export const runSettingsHeadless = (
  resources: Layer.Layer<SettingsOrigin>,
): Effect.Effect<void> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: SettingsProgram,
          resources,
        }),
      )
      yield* runtime.initialization
      yield* Console.log(printSettings(settingsScreen(runtime.readModel())))
      yield* runtime.shutdown
    }),
  )
