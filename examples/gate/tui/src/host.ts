import {
  Cause,
  Effect,
  Layer,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'
import {
  GateOrigin,
  GateProgram,
  type Message,
  type Model,
  gateScreen,
  keysForToken,
  messageFromKey,
} from 'gate-core-example'

import { paintTui } from './paintTui.js'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const quitHint = '[q] quit'

/** Paints gateScreen plus process quit chrome. */
export const paintGateTui = (model: Model): string => {
  const tree = paintTui(gateScreen(model), { keysForToken })
  return `${CLEAR_SCREEN}${tree}\n${quitHint}\n`
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const key = Option.getOrElse(
        input.input,
        () => input.key.name,
      ).toLowerCase()
      if (key === 'q') {
        return Effect.void
      }

      const message = messageFromKey(key, runtime.readModel())
      if (message === undefined) {
        return runInputLoop(inputQueue, runtime, terminal)
      }

      return runtime.run(message).pipe(
        Effect.flatMap(model => terminal.display(paintGateTui(model))),
        Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
      )
    }),
  )

/** Runs the interactive terminal host over the imported Gate Program. */
export const runGateTui = (
  resources: Layer.Layer<GateOrigin>,
): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: GateProgram,
          resources,
        }),
      )

      yield* runtime.initialization
      yield* terminal.display(paintGateTui(runtime.readModel()))

      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
