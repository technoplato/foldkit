import { Match as M, Option, Schema as S } from 'effect'
import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'

import { m } from '../message/index.js'
import {
  SignalInstrumentationOptions,
  SignalInstrumentationState,
  instrumentSignals,
  makeSignalInstrumentationState,
} from './signalInstrumentation.js'
import { type Return, type ReturnWithOutMessage } from './update.js'

const UpdatedAudioLevel = m('UpdatedAudioLevel', { level: S.Number })
const TimerTicked = m('TimerTicked')
const ClickedPlusButton = m('ClickedPlusButton')
const ConnectionStatusChanged = m('ConnectionStatusChanged', {
  status: S.String,
})

const Message = S.Union([
  UpdatedAudioLevel,
  TimerTicked,
  ClickedPlusButton,
  ConnectionStatusChanged,
])
type Message = typeof Message.Type

const Model = S.Struct({
  audioLevel: S.Number,
  count: S.Number,
  elapsedTicks: S.Number,
  retainedTranscript: S.Array(S.String),
})
type Model = typeof Model.Type

const CapturedModel = S.Struct({
  audioLevel: S.Number,
  count: S.Number,
  elapsedTicks: S.Number,
})
type CapturedModel = typeof CapturedModel.Type

type UpdateReturn = Return<Model, Message>
const withUpdateReturn = M.withReturnType<UpdateReturn>()

const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      UpdatedAudioLevel: ({ level }) => [{ ...model, audioLevel: level }, []],
      TimerTicked: () => [
        { ...model, elapsedTicks: model.elapsedTicks + 1 },
        [],
      ],
      ClickedPlusButton: () => [{ ...model, count: model.count + 1 }, []],
      ConnectionStatusChanged: () => [model, []],
    }),
  )

const options = (
  continuousPatterns: ReadonlyArray<string> = ['UpdatedAudioLevel'],
  periodicPatterns: ReadonlyArray<string> = ['TimerTicked'],
  discretePatterns: ReadonlyArray<string> = ['Clicked'],
) =>
  SignalInstrumentationOptions.make({
    continuousPatterns,
    discretePatterns,
    highFrequencyThresholdHz: 2,
    maximumDeltaCharacters: 128,
    maximumMessageTagCharacters: 80,
    maximumObservedMessages: 32,
    maximumSamplesPerMessage: 64,
    maximumTransitions: 8,
    observationWindowMilliseconds: 1_000,
    periodicJitterTolerance: 0.15,
    periodicPatterns,
  })

const initialModel = () =>
  Model.make({
    audioLevel: 0,
    count: 0,
    elapsedTicks: 0,
    retainedTranscript: globalThis.Array.from(
      { length: 10_000 },
      (_, index) => `retained transcript line ${index}`,
    ),
  })

