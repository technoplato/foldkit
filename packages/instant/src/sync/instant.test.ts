import {
  Effect,
  Option,
  Result,
  Schema as S,
  SchemaTransformation,
} from 'effect'
import { Processor, Program, Runtime } from 'foldkit'
import { m } from 'foldkit/message'
import { describe, expect, it } from 'vitest'

import { makeMemorySnapshotLogTransport } from '../snapshotLog/memory.js'
import { Instant, instantCauseString } from './nodeInstant.js'

const Increment = m('Increment')
const Decrement = m('Decrement')
const Reset = m('Reset')
const CounterMessage = S.Union([Increment, Decrement, Reset])

const CounterModel = S.Struct({ count: S.Number })

const Counter = Program.make({
  id: 'instant-sync-counter',
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

const CountProjection = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
}).pipe(
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

const MessageWire = S.Struct({
  id: S.String,
  tag: S.Literals(['Increment', 'Decrement', 'Reset']),
  from: S.String,
  createdAtMs: S.Number,
}).pipe(
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

const Synced = Program.compose.sync({
  of: Counter,
  snapshot: CountProjection,
  message: MessageWire,
})

describe('Instant SyncEngine', () => {
  it('shares one count across two Processors through one transport', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const transport = yield* makeMemorySnapshotLogTransport()
          const cli = Instant({
            app: { id: 'test-app' },
            processor: Processor.Host.Cli(),
            transport,
          })
          const react = Instant({
            app: { id: 'test-app' },
            processor: Processor.Host.React(),
            transport,
          })
          const left = yield* Runtime.start({ program: Synced, sync: cli })
          const right = yield* Runtime.start({ program: Synced, sync: react })
          expect(left.readModel()).toEqual({ _tag: 'Ready', count: 0 })
          yield* left.run(Increment())
          expect(left.readModel()).toEqual({ _tag: 'Ready', count: 1 })
          yield* Effect.callback<void>(resume => {
            const current = right.readModel()
            if (current._tag === 'Ready' && current.count === 1) {
              resume(Effect.void)
              return
            }
            const stop = right.observeModel(model => {
              if (model._tag === 'Ready' && model.count === 1) {
                stop()
                resume(Effect.void)
              }
            })
            return Effect.sync(stop)
          })
          expect(right.readModel()).toEqual({ _tag: 'Ready', count: 1 })
          const write = left.lastWrite()
          expect(Option.isSome(write)).toBe(true)
          if (Option.isSome(write)) {
            expect(write.value).toEqual({ link: 'delivered' })
          }
        }),
      ),
    )
  })

  it('fails Node Instant read when the admin token is missing', async () => {
    const previous = process.env['INSTANT_APP_ADMIN_TOKEN']
    delete process.env['INSTANT_APP_ADMIN_TOKEN']
    const engine = Instant({
      app: { id: '5417c2e3-c6b9-476d-a962-2e11c83492aa' },
      processor: Processor.Host.Cli(),
    })
    const result = await Effect.runPromise(engine.read().pipe(Effect.result))
    if (previous === undefined) {
      delete process.env['INSTANT_APP_ADMIN_TOKEN']
    } else {
      process.env['INSTANT_APP_ADMIN_TOKEN'] = previous
    }
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.cause).toContain('INSTANT_APP_ADMIN_TOKEN')
      expect(result.failure.cause).not.toContain('secret')
    }
  })

  it('does not put a token in an Instant cause string', () => {
    expect(instantCauseString(new Error('network down'))).toBe('network down')
    expect(instantCauseString('offline')).toBe('offline')
  })
})
