import {
  Effect,
  Fiber,
  Layer,
  Match as M,
  Option,
  Schema as S,
  Stream,
} from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { m } from '../message/index.js'
import { make } from '../program/program.js'
import {
  fromCommand,
  fromHost,
  makeProgramJournal,
  retainLatestTransitions,
} from './programJournal.js'
import { makeProgramRuntime } from './programRuntime.js'
import { replayToFrame } from './replayTape.js'

const RequestedIncrement = m('RequestedIncrement')
const CompletedIncrement = m('CompletedIncrement')
const IncrementedDirectly = m('IncrementedDirectly')
const Message = S.Union([
  RequestedIncrement,
  CompletedIncrement,
  IncrementedDirectly,
])
type Message = typeof Message.Type

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Program = make({
  id: 'journal-counter',
  version: 1,
  Model,
  Message,
  init: () => [Model.make({ count: 0 }), []],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        RequestedIncrement: () => [model, []],
        CompletedIncrement: () => [Model.make({ count: model.count + 1 }), []],
        IncrementedDirectly: () => [Model.make({ count: model.count + 1 }), []],
      }),
    ),
})

describe('Program journal', () => {
  it('publishes every transition while pruning retained history only at a settled boundary', () => {
    const journal = makeProgramJournal({
      program: Program,
      initialModel: Model.make({ count: 0 }),
      archive: retainLatestTransitions({ maximumTransitions: 1 }),
      now: () => 10,
    })
    const observedMessages: Array<Message> = []
    journal.observe(transition => {
      observedMessages.push(transition.message)
    })

    journal.record({
      message: RequestedIncrement(),
      source: fromHost('increment'),
      operationId: 1,
      isOperationSettled: false,
      commands: [{ name: 'Increment' }],
      model: Model.make({ count: 0 }),
    })

    expect(journal.read().transitions).toHaveLength(1)

    journal.record({
      message: CompletedIncrement(),
      source: fromCommand('Increment'),
      operationId: 1,
      isOperationSettled: true,
      commands: [],
      model: Model.make({ count: 1 }),
    })

    expect(journal.read()).toStrictEqual({
      retainedFromSequence: 2,
      initialModel: { count: 1 },
      initialCommands: [],
      transitions: [],
      latestModel: { count: 1 },
    })

    journal.record({
      message: IncrementedDirectly(),
      source: fromHost('increment-directly'),
      isOperationSettled: true,
      commands: [],
      model: Model.make({ count: 2 }),
    })

    expect(observedMessages).toStrictEqual([
      RequestedIncrement(),
      CompletedIncrement(),
      IncrementedDirectly(),
    ])
    expect(journal.read().retainedFromSequence).toBe(2)
    expect(journal.read().transitions).toStrictEqual([
      expect.objectContaining({
        sequence: 3,
        message: IncrementedDirectly(),
      }),
    ])
    expect(journal.modelAt(0)).toStrictEqual(Option.some({ count: 1 }))
    expect(journal.modelAt(1)).toStrictEqual(Option.some({ count: 2 }))

    journal.shutdown()
    journal.record({
      message: IncrementedDirectly(),
      source: fromHost('increment-after-shutdown'),
      isOperationSettled: true,
      commands: [],
      model: Model.make({ count: 3 }),
    })
    expect(journal.read().transitions).toHaveLength(1)
    expect(observedMessages).toHaveLength(3)
  })

  it.effect(
    'gives every Program runtime inert inspection without registration',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
          })
          const transitionFiber = yield* Effect.forkChild(
            Stream.runHead(runtime.journal.transitions),
          )
          yield* Effect.yieldNow

          yield* runtime.run(IncrementedDirectly())

          expect(yield* Fiber.join(transitionFiber)).toStrictEqual(
            Option.some(
              expect.objectContaining({
                message: IncrementedDirectly(),
                sequence: 1,
              }),
            ),
          )
          expect(yield* runtime.replay.inspect(0)).toStrictEqual({ count: 0 })
          expect(yield* runtime.replay.inspect(1)).toStrictEqual({ count: 1 })
          const session = yield* runtime.replay.makeSession(0)
          expect(yield* session.stepForward).toStrictEqual({ count: 1 })
          expect(runtime.replay.stateRoute()).toStrictEqual({
            _tag: 'State',
            model: { count: 1 },
          })
          expect(runtime.replay.replayRoute()).toStrictEqual({
            _tag: 'Replay',
            tape: runtime.replay.readTape(),
            frame: 1,
            isPlaying: false,
          })
          expect(
            yield* replayToFrame(Program, runtime.replay.readTape(), 1),
          ).toStrictEqual({ count: 1 })
        }),
      ),
  )
})
