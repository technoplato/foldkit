import {
  Deferred,
  Effect,
  Fiber,
  Layer,
  Match as M,
  Queue,
  Schema as S,
  Stream,
} from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import * as Command from '../command/index.js'
import { m } from '../message/index.js'
import { Descriptor } from '../processor/processor.js'
import { make } from '../program/program.js'
import * as Subscription from '../subscription/subscription.js'
import { makeProgramProcessorEndpoint } from './programProcessorEndpoint.js'
import { makeProgramRuntime } from './programRuntime.js'

const processor = Descriptor.make({
  processorId: 'headless-processor',
  clientId: 'headless-client',
  protocol: {
    minimumVersion: 1,
    maximumVersion: 1,
  },
  capabilities: [],
})

const Incremented = m('Incremented')
const CounterMessage = S.Union([Incremented])
type CounterMessage = typeof CounterMessage.Type

const CounterModel = S.Struct({ count: S.Number })
type CounterModel = typeof CounterModel.Type

const CounterProgram = make({
  id: 'processor-counter',
  version: 3,
  Model: CounterModel,
  Message: CounterMessage,
  init: () => [CounterModel.make({ count: 0 }), []],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<readonly [CounterModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Incremented: () => [CounterModel.make({ count: model.count + 1 }), []],
      }),
    ),
})

describe('makeProgramProcessorEndpoint', () => {
  it.effect('exposes the settled initialization snapshot', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const CompletedBoot = m('CompletedBoot')
        const Message = S.Union([CompletedBoot])
        type Message = typeof Message.Type
        const Model = S.Struct({ status: S.String })
        type Model = typeof Model.Type
        const FinishBoot = Command.define(
          'FinishBoot',
          CompletedBoot,
        )(Effect.succeed(CompletedBoot()))
        const Program = make({
          id: 'booting-processor',
          version: 2,
          Model,
          Message,
          init: () => [Model.make({ status: 'Booting' }), [FinishBoot()]],
          update: (_model, message) =>
            M.value(message).pipe(
              M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
              M.tagsExhaustive({
                CompletedBoot: () => [Model.make({ status: 'Ready' }), []],
              }),
            ),
        })
        const runtime = yield* makeProgramRuntime({
          program: Program,
          resources: Layer.empty,
        })

        const endpoint = yield* makeProgramProcessorEndpoint({
          program: Program,
          processor,
          runtime,
        })

        expect(endpoint.readSnapshot()).toStrictEqual({
          protocolVersion: 1,
          processor,
          programId: 'booting-processor',
          programVersion: 2,
          sequence: 1,
          model: { status: 'Ready' },
        })
      }),
    ),
  )

  it.effect(
    'publishes an intermediate Model while run waits for finite work',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const RequestedWork = m('RequestedWork')
          const CompletedWork = m('CompletedWork')
          const Message = S.Union([RequestedWork, CompletedWork])
          type Message = typeof Message.Type
          const Model = S.Struct({ phase: S.String })
          type Model = typeof Model.Type
          const workGate = yield* Deferred.make<void>()
          const FinishWork = Command.define(
            'FinishWork',
            CompletedWork,
          )(Deferred.await(workGate).pipe(Effect.as(CompletedWork())))
          const Program = make({
            id: 'finite-work-processor',
            version: 1,
            Model,
            Message,
            init: () => [Model.make({ phase: 'Idle' }), []],
            update: (_model, message) =>
              M.value(message).pipe(
                M.withReturnType<
                  readonly [Model, ReadonlyArray<Command.Command<Message>>]
                >(),
                M.tagsExhaustive({
                  RequestedWork: () => [
                    Model.make({ phase: 'Working' }),
                    [FinishWork()],
                  ],
                  CompletedWork: () => [Model.make({ phase: 'Finished' }), []],
                }),
              ),
          })
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
          })
          const endpoint = yield* makeProgramProcessorEndpoint({
            program: Program,
            processor,
            runtime,
          })
          const observedWorking = yield* Deferred.make<void>()
          const detach = endpoint.attach(snapshot => {
            if (snapshot.model.phase === 'Working') {
              Deferred.doneUnsafe(observedWorking, Effect.void)
            }
          })

          const runFiber = yield* Effect.forkChild(
            endpoint.run(RequestedWork()),
          )
          yield* Deferred.await(observedWorking)

          expect(endpoint.readSnapshot()).toStrictEqual(
            expect.objectContaining({
              sequence: 1,
              model: { phase: 'Working' },
            }),
          )
          expect(runFiber.pollUnsafe()).toBeUndefined()

          yield* Deferred.succeed(workGate, undefined)
          expect(yield* Fiber.join(runFiber)).toStrictEqual(
            expect.objectContaining({
              sequence: 2,
              model: { phase: 'Finished' },
            }),
          )

          detach()
        }),
      ),
  )

  it.effect('detaches and reconnects without owning Processor lifetime', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* makeProgramRuntime({
          program: CounterProgram,
          resources: Layer.empty,
        })
        const endpoint = yield* makeProgramProcessorEndpoint({
          program: CounterProgram,
          processor,
          runtime,
        })
        const firstConnection: Array<number> = []
        const detachFirst = endpoint.attach(snapshot => {
          firstConnection.push(snapshot.sequence)
        })

        yield* endpoint.run(Incremented())
        detachFirst()
        yield* endpoint.run(Incremented())

        const secondConnection: Array<number> = []
        const detachSecond = endpoint.attach(snapshot => {
          secondConnection.push(snapshot.sequence)
        })
        yield* endpoint.run(Incremented())
        detachSecond()

        expect(firstConnection).toStrictEqual([0, 1])
        expect(secondConnection).toStrictEqual([2, 3])
        expect(endpoint.readSnapshot().model).toStrictEqual({ count: 3 })
      }),
    ),
  )

  it.effect('keeps Subscriptions progressing with no attached Clients', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const ObservedTick = m('ObservedTick', { count: S.Number })
        const Message = S.Union([ObservedTick])
        type Message = typeof Message.Type
        const Model = S.Struct({ count: S.Number })
        type Model = typeof Model.Type
        const ticks = yield* Queue.unbounded<number>()
        const subscriptions = Subscription.make<Model, Message>()(_entry => ({
          ticks: Subscription.persistent(
            Stream.map(Stream.fromQueue(ticks), count =>
              ObservedTick({ count }),
            ),
          ),
        }))
        const Program = make({
          id: 'unattended-subscription',
          version: 1,
          Model,
          Message,
          init: () => [Model.make({ count: 0 }), []],
          update: (_model, message) =>
            M.value(message).pipe(
              M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
              M.tagsExhaustive({
                ObservedTick: ({ count }) => [Model.make({ count }), []],
              }),
            ),
          subscriptions,
        })
        const runtime = yield* makeProgramRuntime({
          program: Program,
          resources: Layer.empty,
        })
        const endpoint = yield* makeProgramProcessorEndpoint({
          program: Program,
          processor,
          runtime,
        })
        const observedTick = yield* Deferred.make<void>()
        const stopObservingJournal = runtime.journal.observe(transition => {
          if (transition.message._tag === 'ObservedTick') {
            Deferred.doneUnsafe(observedTick, Effect.void)
          }
        })

        yield* Queue.offer(ticks, 7)
        yield* Deferred.await(observedTick)

        expect(endpoint.readSnapshot()).toStrictEqual(
          expect.objectContaining({
            sequence: 1,
            model: { count: 7 },
          }),
        )
        stopObservingJournal()
      }),
    ),
  )
})
