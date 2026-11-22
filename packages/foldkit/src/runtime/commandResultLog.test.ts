import {
  Duration,
  Effect,
  Match as M,
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

// What happens to the Message a Command answers with in a synced Program.
// It is taken by the Processor that ran the Command and is not written to
// the shared log, so no other device ever folds it. A result every device
// must see, such as "published", has to reach them another way: as a row
// the Command writes through a port. This file pins that; it does not
// say it should be so.

const ClickedSave = m('ClickedSave')
const CompletedSave = m('CompletedSave')
const Message = S.Union([ClickedSave, CompletedSave])
type Message = typeof Message.Type

const Model = S.Struct({ asked: S.Number, saved: S.Number })
type Model = typeof Model.Type

const Save = Command.define(
  'Save',
  CompletedSave,
)(Effect.succeed(CompletedSave()))

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const Saver = make({
  id: 'command-result-saver',
  version: 1,
  Model,
  Message,
  init: () => [{ asked: 0, saved: 0 }, []],
  update: (model: Model, message: Message) =>
    M.value(message).pipe(
      M.withReturnType<UpdateReturn>(),
      M.tagsExhaustive({
        ClickedSave: () => [{ ...model, asked: model.asked + 1 }, [Save()]],
        CompletedSave: () => [{ ...model, saved: model.saved + 1 }, []],
      }),
    ),
})

const MessageRow = S.Struct({
  id: S.String,
  body: S.String,
  from: S.String,
  createdAtMs: S.Number,
})

const Synced = compose.sync({
  of: Saver,
  snapshot: S.Struct({ asked: S.Number }).pipe(
    S.decodeTo(
      Model,
      SchemaTransformation.transform({
        decode: row => ({ asked: row.asked, saved: 0 }),
        encode: model => ({ asked: model.asked }),
      }),
    ),
  ),
  message: MessageRow.pipe(
    S.decodeTo(
      S.fromJsonString(Saver.Message),
      SchemaTransformation.transform({
        decode: row => row.body,
        encode: body => ({ id: '', body, from: '', createdAtMs: 0 }),
      }),
    ),
  ),
})

const settleAttempts = 400

const settled = <A>(read: () => A, isDone: (value: A) => boolean) =>
  Effect.gen(function* () {
    for (
      let attempt = 0;
      attempt < settleAttempts && !isDone(read());
      attempt += 1
    ) {
      yield* Effect.sleep(Duration.millis(1))
    }
    return read()
  })

const quiet = Effect.sleep(Duration.millis(40))

const tagsIn = (rows: ReadonlyArray<unknown>): ReadonlyArray<string> =>
  rows.map(row => {
    const decoded = S.decodeUnknownSync(MessageRow)(row)
    return S.decodeUnknownSync(S.fromJsonString(Saver.Message))(decoded.body)
      ._tag
  })

describe('the Message a Command answers with, in a synced Program', () => {
  it('is taken where the Command ran, is not written to the shared log, and reaches no other Processor', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const mac = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.Cli(), store }),
          })
          const phone = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.ExpoIos(), store }),
          })

          yield* mac.run(ClickedSave())
          yield* settled(
            () => phone.readModel(),
            model => model._tag === 'Ready' && model.asked === 1,
          )
          yield* quiet

          expect(mac.readModel()).toEqual({ _tag: 'Ready', asked: 1, saved: 1 })
          expect(tagsIn(store.messages)).toEqual(['ClickedSave'])
          expect(phone.readModel()).toEqual({
            _tag: 'Ready',
            asked: 1,
            saved: 0,
          })

          const later = yield* start({
            program: Synced,
            sync: Memory({ processor: Host.React(), store }),
          })
          expect(later.readModel()).toEqual({
            _tag: 'Ready',
            asked: 1,
            saved: 0,
          })
        }),
      ),
    )
  })
})
