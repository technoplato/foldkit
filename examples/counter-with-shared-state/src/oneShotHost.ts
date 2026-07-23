import { Console, Data, Effect, Match as M, Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'

import { ClientLauncher } from './clientLauncher.js'
import {
  Loading,
  Message,
  Model,
  RequestedDecrement,
  RequestedIncrement,
  RequestedReset,
  makeCounterProgram,
} from './counter.js'
import { printCounterUri } from './counterUri.js'
import { counterStorageLayer } from './nodeHost.js'

/** State-changing commands supported by the one-shot Counter host. */
export const StateCommand = S.Literals([
  'Show',
  'Increment',
  'Decrement',
  'Reset',
])
export type StateCommand = typeof StateCommand.Type

/** A one-shot host operation that could not produce a durable integer. */
export class CounterHostError extends Data.TaggedError('CounterHostError')<{
  readonly reason: string
}> {}

const messageForCommand = (command: StateCommand): Option.Option<Message> =>
  M.value(command).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.when('Show', () => Option.none()),
    M.when('Increment', () => Option.some(RequestedIncrement())),
    M.when('Decrement', () => Option.some(RequestedDecrement())),
    M.when('Reset', () => Option.some(RequestedReset())),
    M.exhaustive,
  )

const formatModel = (model: Model): string =>
  M.value(model).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Loading: () => 'Loading()',
      Ready: ({ count }) => `Ready({ count: ${count} })`,
      Saving: ({ count }) => `Saving({ count: ${count} })`,
    }),
  )

const readyCount = (model: Model): Effect.Effect<number, CounterHostError> =>
  M.value(model).pipe(
    M.withReturnType<Effect.Effect<number, CounterHostError>>(),
    M.tagsExhaustive({
      Loading: () =>
        Effect.fail(
          new CounterHostError({
            reason: 'Counter restoration did not complete',
          }),
        ),
      Ready: ({ count }) => Effect.succeed(count),
      Saving: () =>
        Effect.fail(
          new CounterHostError({
            reason: 'Counter persistence did not complete',
          }),
        ),
    }),
  )

const logRestoration = (model: Model) =>
  Console.log(`Restored ${formatModel(model)}`)

const logOperation = (command: StateCommand, model: Model, count: number) =>
  Console.log(
    `\nMessage: Requested${command}\nFinal Model: ${formatModel(model)}\nResult: ${count}`,
  )

const logShowResult = (model: Model, count: number) =>
  Console.log(`\nFinal Model: ${formatModel(model)}\nResult: ${count}`)

/** Runs one state command to causal completion and prints its resulting count. */
export const runStateCommand = (
  command: StateCommand,
  isVerbose: boolean,
): Effect.Effect<void, CounterHostError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Runtime.makeHostRuntime({
        ...makeCounterProgram(Loading()),
        resources: counterStorageLayer(),
      })

      if (isVerbose) {
        yield* Console.log('Restoring Counter...')
      }

      const restoredModel = yield* runtime.initialization
      if (isVerbose) {
        yield* logRestoration(restoredModel)
      }

      const maybeMessage = messageForCommand(command)
      const finalModel = Option.isSome(maybeMessage)
        ? yield* runtime.run(maybeMessage.value)
        : restoredModel
      const count = yield* readyCount(finalModel)

      if (isVerbose) {
        if (Option.isSome(maybeMessage)) {
          yield* logOperation(command, finalModel, count)
        } else {
          yield* logShowResult(finalModel, count)
        }
      } else {
        yield* Console.log(count)
      }

      yield* runtime.shutdown
    }),
  )

/** Restores, serializes, and opens the current Counter in the foreground TUI. */
export const openCounterTui = (
  isVerbose: boolean,
): Effect.Effect<void, CounterHostError, ClientLauncher> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Runtime.makeHostRuntime({
        ...makeCounterProgram(Loading()),
        resources: counterStorageLayer(),
      })
      const model = yield* runtime.initialization
      yield* readyCount(model)
      const uri = printCounterUri(model)

      if (isVerbose) {
        yield* logRestoration(model)
      }

      yield* runtime.shutdown
      const clientLauncher = yield* ClientLauncher
      yield* clientLauncher
        .open('Tui', uri)
        .pipe(
          Effect.mapError(
            error => new CounterHostError({ reason: error.reason }),
          ),
        )
    }),
  )
