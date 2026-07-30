import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Match as M,
  Option,
  Queue,
  Schema as S,
  Stream,
} from 'effect'
import { expect, vi } from 'vitest'

import { describe, it } from '@effect/vitest'

import * as Command from '../command/index.js'
import * as ManagedResource from '../managedResource/index.js'
import { m } from '../message/index.js'
import * as Port from '../port/index.js'
import { make } from '../program/program.js'
import { makeRouter, state } from '../program/route.js'
import * as Subscription from '../subscription/subscription.js'
import { fromModel, fromReplay, makeProgramRuntime } from './programRuntime.js'
import {
  type ProgramRuntimeEvent,
  decodeReplayTape,
  fromJournal,
} from './replayTape.js'

const Incremented = m('Incremented')
const KeptModel = m('KeptModel')
const BasicMessage = S.Union([Incremented, KeptModel])
type BasicMessage = typeof BasicMessage.Type

const BasicModel = S.Struct({ count: S.Number })
type BasicModel = typeof BasicModel.Type

const BasicProgram = make({
  id: 'basic-counter',
  version: 1,
  Model: BasicModel,
  Message: BasicMessage,
  init: () => [{ count: 0 }, []],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<readonly [BasicModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Incremented: () => [{ count: model.count + 1 }, []],
        KeptModel: () => [model, []],
      }),
    ),
})

