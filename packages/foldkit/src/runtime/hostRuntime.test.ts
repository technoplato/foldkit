import {
  Context,
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
import * as Subscription from '../subscription/subscription.js'
import { makeHostRuntime } from './hostRuntime.js'

const Incremented = m('Incremented')
const KeptModel = m('KeptModel')
const BasicMessage = S.Union([Incremented, KeptModel])
type BasicMessage = typeof BasicMessage.Type

const BasicModel = S.Struct({ count: S.Number })
type BasicModel = typeof BasicModel.Type

describe('makeHostRuntime', () => {
  it.effect('reads, enqueues, and observes changed Models synchronously', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* makeHostRuntime<BasicModel, BasicMessage>({
          Model: BasicModel,
          init: () => [{ count: 0 }, []],
          update: (model, message) =>
            M.value(message).pipe(
              M.withReturnType<
                readonly [
                  BasicModel,
                  ReadonlyArray<Command.Command<BasicMessage>>,
                ]
              >(),
              M.tagsExhaustive({
                Incremented: () => [{ count: model.count + 1 }, []],
                KeptModel: () => [model, []],
              }),
            ),
          resources: Layer.empty,
        })

        const observedModels: Array<BasicModel> = []
        const stopObserving = runtime.observeModel(model => {
          observedModels.push(model)
        })

        expect(runtime.readModel()).toEqual({ count: 0 })

        runtime.enqueueMessage(Incremented())

        expect(runtime.readModel()).toEqual({ count: 1 })
        expect(observedModels).toEqual([{ count: 1 }])

        runtime.enqueueMessage(KeptModel())
        expect(observedModels).toEqual([{ count: 1 }])

        stopObserving()
        runtime.enqueueMessage(Incremented())

        expect(runtime.readModel()).toEqual({ count: 2 })
        expect(observedModels).toEqual([{ count: 1 }])
      }),
    ),
  )

  it.effect(
    'completes a requested operation after its recursive Command result chain',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const RequestedSave = m('RequestedSave')
          const CompletedSave = m('CompletedSave')
          const CompletedAudit = m('CompletedAudit')
          const Message = S.Union([
            RequestedSave,
            CompletedSave,
            CompletedAudit,
          ])
          type Message = typeof Message.Type

          const Stage = S.Literals(['Ready', 'Saving', 'Saved'])
          const Model = S.Struct({ stage: Stage })
          type Model = typeof Model.Type

          const saveGate = yield* Deferred.make<void>()
          const Save = Command.define(
            'Save',
            CompletedSave,
          )(Effect.as(Deferred.await(saveGate), CompletedSave()))
          const Audit = Command.define(
            'Audit',
            CompletedAudit,
          )(Effect.succeed(CompletedAudit()))

          const runtime = yield* makeHostRuntime<Model, Message>({
            Model,
            init: () => [{ stage: 'Ready' }, []],
            update: (model, message) =>
              M.value(message).pipe(
                M.withReturnType<
                  readonly [Model, ReadonlyArray<Command.Command<Message>>]
                >(),
                M.tagsExhaustive({
                  RequestedSave: () => [{ stage: 'Saving' }, [Save()]],
                  CompletedSave: () => [model, [Audit()]],
                  CompletedAudit: () => [{ stage: 'Saved' }, []],
                }),
              ),
            resources: Layer.empty,
          })

          const operationFiber = yield* Effect.forkChild(
            runtime.run(RequestedSave()),
          )
          yield* Effect.yieldNow

          expect(runtime.readModel()).toEqual({ stage: 'Saving' })
          yield* Deferred.succeed(saveGate, undefined)
          const finalModel = yield* Fiber.join(operationFiber)

          expect(finalModel).toEqual({ stage: 'Saved' })
          expect(runtime.readModel()).toBe(finalModel)
        }),
      ),
  )

  it.effect('tracks the finite Command chain returned by init', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const CompletedRestore = m('CompletedRestore')

        const Mode = S.Literals(['Loading', 'Ready'])
        const Model = S.Struct({ mode: Mode })
        type Model = typeof Model.Type

        const restoreGate = yield* Deferred.make<void>()
        const Restore = Command.define(
          'Restore',
          CompletedRestore,
        )(Effect.as(Deferred.await(restoreGate), CompletedRestore()))

        const runtime = yield* makeHostRuntime<
          Model,
          typeof CompletedRestore.Type
        >({
          Model,
          init: () => [{ mode: 'Loading' }, [Restore()]],
          update: (_model, _message) => [{ mode: 'Ready' }, []],
          resources: Layer.empty,
        })

        expect(runtime.readModel()).toEqual({ mode: 'Loading' })

        yield* Deferred.succeed(restoreGate, undefined)
        const initializedModel = yield* runtime.initialization

        expect(initializedModel).toEqual({ mode: 'Ready' })
        expect(runtime.readModel()).toBe(initializedModel)
      }),
    ),
  )

  it.effect('interrupts an in-flight operation during shutdown', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const RequestedWait = m('RequestedWait')
        const CompletedWait = m('CompletedWait')
        const Message = S.Union([RequestedWait, CompletedWait])
        type Message = typeof Message.Type

        const Mode = S.Literals(['Ready', 'Waiting'])
        const Model = S.Struct({ mode: Mode })
        type Model = typeof Model.Type

        const Wait = Command.define(
          'Wait',
          CompletedWait,
        )(Effect.as(Effect.never, CompletedWait()))

        const runtime = yield* makeHostRuntime<Model, Message>({
          Model,
          init: () => [{ mode: 'Ready' }, []],
          update: (model, message) =>
            M.value(message).pipe(
              M.withReturnType<
                readonly [Model, ReadonlyArray<Command.Command<Message>>]
              >(),
              M.tagsExhaustive({
                RequestedWait: () => [{ mode: 'Waiting' }, [Wait()]],
                CompletedWait: () => [model, []],
              }),
            ),
          resources: Layer.empty,
        })

        const operationFiber = yield* Effect.forkChild(
          runtime.run(RequestedWait()),
        )
        yield* Effect.yieldNow

        expect(runtime.readModel()).toEqual({ mode: 'Waiting' })

        yield* runtime.shutdown
        const operationExit = yield* Fiber.await(operationFiber)

        expect(operationExit._tag).toBe('Failure')
      }),
    ),
  )

  it.effect(
    'shares one resources Layer across Commands and persistent Subscriptions',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const RequestedPersist = m('RequestedPersist')
          const CompletedPersist = m('CompletedPersist')
          const ObservedStoredCount = m('ObservedStoredCount', {
            count: S.Number,
          })
          const Message = S.Union([
            RequestedPersist,
            CompletedPersist,
            ObservedStoredCount,
          ])
          type Message = typeof Message.Type

          const Model = S.Struct({ count: S.Number })
          type Model = typeof Model.Type

          type ResourceShape = Readonly<{
            changes: Queue.Queue<number>
            savedCounts: Array<number>
          }>

          class ResourceService extends Context.Service<
            ResourceService,
            ResourceShape
          >()('HostRuntimeTest/ResourceService') {}

          const resourceReady = yield* Deferred.make<ResourceShape>()
          let buildCount = 0
          let releaseCount = 0

          const ResourceLive = Layer.effect(
            ResourceService,
            Effect.acquireRelease(
              Effect.gen(function* () {
                buildCount += 1
                const resource: ResourceShape = {
                  changes: yield* Queue.unbounded<number>(),
                  savedCounts: [],
                }
                yield* Deferred.succeed(resourceReady, resource)
                return resource
              }),
              () =>
                Effect.sync(() => {
                  releaseCount += 1
                }),
            ),
          )

          const Persist = Command.define(
            'Persist',
            { count: S.Number },
            CompletedPersist,
          )(({ count }) =>
            Effect.gen(function* () {
              const resource = yield* ResourceService
              resource.savedCounts.push(count)
              return CompletedPersist()
            }),
          )

          const subscriptions = Subscription.make<
            Model,
            Message,
            ResourceService
          >()(_entry => ({
            storedCounts: Subscription.persistent(
              Stream.unwrap(
                Effect.map(ResourceService, resource =>
                  Stream.map(Stream.fromQueue(resource.changes), count =>
                    ObservedStoredCount({ count }),
                  ),
                ),
              ),
            ),
          }))

          const runtime = yield* makeHostRuntime<
            Model,
            Message,
            ResourceService
          >({
            Model,
            init: () => [{ count: 0 }, []],
            update: (model, message) =>
              M.value(message).pipe(
                M.withReturnType<
                  readonly [
                    Model,
                    ReadonlyArray<
                      Command.Command<Message, never, ResourceService>
                    >,
                  ]
                >(),
                M.tagsExhaustive({
                  RequestedPersist: () => {
                    const nextCount = model.count + 1
                    return [
                      { count: nextCount },
                      [Persist({ count: nextCount })],
                    ]
                  },
                  CompletedPersist: () => [model, []],
                  ObservedStoredCount: ({ count }) => [{ count }, []],
                }),
              ),
            subscriptions,
            resources: ResourceLive,
          })

          const resource = yield* Deferred.await(resourceReady)
          const persistedModel = yield* runtime.run(RequestedPersist())

          expect(persistedModel).toEqual({ count: 1 })
          expect(resource.savedCounts).toEqual([1])
          expect(buildCount).toBe(1)
          expect(releaseCount).toBe(0)

          const observedModel = yield* Deferred.make<Model>()
          const stopObserving = runtime.observeModel(model => {
            if (model.count === 7) {
              Deferred.doneUnsafe(observedModel, Effect.succeed(model))
            }
          })

          yield* Queue.offer(resource.changes, 7)
          expect(yield* Deferred.await(observedModel)).toEqual({ count: 7 })
          expect(resource.savedCounts).toEqual([1])

          stopObserving()
          yield* runtime.shutdown

          expect(releaseCount).toBe(1)

          yield* runtime.shutdown
          expect(releaseCount).toBe(1)
        }),
      ),
  )
})
