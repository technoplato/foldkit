import { Effect, Layer, Option } from 'effect'
import * as Fact from 'fact-core-example'
import { Program, Runtime } from 'foldkit'
import {
  CalculatorDestination,
  Workbench,
  defaultReplayDestination,
  makeReplayabilityTapeStore,
} from 'replayability-core-example'
import { describe, expect, it } from 'vitest'

import { NodeCrypto } from '@effect/platform-node'

import { messageForReplayInput, renderReplayScreen } from './host.js'

const factResources = Layer.succeed(Fact.FactClient, {
  fetch: Effect.succeed(
    Fact.Fact.make({ requestId: 'tui-test-request', text: 'A test fact' }),
  ),
})

describe('replay TUI host', () => {
  it('renders the same typed Calculator replay and maps native keys', async () => {
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
      NodeCrypto.layer,
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

    expect(renderReplayScreen(model)).toContain('66×77')
    expect(Option.getOrThrow(messageForReplayInput(model, '8'))).toEqual({
      _tag: 'PressedReplayAction',
      actionId: 'digit-eight',
    })
    expect(Option.getOrThrow(messageForReplayInput(model, 'c'))).toEqual({
      _tag: 'SelectedReplayProgram',
      programId: 'Fact',
    })
  })

  it('maps the Fact key through the shared Workbench action', async () => {
    const destination = await Effect.runPromise(
      defaultReplayDestination('Fact'),
    )
    const { program, resources } = Workbench.makeReplayWorkbench(
      destination,
      makeReplayabilityTapeStore(globalThis.fetch),
      NodeCrypto.layer,
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

    expect(renderReplayScreen(model)).toContain('Ready for a fact')
    expect(Option.getOrThrow(messageForReplayInput(model, 'f'))).toEqual({
      _tag: 'PressedReplayAction',
      actionId: 'load-fact',
    })
  })
})
