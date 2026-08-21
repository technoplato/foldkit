import { Cause, Effect, Option, PlatformError, Queue, Terminal } from 'effect'
import { Runtime } from 'foldkit'
import {
  AskDanger,
  ChainSendDanger,
  LiveWalletDanger,
  type Message,
  MintPlay,
  type Model,
  MovePlay,
  OrbitProgram,
  PlayCredits,
  playOf,
} from 'orbit-core-example'

import { orbitResources } from './resources.js'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 72

const framed = (content: string): string => {
  const clipped = content.slice(0, SCREEN_INNER_WIDTH)
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - clipped.length)
  return `| ${clipped}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

/** Renders the imported Orbit Model as a terminal screen. */
export const renderOrbitScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const outcome = Option.match(model.lastOutcome, {
    onNone: () => 'danger always refuses',
    onSome: value =>
      value._tag === 'ok' ? value.line : `refuse ${value.danger._tag}`,
  })
  const lines = [
    border,
    framed('Orbit agent index'),
    framed(
      `tortoise ${String(playOf(model.sims.tortoise))}  achilles ${String(playOf(model.sims.achilles))}`,
    ),
    framed(`seq=${String(model.seq)} steps=${String(model.steps.length)}`),
    framed(outcome),
    framed('M mint 1428  V move 428  L live  C chain  Q quit'),
    border,
  ]
  return `${CLEAR_SCREEN}${lines.join('\n')}\n`
}

/** Maps a terminal key to an imported Orbit Message when applicable. */
export const messageForInput = (input: string): Option.Option<Message> => {
  const key = input.toLowerCase()
  if (key === 'm') {
    return Option.some(
      MintPlay.make({ role: 'tortoise', amount: PlayCredits.make(1428) }),
    )
  }
  if (key === 'v') {
    return Option.some(
      MovePlay.make({
        from: 'tortoise',
        to: 'achilles',
        amount: PlayCredits.make(428),
      }),
    )
  }
  if (key === 'l') {
    return Option.some(AskDanger.make({ danger: LiveWalletDanger.make({}) }))
  }
  if (key === 'c') {
    return Option.some(AskDanger.make({ danger: ChainSendDanger.make({}) }))
  }
  return Option.none()
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
      const maybeMessage = messageForInput(key)
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.flatMap(model => terminal.display(renderOrbitScreen(model))),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      }
      return runInputLoop(inputQueue, runtime, terminal)
    }),
  )

/** Runs the interactive terminal host over the imported Orbit program. */
export const runOrbitTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: OrbitProgram,
          resources: orbitResources(),
        }),
      )
      yield* runtime.initialization
      yield* terminal.display(renderOrbitScreen(runtime.readModel()))
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
