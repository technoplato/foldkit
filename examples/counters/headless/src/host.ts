import * as Counter from 'counter-core-example'
import {
  ClickedAddCounter,
  GotCounterMessage,
  type Message,
  type Model,
  StaticCounterFactClient,
  destinationForModel,
} from 'counters-core-example'
import {
  commitCountersMessage,
  countersProcessorIds,
  instantCountersResources,
  nextAllocatedCounterId,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
} from 'counters-instant-example'
import { resolveCountersTape } from 'counters-instant-example/node'
import { Array, Console, Data, Effect, Match as M, Option } from 'effect'

/** A headless token is not valid. */
export class CountersHeadlessError extends Data.TaggedError(
  'CountersHeadlessError',
)<{
  readonly message: string
}> {}

/** A portable snapshot printed by the headless Processor. */
export type CountersHeadlessSnapshot = Readonly<{
  counters: ReadonlyArray<Readonly<{ count: number; id: string }>>
  destination: string
}>

/** Projects one Model into a renderer-free snapshot. */
export const snapshotForModel = (model: Model): CountersHeadlessSnapshot => ({
  counters: Array.map(model.rows, row => ({
    count: row.counter.count,
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
        GotCounterMessage({
          counterId: maybeCounterId.value,
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
        GotCounterMessage({
          counterId: maybeCounterId.value,
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
    const tape = yield* Effect.orDie(
      resolveCountersTape({
        ...process.env,
        COUNTERS_PROCESSOR_ID: countersProcessorIds.headless,
      }),
    )
    const mode = process.env['COUNTERS_TAPE'] ?? process.env['COUNTER_TAPE']
    const resources =
      mode === 'instant' ? instantCountersResources : StaticCounterFactClient
    const opened = yield* Effect.orDie(openCountersTapeRuntime(tape, resources))
    if (mode === 'instant') {
      yield* observeRemoteCountersTape(
        tape,
        opened.runtime,
        countersProcessorIds.headless,
      ).pipe(Effect.forkChild)
    }
    return { opened, tape }
  })

/** Runs one headless action sequence and returns the final snapshot. */
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
        ).pipe(
          Effect.mapError(
            () =>
              new CountersHeadlessError({
                message: 'Cannot append the Instant tape.',
              }),
          ),
        )
      }
      const snapshot = snapshotForModel(opened.runtime.readModel())
      yield* opened.runtime.shutdown
      return snapshot
    }),
  )

/** Prints one headless snapshot as JSON. */
export const runHeadless = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<void, CountersHeadlessError> =>
  Effect.gen(function* () {
    const snapshot = yield* executeHeadless(tokens)
    yield* Console.log(JSON.stringify(snapshot))
  })

/** Keeps one headless Processor alive and prints each Model change. */
export const watchHeadless = (): Effect.Effect<void, CountersHeadlessError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const { opened } = yield* openHeadlessRuntime()
      yield* Console.log(
        JSON.stringify(snapshotForModel(opened.runtime.readModel())),
      )
      opened.runtime.observeModel(model => {
        Effect.runSync(Console.log(JSON.stringify(snapshotForModel(model))))
      })
      return yield* Effect.never
    }),
  )
