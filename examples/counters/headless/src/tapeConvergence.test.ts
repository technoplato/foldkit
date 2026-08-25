import * as Counter from 'counter-core-example'
import {
  ClickedAddCounter,
  CounterRow,
  GotCounterMessage,
  Message,
  Model,
  MultipleCountersProgram,
} from 'counters-core-example'
import {
  Array,
  Effect,
  Equal,
  Option,
  Result,
  Schema as S,
  Scope,
} from 'effect'
import { Program, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

type CountersModel = Program.SyncedModel<typeof Model.Type, typeof Message.Type>

type CountersMessage = Program.SyncedMessage<
  typeof Model.Type,
  typeof Message.Type
>

type CountersRuntime = Runtime.StartedProgram<CountersModel, CountersMessage>

type CountersProcessor = Readonly<{
  engine: Runtime.MemoryEngine
  runtime: CountersRuntime
}>

const SyncedCounters = Program.compose.sync({
  of: MultipleCountersProgram,
  snapshot: Model,
  message: Message,
})

const settleAttempts = 200
const settleDelay = '5 millis'
const distinctWriteMillisecondDelay = '5 millis'

const startCountersProcessor = (
  processorId: string,
  store: Runtime.MemoryStore,
): Effect.Effect<
  CountersProcessor,
  Runtime.ProgramRuntimeStartError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const engine = Runtime.Memory({ processor: processorId, store })
    const runtime = yield* Runtime.start({
      program: SyncedCounters,
      sync: engine,
    })
    return { engine, runtime }
  })

const expectEventuallyEqual = (
  read: () => unknown,
  expected: unknown,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < settleAttempts; attempt += 1) {
      if (Equal.equals(read(), expected)) break
      yield* Effect.sleep(settleDelay)
    }
    expect(Equal.equals(read(), expected)).toBe(true)
  })

const foldCountersMessages = (
  messages: ReadonlyArray<typeof Message.Type>,
): typeof Model.Type => {
  const [initial] = MultipleCountersProgram.init()
  return Array.reduce(messages, initial, (model, message) => {
    const [next] = MultipleCountersProgram.update(model, message)
    return next
  })
}

const RowsProjection = S.Struct({ rows: S.Array(CounterRow) })

const rowsOf = (model: unknown): ReadonlyArray<CounterRow> => {
  const maybeProjection = S.decodeUnknownOption(RowsProjection)(model)
  if (Option.isNone(maybeProjection)) {
    return []
  }
  return maybeProjection.value.rows
}

const countOfRow = (
  rows: ReadonlyArray<CounterRow>,
  counterId: string,
): Option.Option<number> =>
  Option.map(
    Array.findFirst(rows, row => row.id === counterId),
    row => row.counter.count,
  )

const remoteReceivedCountOf = (runtime: CountersRuntime): number =>
  Array.length(
    Array.filter(
      runtime.journal.read().transitions,
      transition => transition.message._tag === 'RemoteMessageReceived',
    ),
  )

const requireWriteLink = (
  write: Option.Option<Runtime.SyncWriteResult>,
  expected: Runtime.SyncLink,
): void => {
  if (Option.isNone(write)) {
    throw new Error(`Expected a ${expected} write result and got none.`)
  }
  expect(write.value.link).toBe(expected)
}

