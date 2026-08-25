import * as Counter from 'counter-core-example'
import {
  ClickedAddCounter,
  GotChild,
  type Message,
  type Model,
  destinationForModel,
} from 'counters-core-example'
import {
  FailedWindow,
  ReadyWindow,
  StartingWindow,
  WindowCounter,
  commitCountersMessage,
  countersProcessorIds,
  instantCountersResources,
  nextAllocatedCounterId,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
} from 'counters-instant-example'
import {
  CountersInstantTapeError,
  resolveCountersTape,
} from 'counters-instant-example/node'
import {
  Array,
  Console,
  Data,
  Effect,
  Match as M,
  Option,
  Result,
} from 'effect'

/** A headless token is not valid. */
export class CountersHeadlessError extends Data.TaggedError(
  'CountersHeadlessError',
)<{
  readonly message: string
}> {}

/** A Ready Model projection. Printed JSON uses Starting, Failed, or Ready. */
export type CountersHeadlessSnapshot = Readonly<{
  counters: ReadonlyArray<Readonly<{ count: number; id: string }>>
  destination: string
}>

const isProgramStoreError = (
  error: unknown,
): error is Readonly<{
  readonly _tag: 'ProgramStoreError'
  readonly cause: unknown
  readonly operation: string
}> =>
  typeof error === 'object' &&
  error !== null &&
  '_tag' in error &&
  error._tag === 'ProgramStoreError'

const instantErrorText = (error: unknown): string => {
  if (error instanceof CountersInstantTapeError) {
    return error.message
  }
  if (isProgramStoreError(error)) {
    if (error.cause instanceof Error && error.cause.message !== '') {
      return error.cause.message
    }
    if (typeof error.cause === 'string' && error.cause !== '') {
      return error.cause
    }
    return `Instant ${error.operation} failed.`
  }
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  return 'Instant could not open the Counters tape.'
}

const headlessInstantError = (error: unknown) =>
  new CountersHeadlessError({ message: instantErrorText(error) })

const failedPrint = (error: string) => FailedWindow.make({ error })

const readyPrint = (model: Model) =>
  ReadyWindow.make({
    counters: Array.map(model.rows, row =>
      WindowCounter.make({
        count: row.child.count,
        id: row.id,
      }),
    ),
  })

const printJson = (value: unknown) => Console.log(JSON.stringify(value))

/** Projects one Model into a renderer-free Ready snapshot. */
export const snapshotForModel = (model: Model): CountersHeadlessSnapshot => ({
  counters: Array.map(model.rows, row => ({
    count: row.child.count,
    id: row.id,
  })),
  destination: destinationForModel(model)._tag,
})

const messageForTokens = (
  model: Model,
  tokens: ReadonlyArray<string>,
): Effect.Effect<Message, CountersHeadlessError> => {
  const maybeVerb = Array.head(tokens)
  if (Option.isNone(maybeVerb)) {
    return Effect.fail(
      new CountersHeadlessError({ message: 'A headless action is required.' }),
    )
  }
  const rest = Array.drop(tokens, 1)
  return M.value(maybeVerb.value).pipe(
    M.when('increment', () => {
      const maybeCounterId = Array.head(rest)
      if (Option.isNone(maybeCounterId)) {
        return Effect.fail(
          new CountersHeadlessError({
            message: 'increment needs a counter id.',
          }),
        )
      }
      return Effect.succeed(
        GotChild({
          id: maybeCounterId.value,
          message: Counter.Increment(),
        }),
      )
    }),
    M.when('decrement', () => {
      const maybeCounterId = Array.head(rest)
      if (Option.isNone(maybeCounterId)) {
        return Effect.fail(
          new CountersHeadlessError({
            message: 'decrement needs a counter id.',
          }),
        )
      }
      return Effect.succeed(
        GotChild({
          id: maybeCounterId.value,
          message: Counter.Decrement(),
        }),
      )
    }),
    M.when('add', () =>
      Effect.succeed(
        ClickedAddCounter({ counterId: nextAllocatedCounterId(model) }),
      ),
    ),
    M.orElse(() =>
      Effect.fail(
        new CountersHeadlessError({
          message: `Unknown action "${maybeVerb.value}". Valid actions: increment, decrement, add.`,
        }),
      ),
    ),
  )
}

const openHeadlessRuntime = () =>
  Effect.gen(function* () {
    const tape = yield* resolveCountersTape({
      ...process.env,
      COUNTERS_PROCESSOR_ID: countersProcessorIds.headless,
      COUNTERS_TAPE: 'instant',
    })
    const opened = yield* openCountersTapeRuntime(
      tape,
      instantCountersResources,
    )
    return { opened, tape }
  }).pipe(Effect.mapError(headlessInstantError))

/** Runs one headless action sequence and returns the final Ready snapshot. */
export const executeHeadless = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<CountersHeadlessSnapshot, CountersHeadlessError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const { opened, tape } = yield* openHeadlessRuntime()
      if (Option.isSome(Array.head(tokens))) {
        const message = yield* messageForTokens(
          opened.runtime.readModel(),
          tokens,
        )
        yield* commitCountersMessage(
          tape,
          opened.runtime,
          opened.cursor,
          message,
        ).pipe(Effect.mapError(headlessInstantError))
      }
      const snapshot = snapshotForModel(opened.runtime.readModel())
      yield* opened.runtime.shutdown
      return snapshot
    }),
  )

/** Prints Starting, then one Ready or Failed snapshot as JSON. */
export const runHeadless = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* printJson(StartingWindow.make({}))
    const snapshot = yield* executeHeadless(tokens).pipe(Effect.result)
    if (Result.isFailure(snapshot)) {
      yield* printJson(failedPrint(snapshot.failure.message))
      return
    }
    yield* printJson(
      ReadyWindow.make({
        counters: Array.map(snapshot.success.counters, counter =>
          WindowCounter.make({
            count: counter.count,
            id: counter.id,
          }),
        ),
      }),
    )
  })

/** Keeps one headless Processor alive and prints each Model change. */
export const watchHeadless = (): Effect.Effect<void> =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* printJson(StartingWindow.make({}))
      const openedRuntime = yield* openHeadlessRuntime().pipe(Effect.result)
      if (Result.isFailure(openedRuntime)) {
        yield* printJson(failedPrint(openedRuntime.failure.message))
        return
      }
      const { opened, tape } = openedRuntime.success
      yield* printJson(readyPrint(opened.runtime.readModel()))
      opened.runtime.observeModel(model => {
        Effect.runSync(printJson(readyPrint(model)))
      })
      const observed = yield* observeRemoteCountersTape(
        tape,
        opened.runtime,
        countersProcessorIds.headless,
      ).pipe(Effect.result)
      if (Result.isFailure(observed)) {
        yield* printJson(failedPrint(instantErrorText(observed.failure)))
      }
    }),
  )