describe('instrumentSignals', () => {
  it('processes 2,001 Scribe Messages with one Model capture and difference', () => {
    const probe = { captureCount: 0, differenceCount: 0 }
    const instrumentedUpdate = instrumentSignals(update, {
      captureModel: model => {
        probe.captureCount += 1
        return CapturedModel.make({
          audioLevel: model.audioLevel,
          count: model.count,
          elapsedTicks: model.elapsedTicks,
        })
      },
      difference: (previousModel, nextModel) => {
        probe.differenceCount += 1
        if (previousModel.audioLevel !== nextModel.audioLevel) {
          return Option.some(
            `audioLevel: ${previousModel.audioLevel} -> ${nextModel.audioLevel}`,
          )
        }
        if (previousModel.elapsedTicks !== nextModel.elapsedTicks) {
          return Option.some(
            `elapsedTicks: ${previousModel.elapsedTicks} -> ${nextModel.elapsedTicks}`,
          )
        }
        if (previousModel.count === nextModel.count) {
          return Option.none()
        }
        return Option.some(
          `count: ${previousModel.count} -> ${nextModel.count}`,
        )
      },
      messageTag: message => message._tag,
      options: options(),
    })

    const initial = initialModel()
    const retainedTranscript = initial.retainedTranscript
    const seed = {
      instrumentation: makeSignalInstrumentationState(),
      model: initial,
    }
    const afterSignals = globalThis.Array.from(
      { length: 1_000 },
      (_, index) => index,
    ).reduce((current, index) => {
      const [afterAudioInstrumentation, [afterAudioModel]] = instrumentedUpdate(
        current.instrumentation,
        current.model,
        UpdatedAudioLevel({ level: index / 1_000 }),
        index * 100,
      )
      const [afterTimerInstrumentation, [afterTimerModel]] = instrumentedUpdate(
        afterAudioInstrumentation,
        afterAudioModel,
        TimerTicked(),
        index * 100 + 50,
      )
      return {
        instrumentation: afterTimerInstrumentation,
        model: afterTimerModel,
      }
    }, seed)

    const [instrumentation, [model], maybeTransition] = instrumentedUpdate(
      afterSignals.instrumentation,
      afterSignals.model,
      ClickedPlusButton(),
      100_125,
    )

    expect(model.audioLevel).toBe(0.999)
    expect(model.elapsedTicks).toBe(1_000)
    expect(model.count).toBe(1)
    expect(model.retainedTranscript).toBe(retainedTranscript)
    expect(probe).toEqual({ captureCount: 1, differenceCount: 1 })
    expect(instrumentation.metrics).toMatchObject({
      classificationWorkUnits: 6_003,
      discreteTransitionsEmitted: 1,
      modelCaptureCount: 1,
      modelDifferenceCount: 1,
      retainedDeltaCharacters: 13,
      retainedTransitionCount: 1,
      suppressedContinuousCount: 1_000,
      suppressedPeriodicCount: 1_000,
    })
    expect(Option.isSome(maybeTransition)).toBe(true)
    expect(instrumentation.transitions).toEqual([
      {
        kind: 'Discrete',
        messageTag: 'ClickedPlusButton',
        modelDelta: Option.some('count: 0 -> 1'),
        timestampMilliseconds: 100_125,
      },
    ])
  })

  it('classifies the full Message tag before truncating retained labels', () => {
    const probe = { captureCount: 0, differenceCount: 0 }
    const instrumentedUpdate = instrumentSignals(update, {
      captureModel: model => {
        probe.captureCount += 1
        return CapturedModel.make({
          audioLevel: model.audioLevel,
          count: model.count,
          elapsedTicks: model.elapsedTicks,
        })
      },
      difference: () => {
        probe.differenceCount += 1
        return Option.none()
      },
      messageTag: message => message._tag,
      options: SignalInstrumentationOptions.make({
        ...options([], ['TimerTicked'], []),
        maximumMessageTagCharacters: 4,
      }),
    })

    const [instrumentation, , maybeTransition] = instrumentedUpdate(
      makeSignalInstrumentationState(),
      initialModel(),
      TimerTicked(),
      0,
    )

    expect(instrumentation.lastClassification).toBe('Periodic')
    expect(instrumentation.transitions).toEqual([])
    expect(probe).toEqual({ captureCount: 0, differenceCount: 0 })
    expect(maybeTransition).toEqual(Option.none())
  })

  it('ignores empty patterns and applies finite hard ceilings to retained data', () => {
    const instrumentedUpdate = instrumentSignals(update, {
      captureModel: model =>
        CapturedModel.make({
          audioLevel: model.audioLevel,
          count: model.count,
          elapsedTicks: model.elapsedTicks,
        }),
      difference: () => Option.some('x'.repeat(5_000)),
      messageTag: message => `${message._tag}${'y'.repeat(300)}`,
      options: SignalInstrumentationOptions.make({
        ...options([''], [], ['Clicked']),
        maximumDeltaCharacters: Number.POSITIVE_INFINITY,
        maximumMessageTagCharacters: Number.POSITIVE_INFINITY,
        maximumObservedMessages: Number.POSITIVE_INFINITY,
        maximumSamplesPerMessage: Number.POSITIVE_INFINITY,
        maximumTransitions: Number.POSITIVE_INFINITY,
      }),
    })
    const final = globalThis.Array.from(
      { length: 65 },
      (_, index) => index,
    ).reduce(
      current => {
        const [instrumentation, [model]] = instrumentedUpdate(
          current.instrumentation,
          current.model,
          ClickedPlusButton(),
          current.timestampMilliseconds,
        )
        return {
          instrumentation,
          model,
          timestampMilliseconds: current.timestampMilliseconds + 1,
        }
      },
      {
        instrumentation: makeSignalInstrumentationState(),
        model: initialModel(),
        timestampMilliseconds: 0,
      },
    )

    expect(final.model.count).toBe(65)
    expect(final.instrumentation.transitions).toHaveLength(64)
    expect(
      final.instrumentation.transitions.every(
        transition => transition.messageTag.length === 256,
      ),
    ).toBe(true)
    expect(
      final.instrumentation.transitions.every(transition =>
        Option.match(transition.modelDelta, {
          onNone: () => false,
          onSome: modelDelta => modelDelta.length === 4_000,
        }),
      ),
    ).toBe(true)
    expect(final.instrumentation.metrics).toMatchObject({
      retainedDeltaCharacters: 256_000,
      retainedTransitionCount: 64,
    })

    const reducedInstrumentedUpdate = instrumentSignals(update, {
      captureModel: () =>
        CapturedModel.make({
          audioLevel: 0,
          count: 0,
          elapsedTicks: 0,
        }),
      difference: () => Option.none(),
      messageTag: message => message._tag,
      options: SignalInstrumentationOptions.make({
        ...options([], ['TimerTicked'], []),
        maximumDeltaCharacters: 2,
        maximumMessageTagCharacters: 4,
        maximumTransitions: 2,
      }),
    })
    const [reboundedInstrumentation] = reducedInstrumentedUpdate(
      final.instrumentation,
      final.model,
      TimerTicked(),
      66,
    )

    expect(reboundedInstrumentation.lastClassification).toBe('Periodic')
    expect(reboundedInstrumentation.transitions).toHaveLength(2)
    expect(
      reboundedInstrumentation.transitions.every(
        transition =>
          transition.messageTag.length === 4 &&
          Option.match(transition.modelDelta, {
            onNone: () => false,
            onSome: modelDelta => modelDelta.length === 2,
          }),
      ),
    ).toBe(true)
    expect(reboundedInstrumentation.metrics).toMatchObject({
      retainedDeltaCharacters: 4,
      retainedTransitionCount: 2,
      suppressedPeriodicCount: 1,
    })
  })

  it('bounds unknown cadence histories by Message count and sample count', () => {
    const instrumentedUpdate = instrumentSignals(update, {
      captureModel: model =>
        CapturedModel.make({
          audioLevel: model.audioLevel,
          count: model.count,
          elapsedTicks: model.elapsedTicks,
        }),
      difference: () => Option.none(),
      messageTag: message => message._tag,
      options: SignalInstrumentationOptions.make({
        ...options([], [], []),
        maximumObservedMessages: 2,
        maximumSamplesPerMessage: 6,
      }),
    })
    const afterAudio = [0, 100, 200, 300, 400, 500, 600, 700].reduce(
      current => {
        const [instrumentation, [model]] = instrumentedUpdate(
          current.instrumentation,
          current.model,
          UpdatedAudioLevel({ level: 0.5 }),
          current.timestampMilliseconds,
        )
        return {
          instrumentation,
          model,
          timestampMilliseconds: current.timestampMilliseconds + 100,
        }
      },
      {
        instrumentation: makeSignalInstrumentationState(),
        model: initialModel(),
        timestampMilliseconds: 0,
      },
    )

    expect(afterAudio.instrumentation.observations).toHaveLength(1)
    expect(afterAudio.instrumentation.observations).toMatchObject([
      {
        lastObservedAtMilliseconds: 700,
        timestampsMilliseconds: [200, 300, 400, 500, 600, 700],
      },
    ])
    expect(
      afterAudio.instrumentation.observations.every(
        observation => observation.messageIdentity.length === 8,
      ),
    ).toBe(true)

    const [afterTimerInstrumentation, [afterTimerModel]] = instrumentedUpdate(
      afterAudio.instrumentation,
      afterAudio.model,
      TimerTicked(),
      800,
    )
    const [finalInstrumentation] = instrumentedUpdate(
      afterTimerInstrumentation,
      afterTimerModel,
      ConnectionStatusChanged({ status: 'connected' }),
      900,
    )

    expect(finalInstrumentation.observations).toMatchObject([
      {
        lastObservedAtMilliseconds: 800,
        timestampsMilliseconds: [800],
      },
      {
        lastObservedAtMilliseconds: 900,
        timestampsMilliseconds: [900],
      },
    ])
    const [firstObservation, secondObservation] =
      finalInstrumentation.observations
    expect(firstObservation?.messageIdentity).not.toBe(
      secondObservation?.messageIdentity,
    )

    const reducedInstrumentedUpdate = instrumentSignals(update, {
      captureModel: () =>
        CapturedModel.make({ audioLevel: 0, count: 0, elapsedTicks: 0 }),
      difference: () => Option.none(),
      messageTag: message => message._tag,
      options: SignalInstrumentationOptions.make({
        ...options([], ['TimerTicked'], []),
        maximumObservedMessages: 1,
        maximumSamplesPerMessage: 4,
      }),
    })
    const [reboundedSamples] = reducedInstrumentedUpdate(
      afterAudio.instrumentation,
      afterAudio.model,
      TimerTicked(),
      1_000,
    )
    const [reboundedObservations] = reducedInstrumentedUpdate(
      finalInstrumentation,
      afterTimerModel,
      TimerTicked(),
      1_000,
    )

    expect(reboundedSamples.observations).toMatchObject([
      { timestampsMilliseconds: [400, 500, 600, 700] },
    ])
    expect(reboundedObservations.observations).toHaveLength(1)
  })

  it('learns regular and analog unknown cadence from injected timestamps', () => {
    const noExplicitPatterns = options([], [], [])
    const makeInstrumentedUpdate = () =>
      instrumentSignals(update, {
        captureModel: model =>
          CapturedModel.make({
            audioLevel: model.audioLevel,
            count: model.count,
            elapsedTicks: model.elapsedTicks,
          }),
        difference: () => Option.none(),
        messageTag: message => message._tag,
        options: noExplicitPatterns,
      })

    const regularKinds = runKinds(
      makeInstrumentedUpdate(),
      [0, 100, 200, 300],
      timestamp => UpdatedAudioLevel({ level: timestamp }),
    )
    const analogKinds = runKinds(
      makeInstrumentedUpdate(),
      [0, 20, 180, 210],
      timestamp => UpdatedAudioLevel({ level: timestamp }),
    )

    expect(regularKinds).toEqual([
      'Discrete',
      'Discrete',
      'Discrete',
      'Periodic',
    ])
    expect(analogKinds).toEqual([
      'Discrete',
      'Discrete',
      'Discrete',
      'Continuous',
    ])
  })

  it('keeps five-hundred-millisecond user Messages discrete and forgets expired cadence', () => {
    const instrumentedUpdate = instrumentSignals(update, {
      captureModel: model =>
        CapturedModel.make({
          audioLevel: model.audioLevel,
          count: model.count,
          elapsedTicks: model.elapsedTicks,
        }),
      difference: () => Option.none(),
      messageTag: message => message._tag,
      options: options([], [], []),
    })

    expect(
      runKinds(instrumentedUpdate, [0, 500, 1_000, 1_500, 2_000], () =>
        ClickedPlusButton(),
      ),
    ).toEqual(['Discrete', 'Discrete', 'Discrete', 'Discrete', 'Discrete'])

    const regularThenSilent = runKinds(
      instrumentedUpdate,
      [3_000, 3_100, 3_200, 3_300, 5_000],
      timestamp => ConnectionStatusChanged({ status: `${timestamp}` }),
    )
    expect(regularThenSilent).toEqual([
      'Discrete',
      'Discrete',
      'Discrete',
      'Periodic',
      'Discrete',
    ])
  })

  it('bounds tags, deltas, observations, transitions, and retained-size metrics', () => {
    const instrumentedUpdate = instrumentSignals(update, {
      captureModel: model =>
        CapturedModel.make({
          audioLevel: model.audioLevel,
          count: model.count,
          elapsedTicks: model.elapsedTicks,
        }),
      difference: () => Option.some('0123456789'),
      messageTag: message => `${message._tag}-message-tag-is-long`,
      options: SignalInstrumentationOptions.make({
        ...options([], [], ['Clicked']),
        maximumDeltaCharacters: 4,
        maximumMessageTagCharacters: 12,
        maximumObservedMessages: 2,
        maximumSamplesPerMessage: 4,
        maximumTransitions: 2,
      }),
    })

    const final = [0, 1, 2].reduce(
      current => {
        const [instrumentation, [model]] = instrumentedUpdate(
          current.instrumentation,
          current.model,
          ClickedPlusButton(),
          current.instrumentation.metrics.discreteTransitionsEmitted,
        )
        return { instrumentation, model }
      },
      {
        instrumentation: makeSignalInstrumentationState(),
        model: initialModel(),
      },
    )

    expect(final.instrumentation.transitions).toHaveLength(2)
    expect(final.instrumentation.transitions).toEqual([
      {
        kind: 'Discrete',
        messageTag: 'ClickedPlusB',
        modelDelta: Option.some('0123'),
        timestampMilliseconds: 1,
      },
      {
        kind: 'Discrete',
        messageTag: 'ClickedPlusB',
        modelDelta: Option.some('0123'),
        timestampMilliseconds: 2,
      },
    ])
    expect(final.instrumentation.metrics).toMatchObject({
      retainedDeltaCharacters: 8,
      retainedTransitionCount: 2,
    })
  })

  it('preserves a child ReturnWithOutMessage for exhaustive parent composition', () => {
    const RequestedStop = m('RequestedStop')
    const OutMessage = S.Union([RequestedStop])
    type OutMessage = typeof OutMessage.Type
    type ChildReturn = ReturnWithOutMessage<Model, Message, OutMessage>
    const childUpdate = (model: Model, _message: Message): ChildReturn => [
      model,
      [],
      Option.some(RequestedStop()),
    ]
    const instrumentedChildUpdate = instrumentSignals(childUpdate, {
      captureModel: model =>
        CapturedModel.make({
          audioLevel: model.audioLevel,
          count: model.count,
          elapsedTicks: model.elapsedTicks,
        }),
      difference: () => Option.none(),
      messageTag: message => message._tag,
      options: options(),
    })

    const [, childReturn] = instrumentedChildUpdate(
      makeSignalInstrumentationState(),
      initialModel(),
      ClickedPlusButton(),
      0,
    )
    const [, commands, maybeOutMessage] = childReturn
    const maybeHandledOutMessage = Option.map(maybeOutMessage, outMessage =>
      M.value(outMessage).pipe(
        M.tagsExhaustive({
          RequestedStop: () => 'requested-stop',
        }),
      ),
    )

    expectTypeOf(childReturn).toEqualTypeOf<ChildReturn>()
    expect(commands).toEqual([])
    expect(maybeHandledOutMessage).toEqual(Option.some('requested-stop'))
  })
})

type InstrumentedUpdate = ReturnType<
  typeof instrumentSignals<Model, Message, CapturedModel, UpdateReturn>
>

const runKinds = (
  instrumentedUpdate: InstrumentedUpdate,
  timestamps: ReadonlyArray<number>,
  message: (timestamp: number) => Message,
): ReadonlyArray<string> => {
  const seed = {
    instrumentation: makeSignalInstrumentationState(),
    kinds: globalThis.Array<string>(),
    model: initialModel(),
  }
  return timestamps.reduce((current, timestamp) => {
    const [instrumentation, [model], maybeTransition] = instrumentedUpdate(
      current.instrumentation,
      current.model,
      message(timestamp),
      timestamp,
    )
    const kind = Option.match(maybeTransition, {
      onNone: () => instrumentation.lastClassification,
      onSome: transition => transition.kind,
    })
    return {
      instrumentation,
      kinds: [...current.kinds, kind],
      model,
    }
  }, seed).kinds
}

expectTypeOf(makeSignalInstrumentationState()).toEqualTypeOf<
  typeof SignalInstrumentationState.Type
>()
