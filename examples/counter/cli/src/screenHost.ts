import { Console, Effect } from 'effect'

import { CounterCliError } from './cliError.js'
import {
  type ScreenCliExecution,
  paintScreenDo,
  paintScreenShow,
  resolveScreenDo,
} from './paintScreen.js'
import { type CliTapeOptions, withSession } from './session.js'

export { paintCounterCli } from './paintScreen.js'
export type { ScreenCliExecution } from './paintScreen.js'

/** Paints the current screen. Bare invocation and `help` land here. */
export const executeScreenShow = (
  options: CliTapeOptions = {},
): Effect.Effect<ScreenCliExecution, CounterCliError> =>
  withSession(
    (_session, initialModel) => Effect.succeed(paintScreenShow(initialModel)),
    options,
  )

/** Taps one argv command, then paints the next screen. */
export const executeScreenDo = (
  token: string,
  options: CliTapeOptions = {},
): Effect.Effect<ScreenCliExecution, CounterCliError> =>
  withSession(
    (session, initialModel) =>
      Effect.gen(function* () {
        const resolved = resolveScreenDo(token, initialModel)
        if (resolved._tag === 'Failed') {
          return yield* Effect.fail(
            new CounterCliError({
              message: resolved.execution.stderr,
            }),
          )
        }
        const ran = yield* session.run(resolved.action())
        return paintScreenDo(resolved.action, ran.model)
      }),
    options,
  )

/** Runs the screen window show and prints. */
export const runScreenShow = (): Effect.Effect<void, CounterCliError> =>
  Effect.flatMap(executeScreenShow(), execution =>
    Console.log(execution.stdout),
  )

/** Runs one screen command and prints the next screen. */
export const runScreenDo = (
  token: string,
): Effect.Effect<void, CounterCliError> =>
  Effect.flatMap(executeScreenDo(token), execution =>
    Console.log(execution.stdout),
  )
