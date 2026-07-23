import { Cause, Effect, Match as M, Option, Queue, Terminal } from 'effect'
import { Runtime } from 'foldkit'

import {
  Message,
  Model,
  RequestedDecrement,
  RequestedIncrement,
  RequestedReset,
  makeCounterProgram,
} from './counter.js'
import { parseCounterUri } from './counterUri.js'
import { counterStorageLayer } from './nodeHost.js'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 43

const framed = (content: string): string => {
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - content.length)
  return `| ${content}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

const centered = (content: string): string => {
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - content.length)
  const leftPadding = Math.floor(remainingWidth / 2)
  const rightPadding = remainingWidth - leftPadding
  return `|${' '.repeat(leftPadding)}${content}${' '.repeat(rightPadding)}|`
}

/** Renders one portable Counter Model as a terminal screen. */
export const renderCounterScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const body = M.value(model).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      Loading: () => [
        framed('Counter'),
        framed(''),
        centered('Loading...'),
        framed(''),
        framed('                               [Q] quit'),
      ],
      Ready: ({ count }) => [
        framed('Counter'),
        framed(''),
        centered(count.toString()),
        framed(''),
        framed('[-] decrement  [R] reset  [+] increment'),
        framed(''),
        framed('Saved                          [Q] quit'),
      ],
      Saving: ({ count }) => [
        framed('Counter'),
        framed(''),
        centered(count.toString()),
        framed(''),
        framed('[-] decrement  [R] reset  [+] increment'),
        framed(''),
        framed('Saving...                      [Q] quit'),
      ],
    }),
  )

  return `${CLEAR_SCREEN}${[border, ...body, border].join('\n')}\n`
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.HostRuntime<Model, Message>,
): Effect.Effect<void, Cause.Done> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const key = Option.getOrElse(
        input.input,
        () => input.key.name,
      ).toLowerCase()
      if (key === 'q') {
        return Effect.void
      } else if (key === '+' || key === '=') {
        return runtime
          .run(RequestedIncrement())
          .pipe(Effect.flatMap(() => runInputLoop(inputQueue, runtime)))
      } else if (key === '-') {
        return runtime
          .run(RequestedDecrement())
          .pipe(Effect.flatMap(() => runInputLoop(inputQueue, runtime)))
      } else if (key === 'r') {
        return runtime
          .run(RequestedReset())
          .pipe(Effect.flatMap(() => runInputLoop(inputQueue, runtime)))
      } else {
        return runInputLoop(inputQueue, runtime)
      }
    }),
  )

/** Runs the foreground terminal host from a portable Counter URI. */
export const runCounterTui = (
  uri: string,
): Effect.Effect<void, unknown, Terminal.Terminal> =>
  Effect.scoped(
    Effect.gen(function* () {
      const initialModel = yield* parseCounterUri(uri)
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Runtime.makeHostRuntime({
        ...makeCounterProgram(initialModel),
        resources: counterStorageLayer(),
      })

      yield* terminal.display(renderCounterScreen(runtime.readModel()))

      const removeObserver = runtime.observeModel(model => {
        Effect.runFork(terminal.display(renderCounterScreen(model)))
      })
      yield* Effect.addFinalizer(() => Effect.sync(removeObserver))

      yield* runtime.initialization
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime)
      yield* runtime.shutdown
    }),
  )

/** Starts the ordinary Loading flow when no portable URI is supplied. */
export const runLoadingCounterTui = (): Effect.Effect<
  void,
  unknown,
  Terminal.Terminal
> => runCounterTui('/?mode=Loading')
