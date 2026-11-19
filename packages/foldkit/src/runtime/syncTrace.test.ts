import {
  Duration,
  Effect,
  Fiber,
  Schema as S,
  SchemaTransformation,
} from 'effect'
import { describe, expect, it } from 'vitest'

import * as Command from '../command/index.js'
import { m } from '../message/public.js'
import * as Host from '../processor/host.js'
import { compose } from '../program/compose.js'
import { make } from '../program/program.js'
import { start } from './start.js'
import { Memory, makeMemoryStore } from './syncEngine.js'
import type { SyncTrace } from './syncTrace.js'

// NOTE: "Did this press reach that device, and when" is answered by what
// each device's sync runtime says it did: the row it wrote and how the
// write ended, the row it received and from whom, the row it dropped or
// refused, and each change of its link. Both devices name a row by the
// same id, so two traces can be read side by side.

const Increment = m('Increment')
const CounterMessage = S.Union([Increment])
const CounterModel = S.Struct({ count: S.Number })

const Counter = make({
  id: 'trace-counter',
  version: 1,
  Model: CounterModel,
  Message: CounterMessage,
  init: () => [{ count: 0 }, []],
  update: model => [{ count: model.count + 1 }, []],
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
  tag: S.Literals(['Increment']),
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

const eventually = (isSo: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 400 && !isSo(); attempt += 1) {
      yield* Effect.sleep(Duration.millis(5))
    }
  })

const traced = () => {
  const traces: Array<SyncTrace> = []
  return {
    traces,
    listen: (trace: SyncTrace): void => {
      traces.push(trace)
    },
    of: <Tag extends SyncTrace['_tag']>(tag: Tag) =>
      traces.filter(
        (trace): trace is Extract<SyncTrace, { _tag: Tag }> =>
          trace._tag === tag,
      ),
  }
}

describe('what a sync runtime says it did', () => {
  it('says the row it wrote and how the write ended, and the other device says it received that row', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const terminal = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.Cli(), store }),
          })
          const phone = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.ExpoIos(), store }),
          })
          const onTerminal = traced()
          const onPhone = traced()
          terminal.observeSync(onTerminal.listen)
          phone.observeSync(onPhone.listen)
          yield* terminal.run(Increment())
          yield* eventually(() => onPhone.of('ReceivedRow').length === 1)
          const [wrote] = onTerminal.of('WroteRow')
          const [received] = onPhone.of('ReceivedRow')
          expect(wrote).toMatchObject({
            message: 'Increment',
            link: 'delivered',
            isRetry: false,
          })
          expect(received).toMatchObject({
            message: 'Increment',
            from: 'cli',
            isLate: false,
          })
          expect(wrote?.rowId).not.toBe('')
          expect(received?.rowId).toBe(wrote?.rowId)
          // A write is told when the store answers; the row left `tookMs`
          // before that, and the other device has it no sooner.
          expect(received?.timestamp).toBeGreaterThanOrEqual(
            (wrote?.timestamp ?? Infinity) - (wrote?.tookMs ?? 0) - 1,
          )
          // The device that wrote a row never says it received it.
          expect(onTerminal.of('ReceivedRow')).toEqual([])
        }),
      ),
    )
  })

  it('says a write failed, with the engine’s own words, then that the row was written on a retry', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const engine = Memory({
            processor: Host.Cli(),
            store: makeMemoryStore(),
          })
          const runtime = yield* start({ program: Synced, sync: engine })
          const seen = traced()
          runtime.observeSync(seen.listen)
          engine.failNextWrite('The store is partitioned.')
          yield* runtime.run(Increment())
          expect(seen.of('FailedToWriteRow')).toMatchObject([
            { message: 'Increment', cause: 'The store is partitioned.' },
          ])
          yield* eventually(() => seen.of('WroteRow').length === 1)
          const [failed] = seen.of('FailedToWriteRow')
          expect(seen.of('WroteRow')).toMatchObject([
            { rowId: failed?.rowId, link: 'delivered', isRetry: true },
          ])
        }),
      ),
    )
  })

  it('says a row waits when it is written behind one that has not gone out', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const engine = Memory({
            processor: Host.Cli(),
            store: makeMemoryStore(),
          })
          const runtime = yield* start({ program: Synced, sync: engine })
          const seen = traced()
          runtime.observeSync(seen.listen)
          engine.failNextWrite('The store is partitioned.')
          yield* runtime.run(Increment())
          yield* runtime.run(Increment())
          expect(seen.of('QueuedRow')).toMatchObject([{ message: 'Increment' }])
          yield* eventually(() => seen.of('WroteRow').length === 2)
          expect(seen.of('WroteRow').map(wrote => wrote.isRetry)).toEqual([
            true,
            true,
          ])
        }),
      ),
    )
  })

  it('says it dropped a row it could not read, and from whom', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const engine = Memory({
            processor: Host.Cli(),
            store: makeMemoryStore(),
          })
          const runtime = yield* start({ program: Synced, sync: engine })
          const seen = traced()
          runtime.observeSync(seen.listen)
          engine.injectMessage({
            id: 'row-from-a-newer-build',
            tag: 'Multiply',
            from: 'expo-ios',
            createdAtMs: Date.now(),
          })
          yield* eventually(() => seen.of('DroppedRow').length === 1)
          expect(seen.of('DroppedRow')).toMatchObject([
            {
              rowId: 'row-from-a-newer-build',
              from: 'expo-ios',
              cause: 'Message Schema decode failed.',
            },
          ])
          expect(seen.of('ReceivedRow')).toEqual([])
        }),
      ),
    )
  })

  it('says when its link drops and when it is back', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const engine = Memory({
            processor: Host.Cli(),
            store: makeMemoryStore(),
          })
          const runtime = yield* start({ program: Synced, sync: engine })
          const seen = traced()
          runtime.observeSync(seen.listen)
          engine.goOffline()
          engine.comeOnline()
          yield* eventually(() => seen.of('LinkChanged').length >= 2)
          expect(seen.of('LinkChanged').map(changed => changed.link)).toEqual([
            'Offline',
            'Connected',
          ])
        }),
      ),
    )
  })

  it('tells an observer that connects before the runtime boots, as telemetry does', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const seen = traced()
          const runtime = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.Cli(), store: makeMemoryStore() }),
            observers: [
              observation =>
                Effect.sync(() => {
                  observation.observeSync?.(seen.listen)
                }),
            ],
          })
          yield* runtime.run(Increment())
          expect(seen.of('WroteRow')).toMatchObject([{ message: 'Increment' }])
          expect(seen.of('LinkChanged').map(changed => changed.link)).toEqual([
            'Connected',
          ])
        }),
      ),
    )
  })
})

