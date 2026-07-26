import { Effect, Layer } from 'effect'
import * as Fact from 'fact-core-example'
import { Program, Runtime, Scene } from 'foldkit'
import {
  CalculatorDestination,
  Workbench,
  defaultReplayDestination,
  makeReplayabilityTapeStore,
} from 'replayability-core-example'
import { describe, expect, it } from 'vitest'

import { BrowserCrypto } from '@effect/platform-browser'

import { view } from './view.js'

const factResources = Layer.succeed(Fact.FactClient, {
  fetch: Effect.succeed(
    Fact.Fact.make({ requestId: 'view-test-request', text: 'A test fact' }),
  ),
})

describe('Foldkit replayability view', () => {
  it('renders a typed deep-linked Calculator frame', async () => {
    const destination = await Effect.runPromise(
      defaultReplayDestination('Calculator'),
    )
    if (
      destination._tag !== 'Calculator' ||
      destination.route._tag !== 'Replay'
    ) {
      throw new Error('Expected the default Calculator replay destination')
    }

    const completedDestination = CalculatorDestination.make({
      route: Program.replay(
        destination.route.tape,
        destination.route.tape.transitions.length,
      ),
    })
    const { program, resources } = Workbench.makeReplayWorkbench(
      completedDestination,
      makeReplayabilityTapeStore(globalThis.fetch),
      BrowserCrypto.layer,
      factResources,
    )
    const model = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.makeProgramRuntime({
            program,
            resources,
          })
          yield* runtime.initialization
          const readyModel = runtime.readModel()
          yield* runtime.shutdown
          return readyModel
        }),
      ),
    )

    if (!Workbench.isReady(model)) {
      throw new Error(`Expected a ready Model, received ${model._tag}`)
    }

    Scene.scene(
      { update: program.update, view },
      Scene.with(model),
      Scene.expect(Scene.text('66×77')).toExist(),
    )

    expect(model._tag).toBe('Calculator')
    expect(model.currentFrame).toBe(model.finalFrame)
  })
})