describe('makeProgramRuntime', () => {
  it.effect('runs and journals one Program independently of a renderer', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* makeProgramRuntime({
          program: BasicProgram,
          resources: Layer.empty,
          journal: { now: () => 10 },
        })
        const observedModels: Array<BasicModel> = []
        const observedMessages: Array<BasicMessage> = []
        const stopObservingModel = runtime.observeModel(model => {
          observedModels.push(model)
        })
        const stopObservingHistory = runtime.journal.observe(transition => {
          observedMessages.push(transition.message)
        })

        runtime.send(Incremented(), { actionName: 'increment' })
        runtime.send(KeptModel())

        expect(runtime.readModel()).toStrictEqual({ count: 1 })
        expect(observedModels).toStrictEqual([{ count: 1 }])
        expect(observedMessages).toStrictEqual([Incremented(), KeptModel()])
        expect(runtime.journal.read().transitions).toStrictEqual([
          expect.objectContaining({
            sequence: 1,
            message: Incremented(),
            source: { _tag: 'Host', actionName: 'increment' },
          }),
          expect.objectContaining({
            sequence: 2,
            message: KeptModel(),
            source: { _tag: 'Host' },
          }),
        ])

        stopObservingModel()
        stopObservingHistory()
      }),
    ),
  )

  it.effect(
    'runs simultaneous instances of one Program with independent state, evidence, Ports, and resources',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          type RuntimeResourceShape = Readonly<{ id: number }>
          class RuntimeResource extends Context.Service<
            RuntimeResource,
            RuntimeResourceShape
          >()('ProgramRuntimeTest/RuntimeResource') {}

          const ChangedStep = m('ChangedStep', { step: S.Number })
          const RequestedIncrement = m('RequestedIncrement')
          const CompletedReportCount = m('CompletedReportCount', {
            resourceId: S.Number,
          })
          const Message = S.Union([
            ChangedStep,
            RequestedIncrement,
            CompletedReportCount,
          ])
          type Message = typeof Message.Type
          const Model = S.Struct({
            count: S.Number,
            step: S.Number,
            resourceId: S.Option(S.Number),
          })
          type Model = typeof Model.Type
          const ports = {
            inbound: {
              stepChanged: Port.inbound(S.NumberFromString.check(S.isFinite())),
            },
            outbound: { countChanged: Port.outbound(S.Number) },
          }
          const ReportCount = Command.define(
            'ReportCount',
            { count: S.Number },
            CompletedReportCount,
          )(({ count }) =>
            Effect.gen(function* () {
              const resource = yield* RuntimeResource
              yield* Port.emit(ports.outbound.countChanged, count)
              return CompletedReportCount({ resourceId: resource.id })
            }),
          )
          const subscriptions = Subscription.make<Model, Message>()(_entry => ({
            hostStep: Port.subscription(ports.inbound.stepChanged, step =>
              ChangedStep({ step }),
            ),
          }))
          type UpdateReturn = readonly [
            Model,
            ReadonlyArray<Command.Command<Message, never, RuntimeResource>>,
          ]
          const Program = make<
            Model,
            Message,
            never,
            RuntimeResource,
            typeof ports
          >({
            id: 'simultaneous-counter',
            version: 1,
            Model,
            Message,
            init: () => [
              Model.make({
                count: 0,
                step: 1,
                resourceId: Option.none(),
              }),
              [],
            ],
            update: (model, message) =>
              M.value(message).pipe(
                M.withReturnType<UpdateReturn>(),
                M.tagsExhaustive({
                  ChangedStep: ({ step }) => [
                    Model.make({ ...model, step }),
                    [],
                  ],
                  RequestedIncrement: () => {
                    const nextCount = model.count + model.step
                    return [
                      Model.make({ ...model, count: nextCount }),
                      [ReportCount({ count: nextCount })],
                    ]
                  },
                  CompletedReportCount: ({ resourceId }) => [
                    Model.make({
                      ...model,
                      resourceId: Option.some(resourceId),
                    }),
                    [],
                  ],
                }),
              ),
            subscriptions,
            ports,
          })

          const acquiredResourceIds: Array<number> = []
          const releasedResourceIds: Array<number> = []
          let nextResourceId = 0
          const Resources = Layer.effect(
            RuntimeResource,
            Effect.acquireRelease(
              Effect.sync(() => {
                nextResourceId += 1
                const resource = { id: nextResourceId }
                acquiredResourceIds.push(resource.id)
                return resource
              }),
              resource =>
                Effect.sync(() => {
                  releasedResourceIds.push(resource.id)
                }),
            ),
          )

          const runtimeA = yield* makeProgramRuntime({
            program: Program,
            resources: Resources,
            journal: { now: () => 50 },
          })
          const runtimeB = yield* makeProgramRuntime({
            program: Program,
            resources: Resources,
            journal: { now: () => 60 },
          })
          const outboundA: Array<number> = []
          const outboundB: Array<number> = []
          runtimeA.ports.countChanged.subscribe(count => {
            outboundA.push(count)
          })
          runtimeB.ports.countChanged.subscribe(count => {
            outboundB.push(count)
          })

          expect(acquiredResourceIds).toStrictEqual([1, 2])
          expect(Exit.isSuccess(runtimeA.ports.stepChanged.send('2'))).toBe(
            true,
          )
          expect(Exit.isSuccess(runtimeB.ports.stepChanged.send('5'))).toBe(
            true,
          )
          yield* Effect.promise(() =>
            vi.waitFor(() => {
              expect(runtimeA.readModel().step).toBe(2)
              expect(runtimeB.readModel().step).toBe(5)
            }),
          )

          expect(yield* runtimeA.run(RequestedIncrement())).toStrictEqual(
            Model.make({
              count: 2,
              step: 2,
              resourceId: Option.some(1),
            }),
          )
          yield* runtimeB.run(RequestedIncrement())
          expect(yield* runtimeB.run(RequestedIncrement())).toStrictEqual(
            Model.make({
              count: 10,
              step: 5,
              resourceId: Option.some(2),
            }),
          )
          expect(runtimeA.readModel()).toStrictEqual(
            Model.make({
              count: 2,
              step: 2,
              resourceId: Option.some(1),
            }),
          )
          expect(runtimeB.readModel()).toStrictEqual(
            Model.make({
              count: 10,
              step: 5,
              resourceId: Option.some(2),
            }),
          )
          expect(outboundA).toStrictEqual([2])
          expect(outboundB).toStrictEqual([5, 10])

          const journalA = runtimeA.journal.read()
          const journalB = runtimeB.journal.read()
          expect(
            journalA.transitions.map(transition => transition.message._tag),
          ).toStrictEqual([
            'ChangedStep',
            'RequestedIncrement',
            'CompletedReportCount',
          ])
          expect(
            journalB.transitions.map(transition => transition.message._tag),
          ).toStrictEqual([
            'ChangedStep',
            'RequestedIncrement',
            'CompletedReportCount',
            'RequestedIncrement',
            'CompletedReportCount',
          ])
          const encodedTapeA = yield* runtimeA.replay.exportTape
          const encodedTapeB = yield* runtimeB.replay.exportTape
          const tapeA = yield* decodeReplayTape(Program, encodedTapeA)
          const tapeB = yield* decodeReplayTape(Program, encodedTapeB)
          expect(
            tapeA.transitions.map(transition => transition.message._tag),
          ).toStrictEqual([
            'ChangedStep',
            'RequestedIncrement',
            'CompletedReportCount',
          ])
          expect(
            tapeB.transitions.map(transition => transition.message._tag),
          ).toStrictEqual([
            'ChangedStep',
            'RequestedIncrement',
            'CompletedReportCount',
            'RequestedIncrement',
            'CompletedReportCount',
          ])
          expect(
            tapeA.transitions.every(transition => transition.timestamp === 50),
          ).toBe(true)
          expect(
            tapeB.transitions.every(transition => transition.timestamp === 60),
          ).toBe(true)

          yield* runtimeA.shutdown
          expect(releasedResourceIds).toStrictEqual([1])
          expect(Exit.isSuccess(runtimeB.ports.stepChanged.send('3'))).toBe(
            true,
          )
          yield* Effect.promise(() =>
            vi.waitFor(() => {
              expect(runtimeB.readModel().step).toBe(3)
            }),
          )
          expect(yield* runtimeB.run(RequestedIncrement())).toStrictEqual(
            Model.make({
              count: 13,
              step: 3,
              resourceId: Option.some(2),
            }),
          )
          expect(runtimeA.readModel()).toStrictEqual(
            Model.make({
              count: 2,
              step: 2,
              resourceId: Option.some(1),
            }),
          )
          expect(outboundA).toStrictEqual([2])
          expect(outboundB).toStrictEqual([5, 10, 13])
          expect(runtimeA.journal.read().transitions).toHaveLength(3)
          expect(runtimeB.journal.read().transitions).toHaveLength(8)
          expect(releasedResourceIds).toStrictEqual([1])

          yield* runtimeB.shutdown
          expect(releasedResourceIds).toStrictEqual([1, 2])
        }),
      ),
  )

  it.effect(
    'records host runtime events beside Messages without turning them into transitions',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* makeProgramRuntime({
            program: BasicProgram,
            resources: Layer.empty,
            journal: { now: () => 40 },
          })
          const observedEvents: Array<ProgramRuntimeEvent> = []
          const stopObserving = runtime.timeline.observe(event => {
            observedEvents.push(event)
          })

          runtime.timeline.record({
            name: 'SelectedDependencyImplementation',
            attributes: {
              dependency: 'FactClient',
              implementation: 'Mock',
            },
          })
          yield* runtime.run(Incremented())
          runtime.timeline.record({
            name: 'SelectedDependencyImplementation',
            attributes: {
              dependency: 'FactClient',
              implementation: 'Live',
            },
          })

          expect(runtime.journal.read().transitions).toHaveLength(1)
          expect(runtime.timeline.read()).toStrictEqual([
            {
              name: 'SelectedDependencyImplementation',
              attributes: {
                dependency: 'FactClient',
                implementation: 'Mock',
              },
              afterFrame: 0,
              timestamp: 40,
            },
            {
              name: 'SelectedDependencyImplementation',
              attributes: {
                dependency: 'FactClient',
                implementation: 'Live',
              },
              afterFrame: 1,
              timestamp: 40,
            },
          ])
          expect(observedEvents).toStrictEqual(runtime.timeline.read())

          const json = yield* runtime.replay.exportTape
          const tape = yield* decodeReplayTape(BasicProgram, json)
          expect(tape.runtimeEvents).toStrictEqual(runtime.timeline.read())

          stopObserving()
          yield* runtime.shutdown
        }),
      ),
  )

  it.effect('acquires Resources eagerly and preserves acquisition errors', () =>
    Effect.scoped(
      Effect.gen(function* () {
        class ResourceStartupError extends S.TaggedErrorClass<ResourceStartupError>()(
          'ResourceStartupError',
          { message: S.String },
        ) {}
        class StartupResource extends Context.Service<
          StartupResource,
          Readonly<{ value: number }>
        >()('ProgramRuntimeTest/StartupResource') {}

        const CompletedStartup = m('CompletedStartup')
        const StartupMessage = S.Union([CompletedStartup])
        type StartupMessage = typeof StartupMessage.Type
        const StartResource = Command.define(
          'StartResource',
          CompletedStartup,
        )(Effect.map(StartupResource, () => CompletedStartup()))
        const Program = make({
          id: 'resource-startup-error',
          version: 1,
          Model: BasicModel,
          Message: StartupMessage,
          init: () => [BasicModel.make({ count: 0 }), [StartResource()]],
          update: model => [model, []],
        })
        const startupError = new ResourceStartupError({
          message: 'Resource unavailable',
        })
        let acquisitionCount = 0
        const Resources = Layer.effect(
          StartupResource,
          Effect.andThen(
            Effect.sync(() => {
              acquisitionCount += 1
            }),
            Effect.fail(startupError),
          ),
        )

        const error = yield* Effect.flip(
          makeProgramRuntime({ program: Program, resources: Resources }),
        )

        expect(error).toBe(startupError)
        expect(acquisitionCount).toBe(1)
      }),
    ),
  )

  it.effect(
    'completes and exports the full recursive Command result chain',
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
          let saveCount = 0
          const Save = Command.define(
            'Save',
            CompletedSave,
          )(
            Effect.gen(function* () {
              saveCount += 1
              yield* Deferred.await(saveGate)
              return CompletedSave()
            }),
          )
          const Audit = Command.define(
            'Audit',
            CompletedAudit,
          )(Effect.succeed(CompletedAudit()))
          const Program = make({
            id: 'recursive-save',
            version: 1,
            Model,
            Message,
            init: () => [Model.make({ stage: 'Ready' }), []],
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
          })
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
            journal: { now: () => 20 },
          })

          const operationFiber = yield* Effect.forkChild(
            runtime.run(RequestedSave(), { actionName: 'save' }),
          )
          yield* Effect.promise(
            () => new Promise(resolve => setTimeout(resolve, 10)),
          )
          expect(runtime.readModel()).toStrictEqual({ stage: 'Saving' })

          yield* Deferred.succeed(saveGate, undefined)
          expect(yield* Fiber.join(operationFiber)).toStrictEqual({
            stage: 'Saved',
          })

          const transitions = runtime.journal.read().transitions
          expect(transitions).toHaveLength(3)
          expect(transitions).toStrictEqual([
            expect.objectContaining({
              message: RequestedSave(),
              source: { _tag: 'Host', actionName: 'save' },
              operationId: 1,
              isOperationSettled: false,
            }),
            expect.objectContaining({
              message: CompletedSave(),
              source: { _tag: 'Command', name: 'Save' },
              operationId: 1,
              isOperationSettled: false,
            }),
            expect.objectContaining({
              message: CompletedAudit(),
              source: { _tag: 'Command', name: 'Audit' },
              operationId: 1,
              isOperationSettled: true,
            }),
          ])

          const json = yield* runtime.replay.exportTape
          const tape = yield* decodeReplayTape(Program, json)
          expect(tape.transitions).toHaveLength(3)
          expect(saveCount).toBe(1)
          expect(yield* runtime.replay.inspect(1)).toStrictEqual({
            stage: 'Saving',
          })
          expect(yield* runtime.replay.inspect(3)).toStrictEqual({
            stage: 'Saved',
          })
          expect(saveCount).toBe(1)
        }),
      ),
  )

  it.effect(
    'reconstructs startup Commands through the Program restore initializer',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const Restored = m('Restored')
          const Message = S.Union([Restored])
          type Message = typeof Message.Type
          const Model = S.Struct({ status: S.Literals(['Loading', 'Ready']) })
          type Model = typeof Model.Type
          const FinishRestore = Command.define(
            'FinishRestore',
            Restored,
          )(Effect.succeed(Restored()))
          const Program = make({
            id: 'restorable',
            version: 1,
            Model,
            Message,
            init: () => [Model.make({ status: 'Ready' }), []],
            restore: model =>
              model.status === 'Loading'
                ? [model, [FinishRestore()]]
                : [model, []],
            update: (_model, message) =>
              M.value(message).pipe(
                M.withReturnType<
                  readonly [Model, ReadonlyArray<Command.Command<Message>>]
                >(),
                M.tagsExhaustive({
                  Restored: () => [Model.make({ status: 'Ready' }), []],
                }),
              ),
          })
          const router = makeRouter(Program)
          const uri = yield* router.print(
            state(Model.make({ status: 'Loading' })),
          )
          const route = yield* router.parse(uri)
          if (route._tag !== 'State') {
            throw new Error(`Expected State, received ${route._tag}`)
          }
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
            start: fromModel(route.model),
          })

          expect(uri.startsWith('/restorable/state?model=')).toBe(true)
          expect(yield* runtime.initialization).toStrictEqual({
            status: 'Ready',
          })
          expect(runtime.journal.read().initialCommands).toStrictEqual([
            { name: 'FinishRestore' },
          ])
          expect(runtime.journal.read().transitions).toStrictEqual([
            expect.objectContaining({
              message: Restored(),
              source: { _tag: 'Command', name: 'FinishRestore' },
              operationId: 0,
              isOperationSettled: true,
            }),
          ])
        }),
      ),
  )

  it.effect('shares one resource Layer across Commands and Subscriptions', () =>
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
        >()('ProgramRuntimeTest/ResourceService') {}

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
        const Program = make({
          id: 'stored-counter',
          version: 1,
          Model,
          Message,
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
                  return [{ count: nextCount }, [Persist({ count: nextCount })]]
                },
                CompletedPersist: () => [model, []],
                ObservedStoredCount: ({ count }) => [{ count }, []],
              }),
            ),
          subscriptions,
        })
        const runtime = yield* makeProgramRuntime({
          program: Program,
          resources: ResourceLive,
        })

        const resource = yield* Deferred.await(resourceReady)
        expect(yield* runtime.run(RequestedPersist())).toStrictEqual({
          count: 1,
        })
        expect(resource.savedCounts).toStrictEqual([1])
        expect(buildCount).toBe(1)

        const observedModel = yield* Deferred.make<Model>()
        runtime.observeModel(model => {
          if (model.count === 7) {
            Deferred.doneUnsafe(observedModel, Effect.succeed(model))
          }
        })
        yield* Queue.offer(resource.changes, 7)
        expect(yield* Deferred.await(observedModel)).toStrictEqual({ count: 7 })
        expect(runtime.journal.read().transitions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              source: { _tag: 'Subscription', name: 'storedCounts' },
            }),
          ]),
        )
        expect(runtime.readDiagnostics()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              _tag: 'StartedSubscription',
              programId: 'stored-counter',
              name: 'storedCounts',
            }),
          ]),
        )

        yield* runtime.shutdown
        expect(releaseCount).toBe(1)
        expect(
          runtime.readDiagnostics().map(diagnostic => diagnostic._tag),
        ).toStrictEqual(['StartedSubscription', 'StoppedSubscription'])
      }),
    ),
  )

  it.effect(
    'owns ManagedResource acquisition, replacement, access, and release',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          type EngineShape = Readonly<{ id: string }>
          const Engine = ManagedResource.tag<EngineShape>()('Engine')
          type EngineService = ManagedResource.ServiceOf<typeof Engine>

          const RequestedEngine = m('RequestedEngine', { id: S.String })
          const AcquiredEngine = m('AcquiredEngine', { id: S.String })
          const ReleasedEngine = m('ReleasedEngine')
          const FailedAcquireEngine = m('FailedAcquireEngine', {
            reason: S.String,
          })
          const RequestedReadEngine = m('RequestedReadEngine')
          const CompletedReadEngine = m('CompletedReadEngine', {
            id: S.String,
          })
          const Message = S.Union([
            RequestedEngine,
            AcquiredEngine,
            ReleasedEngine,
            FailedAcquireEngine,
            RequestedReadEngine,
            CompletedReadEngine,
          ])
          type Message = typeof Message.Type
          const Model = S.Struct({
            requestedId: S.Option(S.String),
            status: S.String,
            readId: S.Option(S.String),
          })
          type Model = typeof Model.Type
          const ReadEngine = Command.define(
            'ReadEngine',
            CompletedReadEngine,
          )(
            Engine.get.pipe(
              Effect.map(({ id }) => CompletedReadEngine({ id })),
              Effect.catchTag('ResourceNotAvailable', () =>
                Effect.succeed(CompletedReadEngine({ id: 'unavailable' })),
              ),
            ),
          )
          const lifecycle: Array<string> = []
          const managedResources = ManagedResource.make<Model, Message>()(
            entry => ({
              engine: entry(S.Option(S.Struct({ id: S.String })), {
                resource: Engine,
                modelToMaybeRequirements: model =>
                  Option.map(model.requestedId, id => ({ id })),
                acquire: ({ id }) =>
                  Effect.gen(function* () {
                    lifecycle.push(`acquire:${id}`)
                    yield* Effect.addFinalizer(() =>
                      Effect.sync(() => {
                        lifecycle.push(`finalize:${id}`)
                      }),
                    )
                    return { id }
                  }),
                release: ({ id }) =>
                  Effect.sync(() => {
                    lifecycle.push(`release:${id}`)
                  }),
                onAcquired: ({ id }) => AcquiredEngine({ id }),
                onReleased: () => ReleasedEngine(),
                onAcquireError: error =>
                  FailedAcquireEngine({ reason: String(error) }),
              }),
            }),
          )
          type UpdateReturn = readonly [
            Model,
            ReadonlyArray<Command.Command<Message, never, EngineService>>,
          ]
          const Program = make<Model, Message, never, EngineService>({
            id: 'managed-engine',
            version: 1,
            Model,
            Message,
            init: () => [
              Model.make({
                requestedId: Option.some('a'),
                status: 'idle',
                readId: Option.none(),
              }),
              [],
            ],
            update: (model, message) =>
              M.value(message).pipe(
                M.withReturnType<UpdateReturn>(),
                M.tagsExhaustive({
                  RequestedEngine: ({ id }) => [
                    Model.make({
                      ...model,
                      requestedId: Option.some(id),
                    }),
                    [],
                  ],
                  AcquiredEngine: ({ id }) => [
                    Model.make({ ...model, status: `acquired:${id}` }),
                    [],
                  ],
                  ReleasedEngine: () => [
                    Model.make({ ...model, status: 'released' }),
                    [],
                  ],
                  FailedAcquireEngine: ({ reason }) => [
                    Model.make({ ...model, status: `failed:${reason}` }),
                    [],
                  ],
                  RequestedReadEngine: () => [model, [ReadEngine()]],
                  CompletedReadEngine: ({ id }) => [
                    Model.make({ ...model, readId: Option.some(id) }),
                    [],
                  ],
                }),
              ),
            managedResources,
          })
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
            journal: { now: () => 30 },
          })
          const awaitModel = (
            predicate: (model: Model) => boolean,
          ): Effect.Effect<Model> => {
            const currentModel = runtime.readModel()
            if (predicate(currentModel)) {
              return Effect.succeed(currentModel)
            }
            return Effect.gen(function* () {
              const completed = yield* Deferred.make<Model>()
              const stop = runtime.observeModel(model => {
                if (predicate(model)) {
                  Deferred.doneUnsafe(completed, Effect.succeed(model))
                }
              })
              return yield* Deferred.await(completed).pipe(
                Effect.ensuring(Effect.sync(stop)),
              )
            })
          }

          expect(
            yield* awaitModel(model => model.status === 'acquired:a'),
          ).toStrictEqual(expect.objectContaining({ status: 'acquired:a' }))
          expect(yield* runtime.run(RequestedReadEngine())).toStrictEqual(
            expect.objectContaining({ readId: Option.some('a') }),
          )

          runtime.send(RequestedEngine({ id: 'b' }))
          expect(
            yield* awaitModel(model => model.status === 'acquired:b'),
          ).toStrictEqual(expect.objectContaining({ status: 'acquired:b' }))
          expect(lifecycle).toStrictEqual([
            'acquire:a',
            'release:a',
            'finalize:a',
            'acquire:b',
          ])
          expect(runtime.journal.read().transitions).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                message: AcquiredEngine({ id: 'a' }),
                source: { _tag: 'ManagedResource', name: 'engine' },
              }),
              expect.objectContaining({
                message: ReleasedEngine(),
                source: { _tag: 'ManagedResource', name: 'engine' },
              }),
              expect.objectContaining({
                message: AcquiredEngine({ id: 'b' }),
                source: { _tag: 'ManagedResource', name: 'engine' },
              }),
            ]),
          )
          expect(
            runtime.readDiagnostics().map(diagnostic => diagnostic._tag),
          ).toStrictEqual([
            'StartedAcquiringManagedResource',
            'AcquiredManagedResource',
            'StartedReleasingManagedResource',
            'ReleasedManagedResource',
            'StartedAcquiringManagedResource',
            'AcquiredManagedResource',
          ])
          expect(runtime.readDiagnostics()).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: 'AcquiredManagedResource',
                programId: 'managed-engine',
                name: 'engine',
                instanceId: 1,
                timestamp: 30,
              }),
            ]),
          )

          yield* runtime.shutdown
          expect(lifecycle).toStrictEqual([
            'acquire:a',
            'release:a',
            'finalize:a',
            'acquire:b',
            'release:b',
            'finalize:b',
          ])
          expect(
            runtime.readDiagnostics().map(diagnostic => diagnostic._tag),
          ).toStrictEqual([
            'StartedAcquiringManagedResource',
            'AcquiredManagedResource',
            'StartedReleasingManagedResource',
            'ReleasedManagedResource',
            'StartedAcquiringManagedResource',
            'AcquiredManagedResource',
            'StartedReleasingManagedResource',
            'ReleasedManagedResource',
          ])
        }),
      ),
  )

  it.effect(
    'reports non-fatal ManagedResource acquisition and release failures',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          type EngineShape = Readonly<{ id: string }>
          const Engine = ManagedResource.tag<EngineShape>()('FallibleEngine')
          type EngineService = ManagedResource.ServiceOf<typeof Engine>

          const RequestedEngine = m('RequestedEngine', { id: S.String })
          const RequestedReleaseEngine = m('RequestedReleaseEngine')
          const AcquiredEngine = m('AcquiredEngine', { id: S.String })
          const ReleasedEngine = m('ReleasedEngine')
          const FailedAcquireEngine = m('FailedAcquireEngine', {
            reason: S.String,
          })
          const Message = S.Union([
            RequestedEngine,
            RequestedReleaseEngine,
            AcquiredEngine,
            ReleasedEngine,
            FailedAcquireEngine,
          ])
          type Message = typeof Message.Type
          const Model = S.Struct({
            maybeRequestedId: S.Option(S.String),
            status: S.String,
          })
          type Model = typeof Model.Type
          const managedResources = ManagedResource.make<Model, Message>()(
            entry => ({
              engine: entry(S.Option(S.Struct({ id: S.String })), {
                resource: Engine,
                modelToMaybeRequirements: model =>
                  Option.map(model.maybeRequestedId, id => ({ id })),
                acquire: ({ id }) =>
                  id === 'bad'
                    ? Effect.fail(new Error('acquire exploded'))
                    : Effect.succeed({ id }),
                release: () => Effect.die(new Error('release exploded')),
                onAcquired: ({ id }) => AcquiredEngine({ id }),
                onReleased: ReleasedEngine,
                onAcquireError: error =>
                  FailedAcquireEngine({ reason: String(error) }),
              }),
            }),
          )
          type UpdateReturn = readonly [
            Model,
            ReadonlyArray<Command.Command<Message, never, EngineService>>,
          ]
          const Program = make<Model, Message, never, EngineService>({
            id: 'fallible-managed-engine',
            version: 1,
            Model,
            Message,
            init: () => [
              Model.make({
                maybeRequestedId: Option.none(),
                status: 'idle',
              }),
              [],
            ],
            update: (model, message) =>
              M.value(message).pipe(
                M.withReturnType<UpdateReturn>(),
                M.tagsExhaustive({
                  RequestedEngine: ({ id }) => [
                    Model.make({
                      maybeRequestedId: Option.some(id),
                      status: 'acquiring',
                    }),
                    [],
                  ],
                  RequestedReleaseEngine: () => [
                    Model.make({
                      maybeRequestedId: Option.none(),
                      status: 'releasing',
                    }),
                    [],
                  ],
                  AcquiredEngine: ({ id }) => [
                    Model.make({ ...model, status: `acquired:${id}` }),
                    [],
                  ],
                  ReleasedEngine: () => [
                    Model.make({ ...model, status: 'released' }),
                    [],
                  ],
                  FailedAcquireEngine: ({ reason }) => [
                    Model.make({ ...model, status: reason }),
                    [],
                  ],
                }),
              ),
            managedResources,
          })
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
            journal: { now: () => 35 },
          })

          runtime.send(RequestedEngine({ id: 'bad' }))
          yield* Effect.promise(() =>
            vi.waitFor(() => {
              expect(
                runtime.readDiagnostics().map(diagnostic => diagnostic._tag),
              ).toContain('FailedAcquiringManagedResource')
              expect(runtime.readModel().status).toContain('acquire exploded')
            }),
          )
          runtime.send(RequestedEngine({ id: 'good' }))
          yield* Effect.promise(() =>
            vi.waitFor(() => {
              expect(runtime.readModel().status).toBe('acquired:good')
            }),
          )
          runtime.send(RequestedReleaseEngine())
          yield* Effect.promise(() =>
            vi.waitFor(() => {
              expect(
                runtime.readDiagnostics().map(diagnostic => diagnostic._tag),
              ).toContain('FailedReleasingManagedResource')
            }),
          )

          expect(
            runtime.readDiagnostics().map(diagnostic => diagnostic._tag),
          ).toStrictEqual([
            'StartedAcquiringManagedResource',
            'FailedAcquiringManagedResource',
            'StartedAcquiringManagedResource',
            'AcquiredManagedResource',
            'StartedReleasingManagedResource',
            'FailedReleasingManagedResource',
          ])
          expect(runtime.readFailures()).toStrictEqual([])
        }),
      ),
  )

  it.effect(
    'reports Subscription failure diagnostics and terminal failure provenance',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const ObservedValue = m('ObservedValue')
          const Message = S.Union([ObservedValue])
          type Message = typeof Message.Type
          const Model = S.Struct({ status: S.String })
          type Model = typeof Model.Type
          const failureGate = yield* Deferred.make<void>()
          const subscriptions = Subscription.make<Model, Message>()(_entry => ({
            failingValues: Subscription.persistent<Message>(
              Stream.fromEffect(
                Deferred.await(failureGate).pipe(
                  Effect.andThen(
                    Effect.die(new Error('subscription exploded')),
                  ),
                ),
              ),
            ),
          }))
          const Program = make({
            id: 'failing-subscription',
            version: 1,
            Model,
            Message,
            init: () => [Model.make({ status: 'ready' }), []],
            update: (model, message) =>
              M.value(message).pipe(
                M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
                M.tagsExhaustive({
                  ObservedValue: () => [model, []],
                }),
              ),
            subscriptions,
          })
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
            journal: { now: () => 36 },
          })
          const failureReceived = yield* Deferred.make<void>()
          runtime.observeFailures(() => {
            Deferred.doneUnsafe(failureReceived, Effect.void)
          })

          yield* Deferred.succeed(failureGate, undefined)
          yield* Deferred.await(failureReceived)

          expect(
            runtime.readDiagnostics().map(diagnostic => diagnostic._tag),
          ).toStrictEqual([
            'StartedSubscription',
            'FailedSubscription',
            'StoppedSubscription',
          ])
          expect(runtime.readFailures()).toStrictEqual([
            expect.objectContaining({
              programId: 'failing-subscription',
              source: { _tag: 'Subscription', name: 'failingValues' },
              message: Option.none(),
              timestamp: 36,
            }),
          ])
        }),
      ),
  )

  it.effect('owns typed Port channels, handles, and provenance', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const ChangedStep = m('ChangedStep', { step: S.Number })
        const RequestedIncrement = m('RequestedIncrement')
        const CompletedReportCount = m('CompletedReportCount')
        const Message = S.Union([
          ChangedStep,
          RequestedIncrement,
          CompletedReportCount,
        ])
        type Message = typeof Message.Type
        const Model = S.Struct({ count: S.Number, step: S.Number })
        type Model = typeof Model.Type
        const ports = {
          inbound: {
            stepChanged: Port.inbound(S.NumberFromString.check(S.isFinite())),
          },
          outbound: { countChanged: Port.outbound(S.Number) },
        }
        const ReportCount = Command.define(
          'ReportCount',
          { count: S.Number },
          CompletedReportCount,
        )(({ count }) =>
          Port.emit(ports.outbound.countChanged, count).pipe(
            Effect.as(CompletedReportCount()),
          ),
        )
        const subscriptions = Subscription.make<Model, Message>()(_entry => ({
          hostStep: Port.subscription(ports.inbound.stepChanged, step =>
            ChangedStep({ step }),
          ),
        }))
        type UpdateReturn = readonly [
          Model,
          ReadonlyArray<Command.Command<Message>>,
        ]
        const Program = make<Model, Message, never, never, typeof ports>({
          id: 'ported-counter',
          version: 1,
          Model,
          Message,
          init: () => [Model.make({ count: 0, step: 1 }), []],
          update: (model, message) =>
            M.value(message).pipe(
              M.withReturnType<UpdateReturn>(),
              M.tagsExhaustive({
                ChangedStep: ({ step }) => [Model.make({ ...model, step }), []],
                RequestedIncrement: () => {
                  const nextCount = model.count + model.step
                  return [
                    Model.make({ ...model, count: nextCount }),
                    [ReportCount({ count: nextCount })],
                  ]
                },
                CompletedReportCount: () => [model, []],
              }),
            ),
          subscriptions,
          ports,
        })
        const runtime = yield* makeProgramRuntime({
          program: Program,
          resources: Layer.empty,
        })

        const changedStep = yield* Deferred.make<Model>()
        runtime.observeModel(model => {
          if (model.step === 5) {
            Deferred.doneUnsafe(changedStep, Effect.succeed(model))
          }
        })
        expect(Exit.isSuccess(runtime.ports.stepChanged.send('5'))).toBe(true)
        expect(yield* Deferred.await(changedStep)).toStrictEqual({
          count: 0,
          step: 5,
        })
        expect(runtime.journal.read().transitions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: ChangedStep({ step: 5 }),
              source: { _tag: 'Port', name: 'stepChanged' },
            }),
          ]),
        )

        const reportedCount = yield* Deferred.make<number>()
        runtime.ports.countChanged.subscribe(count => {
          Deferred.doneUnsafe(reportedCount, Effect.succeed(count))
        })
        expect(yield* runtime.run(RequestedIncrement())).toStrictEqual({
          count: 5,
          step: 5,
        })
        expect(yield* Deferred.await(reportedCount)).toBe(5)

        const consoleError = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {})
        expect(
          Exit.isFailure(runtime.ports.stepChanged.send('not-a-number')),
        ).toBe(true)
        consoleError.mockRestore()
        yield* runtime.shutdown
        expect(Exit.isSuccess(runtime.ports.stepChanged.send('7'))).toBe(true)
        expect(runtime.readModel()).toStrictEqual({ count: 5, step: 5 })
      }),
    ),
  )

  it.effect('streams terminal failures from fire-and-forget sends', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const RequestedCrash = m('RequestedCrash')
        const CompletedCrash = m('CompletedCrash')
        const Message = S.Union([RequestedCrash, CompletedCrash])
        type Message = typeof Message.Type
        const Model = S.Struct({ status: S.String })
        type Model = typeof Model.Type
        const Crash = Command.define(
          'Crash',
          CompletedCrash,
        )(Effect.die(new Error('command exploded')))
        type UpdateReturn = readonly [
          Model,
          ReadonlyArray<Command.Command<Message>>,
        ]
        const Program = make({
          id: 'failing-program',
          version: 1,
          Model,
          Message,
          init: () => [Model.make({ status: 'ready' }), []],
          update: (model, message) =>
            M.value(message).pipe(
              M.withReturnType<UpdateReturn>(),
              M.tagsExhaustive({
                RequestedCrash: () => [model, [Crash()]],
                CompletedCrash: () => [model, []],
              }),
            ),
        })
        const runtime = yield* makeProgramRuntime({
          program: Program,
          resources: Layer.empty,
          journal: { now: () => 40 },
        })
        const streamStarted = yield* Deferred.make<void>()
        const failureFiber = yield* Effect.forkChild(
          runtime.failures.pipe(
            Stream.onStart(Deferred.succeed(streamStarted, undefined)),
            Stream.runHead,
          ),
        )
        yield* Deferred.await(streamStarted)
        yield* Effect.yieldNow
        const observedFailure = yield* Deferred.make<void>()
        runtime.observeFailures(() => {
          Deferred.doneUnsafe(observedFailure, Effect.void)
        })

        runtime.send(RequestedCrash())
        yield* Deferred.await(observedFailure)

        const maybeFailure = yield* Fiber.join(failureFiber)
        expect(Option.isSome(maybeFailure)).toBe(true)
        if (Option.isNone(maybeFailure)) {
          throw new Error('Expected a runtime failure')
        }
        expect(maybeFailure.value).toStrictEqual(
          expect.objectContaining({
            programId: 'failing-program',
            source: { _tag: 'Command', name: 'Crash' },
            message: Option.some(RequestedCrash()),
            timestamp: 40,
          }),
        )
        expect(Cause.squash(maybeFailure.value.cause)).toStrictEqual(
          new Error('command exploded'),
        )
        expect(runtime.readFailures()).toStrictEqual([maybeFailure.value])
      }),
    ),
  )

  it.effect('resumes a settled tape and starts live Subscriptions once', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const tape = fromJournal(BasicProgram, {
          retainedFromSequence: 0,
          initialModel: { count: 0 },
          initialCommands: [],
          transitions: [],
          latestModel: { count: 0 },
        })
        const runtime = yield* makeProgramRuntime({
          program: BasicProgram,
          resources: Layer.empty,
          start: fromReplay(tape),
        })

        expect(runtime.readModel()).toStrictEqual({ count: 0 })
        expect(yield* runtime.run(Incremented())).toStrictEqual({ count: 1 })
        expect(runtime.journal.read().transitions).toHaveLength(1)
      }),
    ),
  )

  it.effect(
    'rejects a zero-transition replay while its initial Commands are unsettled',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const tape = {
            ...fromJournal(BasicProgram, {
              retainedFromSequence: 0,
              initialModel: BasicModel.make({ count: 0 }),
              initialCommands: [],
              transitions: [],
              latestModel: BasicModel.make({ count: 0 }),
            }),
            initialCommands: [{ name: 'LoadCounter' }],
          }
          const error = yield* Effect.flip(
            makeProgramRuntime({
              program: BasicProgram,
              resources: Layer.empty,
              start: fromReplay(tape),
            }),
          )

          expect(error._tag).toBe('ProgramRuntimeStartError')
          expect(error.message).toBe(
            'A live Program can resume only from a settled replay frame',
          )
        }),
      ),
  )

  it.effect(
    'revalidates Program identity and version for manually constructed replay starts',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const tape = fromJournal(BasicProgram, {
            retainedFromSequence: 0,
            initialModel: BasicModel.make({ count: 0 }),
            initialCommands: [],
            transitions: [],
            latestModel: BasicModel.make({ count: 0 }),
          })
          const identityError = yield* Effect.flip(
            makeProgramRuntime({
              program: BasicProgram,
              resources: Layer.empty,
              start: fromReplay({ ...tape, programId: 'another-counter' }),
            }),
          )
          const versionError = yield* Effect.flip(
            makeProgramRuntime({
              program: BasicProgram,
              resources: Layer.empty,
              start: fromReplay({ ...tape, programVersion: 2 }),
            }),
          )

          expect(identityError.message).toBe(
            'Replay tape another-counter@1 does not match basic-counter@1',
          )
          expect(versionError.message).toBe(
            'Replay tape basic-counter@2 does not match basic-counter@1',
          )
        }),
      ),
  )
})
