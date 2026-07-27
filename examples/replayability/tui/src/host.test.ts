import { Array, Effect, Layer, Option } from 'effect'
import * as Fact from 'fact-core-example'
import { Program, Runtime } from 'foldkit'
import {
  CalculatorDestination,
  type ReplayDestination,
  Workbench,
  defaultReplayDestination,
  makeReplayabilityTapeStore,
} from 'replayability-core-example'
import { describe, expect, it } from 'vitest'

import { NodeCrypto } from '@effect/platform-node'

import {
  actionBindingsForModel,
  messageForReplayInput,
  renderReplayScreen,
} from './host.js'

const factResources = Layer.succeed(Fact.FactClient, {
  fetch: Effect.succeed(
    Fact.Fact.make({ requestId: 'tui-test-request', text: 'A test fact' }),
  ),
})

const readyModelForDestination = async (destination: ReplayDestination) => {
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
  return model
}

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
    const model = await readyModelForDestination(completedDestination)

    expect(renderReplayScreen(model)).toContain('66×77')
    expect(renderReplayScreen(model)).toContain('[8] 8')
    expect(Option.getOrThrow(messageForReplayInput(model, '8'))).toEqual({
      _tag: 'PressedReplayAction',
      actionId: 'digit-eight',
    })
    expect(Option.getOrThrow(messageForReplayInput(model, 'c'))).toEqual({
      _tag: 'SelectedReplayProgram',
      programId: 'Fact',
    })
    expect(Option.getOrThrow(messageForReplayInput(model, 'left'))).toEqual({
      _tag: 'ClickedStepBackward',
    })
    expect(Option.getOrThrow(messageForReplayInput(model, 'p'))).toEqual({
      _tag: 'ClickedPlayback',
    })
    expect(Option.getOrThrow(messageForReplayInput(model, 'w'))).toEqual({
      _tag: 'ClickedSaveReplay',
    })
  })

  it('shows and maps the derived Fact action binding', async () => {
    const destination = await Effect.runPromise(
      defaultReplayDestination('Fact'),
    )
    const model = await readyModelForDestination(destination)

    expect(renderReplayScreen(model)).toContain('Ready for a fact')
    expect(renderReplayScreen(model)).toContain('[1] load fact')
    expect(Option.getOrThrow(messageForReplayInput(model, '1'))).toEqual({
      _tag: 'PressedReplayAction',
      actionId: 'load-fact',
    })
  })

  it('derives dynamic Multiple Counters bindings without host dispatch tables', async () => {
    const destination = await Effect.runPromise(
      defaultReplayDestination('Counters'),
    )
    const model = await readyModelForDestination(destination)

    const bindings = actionBindingsForModel(model)
    expect(Array.map(bindings, binding => binding.actionId)).toStrictEqual([
      'add',
      'open:counter-1',
      'decrement:counter-1',
      'increment:counter-1',
      'open:counter-2',
      'decrement:counter-2',
      'increment:counter-2',
    ])
    const addBinding = Option.getOrThrow(
      Array.findFirst(bindings, binding => binding.actionId === 'add'),
    )
    expect(renderReplayScreen(model)).toContain(
      `[${addBinding.shortcut}] Add counter`,
    )
    expect(renderReplayScreen(model)).not.toContain(model.stateUri)
    expect(renderReplayScreen(model)).not.toContain(model.replayUri)
    expect(
      renderReplayScreen(
        model,
        Option.some('No action is bound to "j". Use a displayed shortcut.'),
      ),
    ).toContain('No action is bound to "j". Use a displayed shortcut.')
    expect(
      Option.getOrThrow(messageForReplayInput(model, addBinding.shortcut)),
    ).toEqual({
      _tag: 'PressedReplayAction',
      actionId: 'add',
    })
  })
})
