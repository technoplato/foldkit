import { Array, Effect, Layer, Option } from 'effect'
import * as Fact from 'fact-core-example'
import { Program, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { NodeCrypto } from '@effect/platform-node'

import {
  CounterDestination,
  defaultReplayDestination,
  parseReplayDestination,
} from './destination.js'
import { actionsForModel, transitionsForModel } from './presentation.js'
import { makeReplayabilityTapeStore } from './remoteReplayTapeStore.js'
import {
  ChangedReplayFrame,
  ClickedSaveReplay,
  PressedReplayAction,
  SelectedReplayProgram,
  displayForModel,
  makeReplayWorkbench,
} from './workbench.js'

const factResources = Layer.succeed(Fact.FactClient, {
  fetch: Effect.succeed(
    Fact.Fact.make({
      requestId: 'workbench-test-request',
      text: 'A test fact',
    }),
  ),
})

describe('shared replay workbench Program', () => {
  it('derives Multiple Counters actions and before/after Message details from the inspected frame', async () => {
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const destination = yield* defaultReplayDestination('Counters')
          const { program, resources } = makeReplayWorkbench(
            destination,
            makeReplayabilityTapeStore(globalThis.fetch),
            NodeCrypto.layer,
            factResources,
          )
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          yield* runtime.initialization
          const initialModel = runtime.readModel()
          if (initialModel._tag !== 'Counters') {
            return yield* Effect.die('Expected Multiple Counters workbench')
          }
          expect(
            Array.map(actionsForModel(initialModel), action => action.id),
          ).toContain('increment:counter-1')

          const nextModel = yield* runtime.run(
            PressedReplayAction({ actionId: 'increment:counter-1' }),
          )
          yield* runtime.shutdown
          return nextModel
        }),
      ),
    )

    if (model._tag !== 'Counters') {
      throw new Error(`Expected Counters, received ${model._tag}`)
    }
    const presentations = transitionsForModel(model)
    expect(presentations).toHaveLength(1)
    const presentation = Option.getOrThrow(Array.head(presentations))
    expect(presentation).toEqual(
      expect.objectContaining({
        messageName: 'GotCounterMessage',
        sequence: 1,
        sourceName: 'Host',
      }),
    )
    expect(presentation.messagePayload).toContain('"counterId":"counter-1"')
    expect(presentation.messagePayload).toContain('ClickedIncrement')
    expect(presentation.previousModel).toContain('"count":0')
    expect(presentation.nextModel).toContain('"count":1')
  })

  it('models URI restoration as loading until its initialization Command completes', async () => {
    const destination = await Effect.runPromise(
      defaultReplayDestination('Counter'),
    )
    const { program } = makeReplayWorkbench(
      destination,
      makeReplayabilityTapeStore(globalThis.fetch),
      NodeCrypto.layer,
      factResources,
    )
    const [model, commands] = program.init()

    expect(model).toStrictEqual({ _tag: 'Loading', programId: 'Counter' })
    expect(Array.map(commands, command => command.name)).toStrictEqual([
      'InitializeReplayWorkbench',
    ])
  })

  it('branches from an inspected frame and extends the typed tape live', async () => {
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const destination = yield* defaultReplayDestination('Counter')
          const { program, resources } = makeReplayWorkbench(
            destination,
            makeReplayabilityTapeStore(globalThis.fetch),
            NodeCrypto.layer,
            factResources,
          )
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          expect(runtime.readModel()._tag).toBe('Loading')
          yield* runtime.initialization

          const nextModel = yield* runtime.run(
            PressedReplayAction({ actionId: 'increment' }),
          )
          yield* runtime.shutdown
          return nextModel
        }),
      ),
    )

    expect(model._tag).toBe('Counter')
    if (model._tag !== 'Counter') {
      throw new Error(`Expected Counter, received ${model._tag}`)
    }
    expect(model.controllerMode).toBe('Live')
    expect(displayForModel(model)).toBe('1')
    expect(model.currentFrame).toBe(1)
    expect(model.finalFrame).toBe(1)
    expect(
      Array.map(model.tape.transitions, transition => transition.message._tag),
    ).toStrictEqual(['ClickedIncrement'])
    expect(model.replayUri.startsWith('/counter/replay?tape=')).toBe(true)
    expect(model.replayUri.endsWith('&frame=1')).toBe(true)
  })

  it('records a real Fact result without repeating its request during replay', async () => {
    let requestCount = 0
    const recordingFactResources = Layer.succeed(Fact.FactClient, {
      fetch: Effect.sync(() => {
        requestCount += 1
        return Fact.Fact.make({
          requestId: `workbench-request-${requestCount.toString()}`,
          text: `Fact ${requestCount.toString()}`,
        })
      }),
    })
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const destination = yield* defaultReplayDestination('Fact')
          const { program, resources } = makeReplayWorkbench(
            destination,
            makeReplayabilityTapeStore(globalThis.fetch),
            NodeCrypto.layer,
            recordingFactResources,
          )
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          yield* runtime.initialization
          yield* runtime.run(PressedReplayAction({ actionId: 'load-fact' }))
          expect(requestCount).toBe(1)
          yield* runtime.run(ChangedReplayFrame({ frame: 0 }))
          expect(requestCount).toBe(1)
          const nextModel = yield* runtime.run(
            PressedReplayAction({ actionId: 'load-fact' }),
          )
          yield* runtime.shutdown
          return nextModel
        }),
      ),
    )

    expect(requestCount).toBe(2)
    expect(model._tag).toBe('Fact')
    if (model._tag !== 'Fact') {
      throw new Error(`Expected Fact, received ${model._tag}`)
    }
    expect(model.model).toStrictEqual({
      _tag: 'Loaded',
      fact: {
        requestId: 'workbench-request-2',
        text: 'Fact 2',
      },
    })
    expect(
      Array.map(model.tape.transitions, transition => transition.message._tag),
    ).toStrictEqual(['ClickedLoadFact', 'SucceededFetchFact'])
  })

  it('automatically plays a replay link carrying play=1', async () => {
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const destination = yield* defaultReplayDestination('Counter')
          if (
            destination._tag !== 'Counter' ||
            destination.route._tag !== 'Replay'
          ) {
            return yield* Effect.die('Expected Counter destination')
          }
          const autoplayDestination = CounterDestination.make({
            route: Program.replay(destination.route.tape, 0, true),
          })
          const { program, resources } = makeReplayWorkbench(
            autoplayDestination,
            makeReplayabilityTapeStore(globalThis.fetch),
            NodeCrypto.layer,
            factResources,
          )
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          yield* runtime.initialization
          const nextModel = runtime.readModel()
          yield* runtime.shutdown
          return nextModel
        }),
      ),
    )

    if (model._tag !== 'Counter') {
      throw new Error(`Expected Counter, received ${model._tag}`)
    }
    expect(model.currentFrame).toBe(model.finalFrame)
    expect(model.playback).toBe('Paused')
    expect(model.model.count).toBe(1)
  })

  it('changes Programs through a Command without client-owned replay logic', async () => {
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const destination = yield* defaultReplayDestination('Counter')
          const { program, resources } = makeReplayWorkbench(
            destination,
            makeReplayabilityTapeStore(globalThis.fetch),
            NodeCrypto.layer,
            factResources,
          )
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          expect(runtime.readModel()._tag).toBe('Loading')
          yield* runtime.initialization

          const nextModel = yield* runtime.run(
            SelectedReplayProgram({ programId: 'Calculator' }),
          )
          yield* runtime.shutdown
          return nextModel
        }),
      ),
    )

    expect(model._tag).toBe('Calculator')
    if (model._tag !== 'Calculator') {
      throw new Error(`Expected Calculator, received ${model._tag}`)
    }
    expect(model.replayUri.startsWith('/calculator/replay?tape=')).toBe(true)
    expect(model.currentFrame).toBe(0)
  })

  it('saves a short UUID route and restores the same tape through it', async () => {
    let encodedTape = ''
    const replayTapeStore: Runtime.ReplayTapeStoreService = {
      save: (_, tape) =>
        Effect.sync(() => {
          encodedTape = tape
        }),
      load: () => Effect.succeed(encodedTape),
    }
    const savedModel = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const destination = yield* defaultReplayDestination('Counter')
          const { program, resources } = makeReplayWorkbench(
            destination,
            replayTapeStore,
            NodeCrypto.layer,
            factResources,
          )
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          yield* runtime.initialization
          yield* runtime.run(PressedReplayAction({ actionId: 'increment' }))
          const model = yield* runtime.run(ClickedSaveReplay())
          yield* runtime.shutdown
          return model
        }),
      ),
    )

    if (savedModel._tag !== 'Counter') {
      throw new Error(`Expected Counter, received ${savedModel._tag}`)
    }
    expect(savedModel.replayUri).toMatch(
      /^\/counter\/replay\/uuiduri:[0-9a-f-]+\?frame=1$/u,
    )
    const autoplayUri = savedModel.replayUri.replace(
      '?frame=1',
      '?frame=0&play=1',
    )
    expect(savedModel.replaySaveStatus).toStrictEqual({
      _tag: 'SavedReplay',
      autoplayUri,
      uri: savedModel.replayUri,
    })

    const restoredModel = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const destination = yield* parseReplayDestination(
            savedModel.replayUri,
          )
          const { program, resources } = makeReplayWorkbench(
            destination,
            replayTapeStore,
            NodeCrypto.layer,
            factResources,
          )
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          yield* runtime.initialization
          const model = runtime.readModel()
          yield* runtime.shutdown
          return model
        }),
      ),
    )

    if (restoredModel._tag !== 'Counter') {
      throw new Error(`Expected Counter, received ${restoredModel._tag}`)
    }
    expect(restoredModel.model.count).toBe(1)
    expect(restoredModel.replayUri).toBe(savedModel.replayUri)
  })

  it('saves the Program selected after the workbench starts', async () => {
    let encodedTape = ''
    const replayTapeStore: Runtime.ReplayTapeStoreService = {
      save: (_, tape) =>
        Effect.sync(() => {
          encodedTape = tape
        }),
      load: () => Effect.succeed(encodedTape),
    }
    const savedModel = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const destination = yield* defaultReplayDestination('Counter')
          const { program, resources } = makeReplayWorkbench(
            destination,
            replayTapeStore,
            NodeCrypto.layer,
            factResources,
          )
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          yield* runtime.initialization
          yield* runtime.run(SelectedReplayProgram({ programId: 'Calculator' }))
          yield* runtime.run(PressedReplayAction({ actionId: 'digit-six' }))
          const model = yield* runtime.run(ClickedSaveReplay())
          yield* runtime.shutdown
          return model
        }),
      ),
    )

    if (savedModel._tag !== 'Calculator') {
      throw new Error(`Expected Calculator, received ${savedModel._tag}`)
    }
    expect(savedModel.replayUri).toMatch(
      /^\/calculator\/replay\/uuiduri:[0-9a-f-]+\?frame=1$/u,
    )

    const restoredModel = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const destination = yield* parseReplayDestination(
            savedModel.replayUri,
          )
          const { program, resources } = makeReplayWorkbench(
            destination,
            replayTapeStore,
            NodeCrypto.layer,
            factResources,
          )
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          yield* runtime.initialization
          const model = runtime.readModel()
          yield* runtime.shutdown
          return model
        }),
      ),
    )

    if (restoredModel._tag !== 'Calculator') {
      throw new Error(`Expected Calculator, received ${restoredModel._tag}`)
    }
    expect(displayForModel(restoredModel)).toBe('6')
  })
})
