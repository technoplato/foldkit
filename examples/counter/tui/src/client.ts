import {
  type Message,
  Model,
  type SyncedCounterHandle,
  actions,
  counterValid,
  describeCounterSyncError,
  renderChrome,
  tokenOf,
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
import { Program } from 'foldkit'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'

/** Renders Starting, Failed, or the imported Counter chrome. */
export const renderCounterScreen = (
  snapshot: Program.SyncedModel<Model, Message>,
): string =>
  M.value(snapshot).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Starting: () => `${CLEAR_SCREEN}Starting Instant Counter…\n\n[Q] quit\n`,
      Failed: ({ error }) =>
        `${CLEAR_SCREEN}${describeCounterSyncError(error)}\n\n[Q] quit\n`,
      Ready: ({ count }) => {
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

const sendForInput = (key: string, handle: SyncedCounterHandle): void => {
  const windowActions = handle.actions()
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
  handle: SyncedCounterHandle,
  paint: (
    snapshot: Program.SyncedModel<Model, Message>,
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
      sendForInput(key, handle)
      return paint(handle.readModel()).pipe(
        Effect.flatMap(() => runInputLoop(inputQueue, handle, paint)),
      )
    }),
  )

/** Paints the synced handle. The Client only subscribes and sends. */
export const runCounterTui = (
  handle: SyncedCounterHandle,
): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const inputQueue = yield* terminal.readInput
      const paints =
        yield* Queue.unbounded<Program.SyncedModel<Model, Message>>()
      const unsubscribe = handle.subscribe(() => {
        Effect.runSync(Queue.offer(paints, handle.readModel()))
      })
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          unsubscribe()
          handle.stop()
        }),
      )

      const paint = (snapshot: Program.SyncedModel<Model, Message>) =>
        terminal.display(renderCounterScreen(snapshot))

      yield* paint(handle.readModel())

      const paintUntilReadyOrFailed = (): Effect.Effect<
        void,
        Cause.Done | PlatformError.PlatformError,
        Terminal.Terminal
      > =>
        Effect.gen(function* () {
          if (handle.readModel()._tag !== 'Starting') {
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
        runInputLoop(inputQueue, handle, paint),
        paintLoop,
      )
    }),
  )
