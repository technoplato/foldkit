import {
  Context,
  Effect,
  Match as M,
  Option,
  Schema as S,
  SchemaTransformation,
  Tracer,
} from 'effect'
import { describe, expect, it, vi } from 'vitest'

import * as Command from '../command/index.js'
import { m } from '../message/public.js'
import * as Host from '../processor/host.js'
import { compose } from '../program/compose.js'
import { make } from '../program/program.js'
import { CommandOperation } from './commandTracing.js'
import { startHandle } from './handle.js'
import type { TransitionSource } from './programJournal.js'
import { Memory } from './syncEngine.js'

const Increment = m('Increment')
const ClickedSave = m('ClickedSave')
const CompletedSave = m('CompletedSave')
const Message = S.Union([Increment, ClickedSave, CompletedSave])
type Message = typeof Message.Type

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Save = Command.define(
  'Save',
  CompletedSave,
)(Effect.succeed(CompletedSave()))

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const Counter = make({
  id: 'handle-counter',
  version: 1,
  Model,
  Message,
  init: () => [{ count: 0 }, []],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<UpdateReturn>(),
      M.tagsExhaustive({
        Increment: () => [{ count: model.count + 1 }, []],
        ClickedSave: () => [model, [Save()]],
        CompletedSave: () => [model, []],
      }),
    ),
})

const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const MessageRow = S.Struct({
  id: S.String,
  body: S.String,
  from: S.String,
  createdAtMs: S.Number,
})

const SyncedCounter = compose.sync({
  of: Counter,
  snapshot: CountRow.pipe(
    S.decodeTo(
      Model,
      SchemaTransformation.transform({
        decode: row => ({ count: row.value }),
        encode: model => ({
          id: 'handle-counter',
          value: model.count,
          asOf: '',
          at: 0,
        }),
      }),
    ),
  ),
  message: MessageRow.pipe(
    S.decodeTo(
      S.fromJsonString(Counter.Message),
      SchemaTransformation.transform({
        decode: row => row.body,
        encode: body => ({ id: '', body, from: '', createdAtMs: 0 }),
      }),
    ),
  ),
})

type Seen = Readonly<{
  tag: string
  source: TransitionSource
  maybeOperationId: Option.Option<number>
}>

type SeenSpan = Readonly<{
  name: string
  maybeOperationId: Option.Option<number>
}>

const watchedHandle = () => {
  const handle = startHandle({
    program: SyncedCounter,
    sync: Memory({ processor: Host.Cli() }),
    host: Host.Cli(),
  })
  const seen: Array<Seen> = []
  const spans: Array<SeenSpan> = []
  handle.observeRuntime(observation =>
    Effect.acquireRelease(
      Effect.sync(() => [
        observation.journal.observe(transition => {
          seen.push({
            tag: transition.message._tag,
            source: transition.source,
            maybeOperationId: Option.fromNullishOr(transition.operationId),
          })
        }),
        observation.installCommandTracer(
          Tracer.make({
            span: options => {
              spans.push({
                name: options.name,
                maybeOperationId: Option.map(
                  Context.getOption(options.annotations, CommandOperation),
                  ({ operationId }) => operationId,
                ),
              })
              return new Tracer.NativeSpan(options)
            },
          }),
        ),
      ]),
      stops =>
        Effect.sync(() => {
          stops.forEach(stop => stop())
        }),
    ),
  )
  return { handle, seen, spans }
}

describe('Runtime.startHandle provenance', () => {
  it('says the sync runtime sent the snapshot, and a client on another Host what it sent', async () => {
    const { handle, seen } = watchedHandle()
    await vi.waitFor(() => {
      expect(handle.readModel()._tag).toBe('Ready')
    })
    handle.send(Increment())
    handle.onBehalfOf(Host.Tui(), () => {
      handle.send(Increment())
      handle.onBehalfOf(Host.Cli(), () => {
        handle.send(Increment())
      })
      handle.send(Increment())
    })
    handle.send(Increment())
    await vi.waitFor(() => {
      expect(seen).toHaveLength(6)
    })
    await handle.stop()

    expect(seen.map(({ tag, source }) => ({ tag, source }))).toStrictEqual([
      { tag: 'SnapshotReceived', source: { _tag: 'Sync' } },
      { tag: 'Increment', source: { _tag: 'Host' } },
      {
        tag: 'Increment',
        source: { _tag: 'Host', clientHost: Host.Tui() },
      },
      {
        tag: 'Increment',
        source: { _tag: 'Host', clientHost: Host.Cli() },
      },
      {
        tag: 'Increment',
        source: { _tag: 'Host', clientHost: Host.Tui() },
      },
      { tag: 'Increment', source: { _tag: 'Host' } },
    ])
  })

  it('runs the Commands a Message returned under that Message’s operation', async () => {
    const { handle, seen, spans } = watchedHandle()
    await vi.waitFor(() => {
      expect(handle.readModel()._tag).toBe('Ready')
    })
    handle.onBehalfOf(Host.Tui(), () => {
      handle.send(ClickedSave())
    })
    await vi.waitFor(() => {
      expect(seen.map(({ tag }) => tag)).toContain('CompletedSave')
    })
    await handle.stop()

    const operationOf = (tag: string): Option.Option<number> =>
      Option.flatMap(
        Option.fromNullishOr(seen.find(entry => entry.tag === tag)),
        entry => entry.maybeOperationId,
      )
    expect(Option.isSome(operationOf('ClickedSave'))).toBe(true)
    expect(operationOf('CompletedSave')).toStrictEqual(
      operationOf('ClickedSave'),
    )
    expect(spans).toStrictEqual([
      { name: 'Save', maybeOperationId: operationOf('ClickedSave') },
    ])
  })
})
