import {
  type CounterWindowModel,
  type CounterWindowRuntime,
  type Message,
  Model,
  actions,
  counterValid,
  renderChrome,
  tokenOf,
  uri,
} from 'counter-core-example'
import {
  Array,
  Cause,
  Effect,
  Match as M,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'

/** Renders Starting, Failed, or the imported Counter chrome. */
export const renderCounterScreen = (snapshot: CounterWindowModel): string =>
  M.value(snapshot).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      StartingWindow: () =>
        `${CLEAR_SCREEN}Starting Instant Counter…\n\n[Q] quit\n`,
      FailedWindow: ({ error }) =>
        `${CLEAR_SCREEN}${error}\n\n[S] sign in\n[Q] quit\n`,
      ReadyWindow: ({ count }) => {
        const chrome = renderChrome(Model.make({ count }), 'computer')
        return `${CLEAR_SCREEN}${chrome}\n\n[Q] quit\n`
      },
    }),
  )

/** Maps a terminal key to an imported Counter Message when applicable. */
export const messageForInput = (
  input: string,
  model: Model,
): Option.Option<Message> => {
  const key = input.toLowerCase()
  const maybeAction = Array.findFirst(
    actions,
    action =>
      Array.contains(action.keys ?? [], key) ||
      Array.contains(action.keys ?? [], input),
  )
  if (Option.isNone(maybeAction)) {
    return Option.none()
  }
  const token = tokenOf(maybeAction.value)
  const isValid = Array.some(
    counterValid(model, {}),
    item => item.token === token && item.valid,
  )
  if (!isValid) {
    return Option.none()
  }
  return Option.some(maybeAction.value())
}

const sendForInput = (key: string, runtime: CounterWindowRuntime): void => {
  const windowActions = runtime.actions(uri)
  if (key === 's') {
    windowActions.signIn()
    return
  }
  if (key === '+' || key === '=') {
    windowActions.clickedIncrement()
    return
  }
  if (key === '-') {
    windowActions.clickedDecrement()
    return
  }
  if (key === 'r') {
    windowActions.clickedReset()
  }
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: CounterWindowRuntime,
  paint: (
    snapshot: CounterWindowModel,
  ) => Effect.Effect<void, PlatformError.PlatformError>,
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
      sendForInput(key, runtime)
      return paint(runtime.getSnapshot(uri)).pipe(
        Effect.flatMap(() => runInputLoop(inputQueue, runtime, paint)),
      )
    }),
  )

/** Paints the window runtime. The Client only subscribes and sends. */
export const runCounterTui = (
  runtime: CounterWindowRuntime,
): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const inputQueue = yield* terminal.readInput
      const paints = yield* Queue.unbounded<CounterWindowModel>()
      const unsubscribe = runtime.subscribe(() => {
        Effect.runSync(Queue.offer(paints, runtime.getSnapshot(uri)))
      })
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          unsubscribe()
          runtime.stop()
        }),
      )

      const paint = (snapshot: CounterWindowModel) =>
        terminal.display(renderCounterScreen(snapshot))

      yield* paint(runtime.getSnapshot(uri))

      const paintUntilReadyOrFailed = (): Effect.Effect<
        void,
        Cause.Done | PlatformError.PlatformError,
        Terminal.Terminal
      > =>
        Effect.gen(function* () {
          if (runtime.getSnapshot(uri)._tag !== 'StartingWindow') {
            return
          }
          const snapshot = yield* Queue.take(paints)
          yield* paint(snapshot)
          yield* paintUntilReadyOrFailed()
        })
      yield* paintUntilReadyOrFailed()

      const paintLoop = Queue.take(paints).pipe(
        Effect.flatMap(snapshot => paint(snapshot)),
        Effect.forever,
        Effect.asVoid,
      )
      yield* Effect.raceFirst(
        runInputLoop(inputQueue, runtime, paint),
        paintLoop,
      )
    }),
  )
