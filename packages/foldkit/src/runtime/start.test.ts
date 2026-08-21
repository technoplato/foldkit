import { Effect, Schema as S, SchemaTransformation } from 'effect'
import { describe, expect, it } from 'vitest'

import { m } from '../message/public.js'
import * as Host from '../processor/host.js'
import { compose } from '../program/compose.js'
import { make } from '../program/program.js'
import { start } from './start.js'
import { Memory, makeMemoryStore } from './syncEngine.js'

const Increment = m('Increment')
const Decrement = m('Decrement')
const Reset = m('Reset')
const CounterMessage = S.Union([Increment, Decrement, Reset])

const CounterModel = S.Struct({ count: S.Number })

const Counter = make({
  id: 'test-counter',
  version: 1,
  Model: CounterModel,
  Message: CounterMessage,
  init: () => [{ count: 0 }, []],
  update: (model, message) => {
    if (message._tag === 'Increment') {
      return [{ count: model.count + 1 }, []]
    }
    if (message._tag === 'Decrement') {
      return [{ count: model.count - 1 }, []]
    }
    if (message._tag === 'Reset') {
      return [{ count: 0 }, []]
    }
    return [model, []]
  },
})

const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const CountProjection = CountRow.pipe(
  S.decodeTo(
    CounterModel,
    SchemaTransformation.transform({
      decode: row => ({ count: row.value }),
      encode: model => ({
        id: 'c0a7c001-0000-4000-8000-000000000001',
        value: model.count,
        asOf: '',
        at: 0,
      }),
    }),
  ),
)

const MessageRow = S.Struct({
  id: S.String,
  tag: S.Literals(['Increment', 'Decrement', 'Reset']),
  from: S.String,
  createdAtMs: S.Number,
})

const MessageWire = MessageRow.pipe(
  S.decodeTo(
    CounterMessage,
    SchemaTransformation.transform({
      decode: row => ({ _tag: row.tag }),
      encode: message => ({
        id: '',
        tag: message._tag,
        from: '',
        createdAtMs: 0,
      }),
    }),
  ),
)

const Synced = compose.sync({
  of: Counter,
  snapshot: CountProjection,
  message: MessageWire,
})

const runScoped = <A>(effect: Effect.Effect<A, unknown, never>) =>
  Effect.runPromise(effect)

