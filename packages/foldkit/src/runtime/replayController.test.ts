import { Effect, Layer, Match as M, Schema as S } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import * as Command from '../command/index.js'
import { m } from '../message/index.js'
import { make } from '../program/program.js'
import { makeRouter, replay, state } from '../program/route.js'
import { fromCommand, fromHost, makeProgramJournal } from './programJournal.js'
import { makeReplayController } from './replayController.js'
import { fromJournal } from './replayTape.js'

const RequestedSave = m('RequestedSave')
const CompletedSave = m('CompletedSave')
const Message = S.Union([RequestedSave, CompletedSave])
type Message = typeof Message.Type

const Status = S.Literals(['Ready', 'Saving'])
const Model = S.Struct({ count: S.Number, status: Status })
type Model = typeof Model.Type

describe('makeReplayController', () => {
  it.effect(
    'keeps historical Commands inert and runs new Commands after a live branch',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          let saveCount = 0
          const Save = Command.define(
            'Save',
            CompletedSave,
          )(
            Effect.sync(() => {
              saveCount += 1
              return CompletedSave()
            }),
          )
          const Program = make({
            id: 'saved-counter',
            version: 1,
            Model,
            Message,
            init: () => [Model.make({ count: 0, status: 'Ready' }), []],
            update: (model, message) =>
              M.value(message).pipe(
                M.withReturnType<
                  readonly [Model, ReadonlyArray<Command.Command<Message>>]
                >(),
                M.tagsExhaustive({
                  RequestedSave: () => [
                    Model.make({ ...model, status: 'Saving' }),
                    [Save()],
                  ],
                  CompletedSave: () => [
                    Model.make({ count: model.count + 1, status: 'Ready' }),
                    [],
                  ],
                }),
              ),
          })
          const journal = makeProgramJournal({
            program: Program,
            initialModel: Model.make({ count: 0, status: 'Ready' }),
          })
          journal.record({
            message: RequestedSave(),
            source: fromHost('save'),
            operationId: 1,
            isOperationSettled: false,
            commands: [{ name: 'Save' }],
            model: Model.make({ count: 0, status: 'Saving' }),
          })
          journal.record({
            message: CompletedSave(),
            source: fromCommand('Save'),
            operationId: 1,
            isOperationSettled: true,
            commands: [],
            model: Model.make({ count: 1, status: 'Ready' }),
          })
          const tape = fromJournal(Program, journal.read())
          const controller = yield* makeReplayController({
            program: Program,
            resources: Layer.empty,
            route: replay(tape),
          })

          expect(controller.read()).toStrictEqual({
            mode: 'Inspecting',
            model: { count: 1, status: 'Ready' },
            frame: 2,
            finalFrame: 2,
          })
          expect(saveCount).toBe(0)
          expect(yield* controller.seek(0)).toStrictEqual({
            count: 0,
            status: 'Ready',
          })
          expect(yield* controller.seek(2)).toStrictEqual({
            count: 1,
            status: 'Ready',
          })
          expect(saveCount).toBe(0)

          expect(yield* controller.run(RequestedSave())).toStrictEqual({
            count: 2,
            status: 'Ready',
          })
          expect(saveCount).toBe(1)
          expect(controller.read().mode).toBe('Live')
          expect(controller.readReplayTape().transitions).toHaveLength(4)
          expect(controller.replayRoute().frame).toBe(4)
          expect(yield* controller.inspect(1)).toStrictEqual({
            count: 0,
            status: 'Saving',
          })
          expect(controller.read().mode).toBe('Inspecting')
          expect(saveCount).toBe(1)
        }),
      ),
  )

  it.effect(
    'parses a state route and completes its restore Commands live',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          let restoreCount = 0
          const Restore = Command.define(
            'Restore',
            CompletedSave,
          )(
            Effect.sync(() => {
              restoreCount += 1
              return CompletedSave()
            }),
          )
          const Program = make({
            id: 'state-counter',
            version: 1,
            Model,
            Message,
            init: () => [Model.make({ count: 0, status: 'Ready' }), []],
            restore: model => [
              Model.make({ ...model, status: 'Saving' }),
              [Restore()],
            ],
            update: (model, message) =>
              M.value(message).pipe(
                M.withReturnType<
                  readonly [Model, ReadonlyArray<Command.Command<Message>>]
                >(),
                M.tagsExhaustive({
                  RequestedSave: () => [model, []],
                  CompletedSave: () => [
                    Model.make({ count: model.count + 1, status: 'Ready' }),
                    [],
                  ],
                }),
              ),
          })
          const model = Model.make({ count: 7, status: 'Ready' })
          const router = makeRouter(Program)
          const uri = yield* router.print(state(model))
          const route = yield* router.parse(uri)
          if (route._tag !== 'State') {
            throw new Error(`Expected State, received ${route._tag}`)
          }
          const controller = yield* makeReplayController({
            program: Program,
            resources: Layer.empty,
            route,
          })
          const restoredModel = yield* controller.initialization

          expect(controller.read()).toStrictEqual({
            mode: 'Live',
            model: { count: 8, status: 'Ready' },
            frame: 1,
            finalFrame: 1,
          })
          expect(restoredModel).toStrictEqual({ count: 8, status: 'Ready' })
          expect(restoreCount).toBe(1)
          expect(controller.stateRoute()).toStrictEqual(
            state({ count: 8, status: 'Ready' }),
          )
        }),
      ),
  )
})
