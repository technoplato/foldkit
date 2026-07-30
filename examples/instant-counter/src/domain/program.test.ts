import {
  type Message as CounterMessage,
  CounterProgram,
} from 'counter-core-example'
import { Array, Effect, Option } from 'effect'
import { Program, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  AssignedEffect,
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  FailedEffect,
  type Message,
  Message as MessageSchema,
  RejectedEffect,
  RequestedEffect,
  SucceededEffect,
  WaitedForEffectProcessor,
} from './message.js'
import { Model as ModelSchema } from './model.js'
import { CanonicalCounterProgram, InstantCounterProgram } from './program.js'

const initialModel = () => {
  const [model] = InstantCounterProgram.init()
  return model
}

const replay = (messages: ReadonlyArray<Message>) =>
  Array.reduce(messages, initialModel(), (model, message) => {
    const [nextModel] = InstantCounterProgram.update(model, message)
    return nextModel
  })

const makeReplayTape = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
>(
  program: Program.Program<Model, Message, Resources>,
  initialModel: Model,
  messages: ReadonlyArray<Message>,
): Runtime.ReplayTape<Model, Message> => ({
  formatVersion: 1,
  initialCommands: [],
  initialModel,
  programId: program.id,
  programVersion: program.version,
  runtimeEvents: [],
  transitions: Array.map(messages, (message, index) => ({
    commands: [],
    isOperationSettled: true,
    message,
    sequence: index + 1,
    source: Runtime.fromHost('counter-parity'),
    timestamp: index,
  })),
})