describe('Counters tape convergence on one shared Memory store', () => {
  it('boots two Processors to Ready with identical Models from one tape', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = Runtime.makeMemoryStore()
          const react = yield* startCountersProcessor('react', store)
          const cli = yield* startCountersProcessor('cli', store)

          expect(react.runtime.readModel()._tag).toBe('Ready')
          expect(cli.runtime.readModel()._tag).toBe('Ready')
          expect(
            Equal.equals(react.runtime.readModel(), cli.runtime.readModel()),
          ).toBe(true)
          expect(
            Array.map(rowsOf(cli.runtime.readModel()), row => row.id),
          ).toEqual(['counter-1', 'counter-2'])
        }),
      ),
    )
  })

  it('delivers both ClickedAddCounter rows to a silent peer and keeps the log append-only', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = Runtime.makeMemoryStore()
          const react = yield* startCountersProcessor('react', store)
          const cli = yield* startCountersProcessor('cli', store)

          yield* react.runtime.run(
            ClickedAddCounter({ counterId: 'counter-3' }),
          )
          const maybeFirstRow = Array.get(store.messages, 0)
          expect(Option.isSome(maybeFirstRow)).toBe(true)

          yield* Effect.sleep(distinctWriteMillisecondDelay)

          yield* react.runtime.run(
            ClickedAddCounter({ counterId: 'counter-4' }),
          )

          expect(Array.length(store.messages)).toBe(2)
          expect(Array.get(store.messages, 0)).toStrictEqual(maybeFirstRow)

          const expected = SyncedCounters.Ready(
            foldCountersMessages([
              ClickedAddCounter({ counterId: 'counter-3' }),
              ClickedAddCounter({ counterId: 'counter-4' }),
            ]),
          )
          yield* expectEventuallyEqual(() => cli.runtime.readModel(), expected)
          expect(
            Equal.equals(react.runtime.readModel(), cli.runtime.readModel()),
          ).toBe(true)

          expect(remoteReceivedCountOf(cli.runtime)).toBe(2)
          expect(remoteReceivedCountOf(react.runtime)).toBe(0)

          const snapshotRow = store.snapshot
          expect(S.is(Model)(snapshotRow)).toBe(true)
          expect(Array.map(rowsOf(snapshotRow), row => row.id)).toEqual([
            'counter-1',
            'counter-2',
            'counter-3',
            'counter-4',
          ])
          expect(Object.hasOwn(snapshotRow ?? {}, 'navigation')).toBe(true)
          expect(Object.hasOwn(snapshotRow ?? {}, 'retiredCounterIds')).toBe(
            true,
          )
        }),
      ),
    )
  })

  it('converges increments sent by both Processors in the same tick', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = Runtime.makeMemoryStore()
          const react = yield* startCountersProcessor('react', store)
          const cli = yield* startCountersProcessor('cli', store)

          yield* Effect.forEach(
            [
              react.runtime.run(
                GotCounterMessage({
                  counterId: 'counter-1',
                  message: Counter.Increment(),
                }),
              ),
              cli.runtime.run(
                GotCounterMessage({
                  counterId: 'counter-2',
                  message: Counter.Increment(),
                }),
              ),
            ],
            effect => effect,
            { concurrency: 'unbounded', discard: true },
          )

          const expected = SyncedCounters.Ready(
            foldCountersMessages([
              GotCounterMessage({
                counterId: 'counter-1',
                message: Counter.Increment(),
              }),
              GotCounterMessage({
                counterId: 'counter-2',
                message: Counter.Increment(),
              }),
            ]),
          )
          yield* expectEventuallyEqual(
            () => react.runtime.readModel(),
            expected,
          )
          yield* expectEventuallyEqual(() => cli.runtime.readModel(), expected)

          const reactRows = rowsOf(react.runtime.readModel())
          expect(
            Option.getOrElse(countOfRow(reactRows, 'counter-1'), () => -1),
          ).toBe(1)
          expect(
            Option.getOrElse(countOfRow(reactRows, 'counter-2'), () => -1),
          ).toBe(1)
          expect(Array.length(store.messages)).toBe(2)
        }),
      ),
    )
  })

  it('queues offline writes per engine and converges after comeOnline without loss', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = Runtime.makeMemoryStore()
          const react = yield* startCountersProcessor('react', store)
          const cli = yield* startCountersProcessor('cli', store)

          react.engine.goOffline()
          yield* react.runtime.run(
            GotCounterMessage({
              counterId: 'counter-1',
              message: Counter.Increment(),
            }),
          )

          requireWriteLink(react.runtime.lastWrite(), 'queued')
          expect(
            Option.getOrElse(
              countOfRow(rowsOf(cli.runtime.readModel()), 'counter-1'),
              () => -1,
            ),
          ).toBe(0)

          yield* cli.runtime.run(
            GotCounterMessage({
              counterId: 'counter-2',
              message: Counter.Increment(),
            }),
          )
          requireWriteLink(cli.runtime.lastWrite(), 'delivered')

          const offlineLogLength = Array.length(store.messages)
          expect(offlineLogLength).toBe(1)

          react.engine.comeOnline()

          const expected = SyncedCounters.Ready(
            foldCountersMessages([
              GotCounterMessage({
                counterId: 'counter-1',
                message: Counter.Increment(),
              }),
              GotCounterMessage({
                counterId: 'counter-2',
                message: Counter.Increment(),
              }),
            ]),
          )
          yield* expectEventuallyEqual(
            () => react.runtime.readModel(),
            expected,
          )
          yield* expectEventuallyEqual(() => cli.runtime.readModel(), expected)

          expect(Array.length(store.messages)).toBe(offlineLogLength + 1)
          const storedIds = new Set(
            Array.map(store.messages, row =>
              Option.getOrElse(Runtime.readRowString(row, 'id'), () => ''),
            ),
          )
          expect(storedIds.size).toBe(2)
        }),
      ),
    )
  })

  it('surfaces DecodeFailed for legacy rows and stays Ready through later boots', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = Runtime.makeMemoryStore()
          const react = yield* startCountersProcessor('react', store)

          const settledState = react.runtime.readModel()
          const legacyEventRow = {
            createdAtMs: Date.now(),
            eventId: 'MultipleCounters.ClickedAddCounter',
            eventVersion: 0,
            from: 'legacy-host',
            id: globalThis.crypto.randomUUID(),
            payload: { counterId: 'counter-7' },
          }
          const unknownTagRow = {
            _tag: 'RenamedCounter',
            counterId: 'counter-8',
            createdAtMs: Date.now(),
            from: 'legacy-host',
            id: globalThis.crypto.randomUUID(),
          }

          react.engine.injectMessage(legacyEventRow)
          react.engine.injectMessage(unknownTagRow)

          expect(react.runtime.readModel()._tag).toBe('Ready')
          expect(Equal.equals(react.runtime.readModel(), settledState)).toBe(
            true,
          )

          const failures = Array.filterMap(
            react.runtime.journal.read().transitions,
            transition =>
              transition.message._tag === 'SyncFailed'
                ? Result.succeed(transition.message)
                : Result.failVoid,
          )
          expect(
            Array.map(failures, failure => [
              failure.error._tag,
              failure.error.raw,
            ]),
          ).toEqual([
            ['DecodeFailed', legacyEventRow],
            ['DecodeFailed', unknownTagRow],
          ])

          const latecomer = yield* startCountersProcessor('tui', store)
          expect(latecomer.runtime.readModel()._tag).toBe('Ready')
          expect(
            Equal.equals(latecomer.runtime.readModel(), settledState),
          ).toBe(true)
        }),
      ),
    )
  })
})