describe('Runtime.start Memory', () => {
  it('shares one count across two Processors', async () => {
    await runScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const cli = Memory({ processor: Host.Cli(), store })
          const react = Memory({ processor: Host.React(), store })
          const left = yield* start({ program: Synced, sync: cli })
          const right = yield* start({ program: Synced, sync: react })
          expect(left.readModel()).toEqual({ _tag: 'Ready', count: 0 })
          yield* left.run(Increment())
          expect(left.readModel()).toEqual({ _tag: 'Ready', count: 1 })
          expect(right.readModel()).toEqual({ _tag: 'Ready', count: 1 })
        }),
      ),
    )
  })

  it('Failed on a non-empty snapshot decode', async () => {
    await runScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          store.snapshot = {
            id: 'c0a7c001-0000-4000-8000-000000000001',
            value: 'nope',
            asOf: 'cli',
            at: 1,
          }
          const runtime = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.Cli(), store }),
          })
          const model = runtime.readModel()
          expect(model._tag).toBe('Failed')
        }),
      ),
    )
  })

  it('skips RemoteMessageReceived when from is this Processor', async () => {
    await runScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const engine = Memory({ processor: Host.Cli(), store })
          const runtime = yield* start({ program: Synced, sync: engine })
          yield* runtime.run(Increment())
          engine.injectMessage({
            id: 'echo-1',
            tag: 'Increment',
            from: 'cli',
            createdAtMs: Date.now(),
          })
          expect(runtime.readModel()).toEqual({ _tag: 'Ready', count: 1 })
        }),
      ),
    )
  })

  it('Failed when boot read fails', async () => {
    await runScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const engine = Memory({ processor: Host.Cli() })
          engine.failNextRead('Instant is down.')
          const runtime = yield* start({ program: Synced, sync: engine })
          const model = runtime.readModel()
          expect(model._tag).toBe('Failed')
          if (model._tag === 'Failed') {
            expect(model.error._tag).toBe('TransportFailed')
            if (model.error._tag === 'TransportFailed') {
              expect(model.error.cause).toBe('Instant is down.')
            }
          }
        }),
      ),
    )
  })

  it('Ready keeps the count when a later write fails', async () => {
    await runScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const engine = Memory({ processor: Host.Cli() })
          const runtime = yield* start({ program: Synced, sync: engine })
          yield* runtime.run(Increment())
          expect(runtime.readModel()).toEqual({ _tag: 'Ready', count: 1 })
          engine.failNextWrite(
            "Invalid id for entity 'count'. Expected a UUID, but received: count",
          )
          yield* runtime.run(Increment())
          expect(runtime.readModel()).toEqual({ _tag: 'Ready', count: 2 })
        }),
      ),
    )
  })

  it('converges to one number after an offline gap with a concurrent reset', async () => {
    const expectEventually = (
      read: () => unknown,
      expected: unknown,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        for (let attempt = 0; attempt < 200; attempt += 1) {
          if (JSON.stringify(read()) === JSON.stringify(expected)) {
            break
          }
          yield* Effect.sleep('5 millis')
        }
        expect(read()).toEqual(expected)
      })
    await runScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const reactEngine = Memory({ processor: Host.React(), store })
          const cliEngine = Memory({ processor: Host.Cli(), store })
          const react = yield* start({ program: Synced, sync: reactEngine })
          const cli = yield* start({ program: Synced, sync: cliEngine })

          for (let tap = 0; tap < 5; tap += 1) {
            yield* react.run(Increment())
          }
          expect(react.readModel()).toEqual({ _tag: 'Ready', count: 5 })
          yield* expectEventually(() => cli.readModel(), {
            _tag: 'Ready',
            count: 5,
          })

          reactEngine.goOffline()
          yield* react.run(Increment())
          yield* react.run(Increment())
          expect(react.readModel()).toEqual({ _tag: 'Ready', count: 7 })
          expect(cli.readModel()).toEqual({ _tag: 'Ready', count: 5 })

          yield* Effect.sleep('5 millis')
          yield* cli.run(Reset())
          yield* cli.run(Increment())
          expect(cli.readModel()).toEqual({ _tag: 'Ready', count: 1 })

          reactEngine.comeOnline()
          yield* expectEventually(() => react.readModel(), {
            _tag: 'Ready',
            count: 1,
          })
          yield* expectEventually(() => cli.readModel(), {
            _tag: 'Ready',
            count: 1,
          })

          const tui = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.Tui(), store }),
          })
          expect(tui.readModel()).toEqual({ _tag: 'Ready', count: 1 })
        }),
      ),
    )
  })

  it('boots by folding the Message log, not the stale count row', async () => {
    await runScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          store.snapshot = {
            id: 'c0a7c001-0000-4000-8000-000000000001',
            value: 10,
            asOf: 'react',
            at: 1_000,
          }
          store.messages = [
            {
              id: 'm-reset',
              tag: 'Reset',
              from: 'cli',
              createdAtMs: 2_000,
            },
            {
              id: 'm-plus',
              tag: 'Increment',
              from: 'cli',
              createdAtMs: 3_000,
            },
          ]
          const runtime = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.Tui(), store }),
          })
          expect(runtime.readModel()).toEqual({ _tag: 'Ready', count: 1 })
        }),
      ),
    )
  })

  it('re-derives when a Message arrives late but happened earlier', async () => {
    await runScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const engine = Memory({ processor: Host.React(), store })
          const runtime = yield* start({ program: Synced, sync: engine })
          for (let tap = 0; tap < 5; tap += 1) {
            yield* runtime.run(Increment())
          }
          expect(runtime.readModel()).toEqual({ _tag: 'Ready', count: 5 })

          engine.injectMessage({
            id: 'late-reset',
            tag: 'Reset',
            from: 'cli',
            createdAtMs: Date.now() + 60_000,
          })
          expect(runtime.readModel()).toEqual({ _tag: 'Ready', count: 0 })

          engine.injectMessage({
            id: 'early-increment',
            tag: 'Increment',
            from: 'tui',
            createdAtMs: Date.now() - 60_000,
          })
          expect(runtime.readModel()).toEqual({ _tag: 'Ready', count: 0 })
        }),
      ),
    )
  })
})