describe('InstantCounterProgram', () => {
  it('embeds the exact canonical Counter Program dependency', () => {
    const [counter, counterCommands] = CounterProgram.init()
    const [model, commands] = InstantCounterProgram.init()
    const [restoredCounter, restoredCounterCommands] = CounterProgram.restore?.(
      counter,
    ) ?? [counter, []]
    const [restoredModel, restoredCommands] = InstantCounterProgram.restore?.(
      model,
    ) ?? [model, []]

    expect(CanonicalCounterProgram).toBe(CounterProgram)
    expect(ModelSchema.fields.counter).toBe(CounterProgram.Model)
    expect(Array.head(MessageSchema.members)).toStrictEqual(
      Option.some(CounterProgram.Message),
    )
    expect(model).toStrictEqual({ counter, effects: [] })
    expect(commands).toStrictEqual(counterCommands)
    expect(restoredModel.counter).toStrictEqual(restoredCounter)
    expect(restoredModel.effects).toStrictEqual([])
    expect(restoredCommands).toStrictEqual(restoredCounterCommands)
  })

  it('keeps canonical Counter replay frames identical across independent Processors', async () => {
    const messages: ReadonlyArray<CounterMessage> = [
      ClickedIncrement(),
      ClickedIncrement(),
      ClickedDecrement(),
      ClickedReset(),
      ClickedIncrement(),
    ]

    const phoneModel = replay(messages)
    const browserModel = replay(messages)
    const [counterInitialModel] = CounterProgram.init()
    const [coordinatorInitialModel] = InstantCounterProgram.init()
    const counterTape = makeReplayTape(
      CounterProgram,
      counterInitialModel,
      messages,
    )
    const coordinatorTape = makeReplayTape(
      InstantCounterProgram,
      coordinatorInitialModel,
      messages,
    )
    const frames = [0, 1, 2, 3, 4, 5]
    const counterFrames = await Effect.runPromise(
      Effect.forEach(frames, frame =>
        Runtime.replayToFrame(CounterProgram, counterTape, frame),
      ),
    )
    const coordinatorFrames = await Effect.runPromise(
      Effect.forEach(frames, frame =>
        Runtime.replayToFrame(InstantCounterProgram, coordinatorTape, frame),
      ),
    )

    expect(phoneModel).toStrictEqual(browserModel)
    expect(phoneModel.counter.count).toBe(1)
    expect(Array.map(coordinatorFrames, model => model.counter)).toStrictEqual(
      counterFrames,
    )
  })

  it('leaves capability lifecycle state unchanged when routing a canonical Counter Message', () => {
    const withEffect = replay([
      RequestedEffect({
        durationMs: Option.none(),
        kind: 'CameraCapture',
        requestId: 'camera-preserved',
      }),
    ])
    const [nextModel] = InstantCounterProgram.update(
      withEffect,
      ClickedIncrement(),
    )

    expect(nextModel.counter.count).toBe(withEffect.counter.count + 1)
    expect(nextModel.effects).toStrictEqual(withEffect.effects)
  })

  it('describes a capability effect without executing it during update', () => {
    const [initialModel] = InstantCounterProgram.init()
    const request = RequestedEffect({
      durationMs: Option.some(250),
      kind: 'Vibration',
      requestId: 'effect-1',
    })

    const [requestedModel, commands] = InstantCounterProgram.update(
      initialModel,
      request,
    )
    const [duplicateModel, duplicateCommands] = InstantCounterProgram.update(
      requestedModel,
      request,
    )

    expect(requestedModel.effects).toStrictEqual([
      {
        _tag: 'RequestedEffectState',
        kind: 'Vibration',
        requestId: 'effect-1',
      },
    ])
    expect(commands).toHaveLength(1)
    const maybeCommand = Array.head(commands)
    expect(Option.isSome(maybeCommand)).toBe(true)
    if (Option.isSome(maybeCommand)) {
      expect(maybeCommand.value.name).toBe('PerformRequestedEffect')
      expect(maybeCommand.value.effectManifest).toMatchObject({
        formatVersion: 2,
        id: 'Foldkit.Example.InstantCounter.Vibration',
        version: 1,
      })
    }
    expect(duplicateModel).toStrictEqual(requestedModel)
    expect(duplicateCommands).toStrictEqual([])
  })

  it('derives the complete delegated effect lifecycle from accepted facts', () => {
    const request = RequestedEffect({
      durationMs: Option.some(1_000),
      kind: 'DeviceTimer',
      requestId: 'timer-1',
    })
    const messages: ReadonlyArray<Message> = [
      request,
      WaitedForEffectProcessor({
        kind: request.kind,
        requestId: request.requestId,
      }),
      AssignedEffect({
        kind: request.kind,
        processorId: 'processor-phone',
        requestId: request.requestId,
      }),
      SucceededEffect({
        kind: request.kind,
        processorId: 'processor-phone',
        requestId: request.requestId,
        summary: 'Timer completed after 1000 ms.',
      }),
    ]

    expect(replay(messages).effects).toStrictEqual([
      {
        _tag: 'SucceededEffectState',
        kind: 'DeviceTimer',
        processorId: 'processor-phone',
        requestId: 'timer-1',
        summary: 'Timer completed after 1000 ms.',
      },
    ])
  })

  it('does not regress terminal effect states when placement facts arrive late', () => {
    const succeededRequest = RequestedEffect({
      durationMs: Option.some(1_000),
      kind: 'DeviceTimer',
      requestId: 'timer-succeeded',
    })
    const succeededModel = replay([
      succeededRequest,
      SucceededEffect({
        kind: succeededRequest.kind,
        processorId: 'processor-phone',
        requestId: succeededRequest.requestId,
        summary: 'Timer completed after 1000 ms.',
      }),
      AssignedEffect({
        kind: succeededRequest.kind,
        processorId: 'processor-phone',
        requestId: succeededRequest.requestId,
      }),
      WaitedForEffectProcessor({
        kind: succeededRequest.kind,
        requestId: succeededRequest.requestId,
      }),
      FailedEffect({
        kind: succeededRequest.kind,
        processorId: 'processor-late',
        reason: 'Late failure.',
        requestId: succeededRequest.requestId,
      }),
      RejectedEffect({
        kind: succeededRequest.kind,
        reason: 'Late rejection.',
        requestId: succeededRequest.requestId,
      }),
    ])
    const failedRequest = RequestedEffect({
      durationMs: Option.none(),
      kind: 'CameraCapture',
      requestId: 'camera-failed',
    })
    const failedModel = replay([
      failedRequest,
      FailedEffect({
        kind: failedRequest.kind,
        processorId: 'processor-phone',
        reason: 'Camera permission was denied.',
        requestId: failedRequest.requestId,
      }),
      WaitedForEffectProcessor({
        kind: failedRequest.kind,
        requestId: failedRequest.requestId,
      }),
      AssignedEffect({
        kind: failedRequest.kind,
        processorId: 'processor-phone',
        requestId: failedRequest.requestId,
      }),
      SucceededEffect({
        kind: failedRequest.kind,
        processorId: 'processor-late',
        requestId: failedRequest.requestId,
        summary: 'Late success.',
      }),
      RejectedEffect({
        kind: failedRequest.kind,
        reason: 'Late rejection.',
        requestId: failedRequest.requestId,
      }),
    ])

    expect(succeededModel.effects).toStrictEqual([
      {
        _tag: 'SucceededEffectState',
        kind: 'DeviceTimer',
        processorId: 'processor-phone',
        requestId: 'timer-succeeded',
        summary: 'Timer completed after 1000 ms.',
      },
    ])
    expect(failedModel.effects).toStrictEqual([
      {
        _tag: 'FailedEffectState',
        kind: 'CameraCapture',
        maybeProcessorId: Option.some('processor-phone'),
        reason: 'Camera permission was denied.',
        requestId: 'camera-failed',
      },
    ])
  })

  it('retains a factual failure without a host error object', () => {
    const request = RequestedEffect({
      durationMs: Option.none(),
      kind: 'CameraCapture',
      requestId: 'camera-1',
    })
    const model = replay([
      request,
      AssignedEffect({
        kind: request.kind,
        processorId: 'processor-phone',
        requestId: request.requestId,
      }),
      FailedEffect({
        kind: request.kind,
        processorId: 'processor-phone',
        reason: 'Camera permission was denied.',
        requestId: request.requestId,
      }),
    ])

    expect(model.effects).toStrictEqual([
      {
        _tag: 'FailedEffectState',
        kind: 'CameraCapture',
        maybeProcessorId: Option.some('processor-phone'),
        reason: 'Camera permission was denied.',
        requestId: 'camera-1',
      },
    ])
  })
})