// NOTE: A pause was the slowest thing to send, two seconds, where a play
// took a fifth of one: the row was written only after everything the
// Message started had finished, and a pause saves the place, which the
// store takes its time over. The row tells the other devices what was
// pressed; it leaves as soon as the update has been applied.
describe('when a Message’s row leaves', () => {
  const Pressed = m('Pressed')
  const Saved = m('Saved')
  const SlowMessage = S.Union([Pressed, Saved])
  const SlowModel = S.Struct({ presses: S.Number, saves: S.Number })
  const saveTakesMs = 400
  const SavePlace = Command.define(
    'SavePlace',
    Saved,
  )(Effect.as(Effect.sleep(Duration.millis(saveTakesMs)), Saved()))
  const Slow = make({
    id: 'trace-slow-save',
    version: 1,
    Model: SlowModel,
    Message: SlowMessage,
    init: () => [{ presses: 0, saves: 0 }, []],
    update: (model, message) =>
      message._tag === 'Pressed'
        ? [{ ...model, presses: model.presses + 1 }, [SavePlace()]]
        : [{ ...model, saves: model.saves + 1 }, []],
  })
  const SlowRow = S.Struct({
    id: S.String,
    tag: S.Literals(['Pressed', 'Saved']),
    from: S.String,
    createdAtMs: S.Number,
  })
  const SyncedSlow = compose.sync({
    of: Slow,
    snapshot: S.Struct({
      id: S.String,
      value: S.Number,
      asOf: S.String,
      at: S.Number,
    }).pipe(
      S.decodeTo(
        SlowModel,
        SchemaTransformation.transform({
          decode: row => ({ presses: row.value, saves: 0 }),
          encode: model => ({
            id: 'c0a7c001-0000-4000-8000-000000000002',
            value: model.presses,
            asOf: '',
            at: 0,
          }),
        }),
      ),
    ),
    message: SlowRow.pipe(
      S.decodeTo(
        SlowMessage,
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
    ),
  })

  it('is before what the Message started has finished, and the other device has it then', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const terminal = yield* start({
            program: SyncedSlow,
            sync: Memory({ processor: Host.Cli(), store }),
          })
          const phone = yield* start({
            program: SyncedSlow,
            sync: Memory({ processor: Host.ExpoIos(), store }),
          })
          const onTerminal = traced()
          const onPhone = traced()
          terminal.observeSync(onTerminal.listen)
          phone.observeSync(onPhone.listen)
          const startedAt = Date.now()
          const running = yield* Effect.forkChild(terminal.run(Pressed()))
          yield* eventually(() => onPhone.of('ReceivedRow').length === 1)
          const receivedAfterMs = Date.now() - startedAt
          // The save is still going; the row has left and arrived.
          expect(receivedAfterMs).toBeLessThan(saveTakesMs / 2)
          expect(onTerminal.of('WroteRow')).toMatchObject([
            { message: 'Pressed', link: 'delivered' },
          ])
          expect(terminal.readModel()).toMatchObject({ presses: 1, saves: 0 })
          // The Message's own run still ends only when its save has.
          yield* Fiber.join(running)
          expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
            saveTakesMs - 20,
          )
          expect(terminal.readModel()).toMatchObject({ presses: 1, saves: 1 })
        }),
      ),
    )
  })
})
