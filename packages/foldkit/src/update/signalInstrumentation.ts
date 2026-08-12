import { Array, Option, Schema as S, String as String_ } from 'effect'

/** The semantic shape of a Message stream. */
export const SignalKind = S.Literals(['Continuous', 'Periodic', 'Discrete'])

/** The semantic shape of a Message stream. */
export type SignalKind = typeof SignalKind.Type

/** One bounded cadence history for an otherwise unknown Message. */
export const SignalObservation = S.Struct({
  lastObservedAtMilliseconds: S.Number,
  messageIdentity: S.String,
  timestampsMilliseconds: S.Array(S.Number),
})

/** One bounded cadence history for an otherwise unknown Message. */
export type SignalObservation = typeof SignalObservation.Type

/** The immediate Model delta emitted for one discrete Message. */
export const SignalTransition = S.Struct({
  kind: SignalKind,
  messageTag: S.String,
  modelDelta: S.Option(S.String),
  timestampMilliseconds: S.Number,
})

/** The immediate Model delta emitted for one discrete Message. */
export type SignalTransition = typeof SignalTransition.Type

/** Fixed-size counters for proving the instrumentation's own cost. */
export const SignalPerformanceMetrics = S.Struct({
  classificationWorkUnits: S.Number,
  discreteTransitionsEmitted: S.Number,
  modelCaptureCount: S.Number,
  modelDifferenceCount: S.Number,
  retainedDeltaCharacters: S.Number,
  retainedTransitionCount: S.Number,
  suppressedContinuousCount: S.Number,
  suppressedPeriodicCount: S.Number,
})

/** Fixed-size counters for proving the instrumentation's own cost. */
export type SignalPerformanceMetrics = typeof SignalPerformanceMetrics.Type

/** Serializable limits and explicit domain classifications for signal instrumentation. */
export const SignalInstrumentationOptions = S.Struct({
  continuousPatterns: S.Array(S.String),
  discretePatterns: S.Array(S.String),
  highFrequencyThresholdHz: S.Number,
  maximumDeltaCharacters: S.Number,
  maximumMessageTagCharacters: S.Number,
  maximumObservedMessages: S.Number,
  maximumSamplesPerMessage: S.Number,
  maximumTransitions: S.Number,
  observationWindowMilliseconds: S.Number,
  periodicJitterTolerance: S.Number,
  periodicPatterns: S.Array(S.String),
})

/** Serializable limits and explicit domain classifications for signal instrumentation. */
export type SignalInstrumentationOptions =
  typeof SignalInstrumentationOptions.Type

/** Parallel cross-cutting state threaded beside a Program's domain Model. */
export const SignalInstrumentationState = S.Struct({
  lastClassification: SignalKind,
  metrics: SignalPerformanceMetrics,
  observations: S.Array(SignalObservation),
  transitions: S.Array(SignalTransition),
})

/** Parallel cross-cutting state threaded beside a Program's domain Model. */
export type SignalInstrumentationState = typeof SignalInstrumentationState.Type

/** Pure application-specific seams used by {@link instrumentSignals}. */
export type SignalInstrumentationConfig<Model, Message, CapturedModel> =
  Readonly<{
    captureModel: (model: Model) => CapturedModel
    difference: (
      previousModel: CapturedModel,
      nextModel: Model,
    ) => Option.Option<string>
    /** Returns the stable Message discriminator, never its payload. */
    messageTag: (message: Message) => string
    options: SignalInstrumentationOptions
  }>

type UpdateReturn<Model> = readonly [Model, ...ReadonlyArray<unknown>]

/** A pure instrumented update result that preserves the wrapped update tuple unchanged. */
export type SignalInstrumentedReturn<WrappedUpdateReturn> = readonly [
  instrumentation: SignalInstrumentationState,
  updateReturn: WrappedUpdateReturn,
  maybeTransition: Option.Option<SignalTransition>,
]

/** Creates empty, bounded signal instrumentation state. */
export const makeSignalInstrumentationState = (): SignalInstrumentationState =>
  SignalInstrumentationState.make({
    lastClassification: 'Discrete',
    metrics: SignalPerformanceMetrics.make({
      classificationWorkUnits: 0,
      discreteTransitionsEmitted: 0,
      modelCaptureCount: 0,
      modelDifferenceCount: 0,
      retainedDeltaCharacters: 0,
      retainedTransitionCount: 0,
      suppressedContinuousCount: 0,
      suppressedPeriodicCount: 0,
    }),
    observations: [],
    transitions: [],
  })

/**
 * Wraps a pure update with signal-aware, bounded diagnostics.
 *
 * Explicit Continuous and Periodic Messages are classified before `captureModel`, `difference`,
 * or any transition allocation. Unknown Messages learn cadence from the supplied timestamp.
 * Discrete Messages compare only the immediate input Model with that Message's output Model.
 * Classification uses the full stable Message tag; only retained transition labels are truncated.
 * The wrapped return tuple is nested unchanged, so a `ReturnWithOutMessage` keeps its Commands
 * and OutMessage channel for the parent's existing exhaustive handling. Foldkit does not expose a
 * `foldChild` helper today; this wrapper composes with the same manual child-update boundary.
 * Instrumentation state and replayable time remain explicit inputs beside the domain Model, so a
 * Program composition root can store or discard diagnostics without adding them to domain state.
 *
 * `captureModel`, `difference`, and `messageTag` must be pure. Time is an explicit input, not read
 * inside update.
 */
export const instrumentSignals = <
  Model,
  Message,
  CapturedModel,
  WrappedUpdateReturn extends UpdateReturn<Model>,
>(
  update: (model: Model, message: Message) => WrappedUpdateReturn,
  config: SignalInstrumentationConfig<Model, Message, CapturedModel>,
): ((
  instrumentation: SignalInstrumentationState,
  model: Model,
  message: Message,
  timestampMilliseconds: number,
) => SignalInstrumentedReturn<WrappedUpdateReturn>) => {
  const normalizedOptions = normalizeOptions(config.options)
  return (
    instrumentation,
    model,
    message,
    timestampMilliseconds,
  ): SignalInstrumentedReturn<WrappedUpdateReturn> => {
    const boundedInstrumentation = boundInstrumentation(
      instrumentation,
      normalizedOptions,
    )
    const classificationTag = config.messageTag(message)
    const retainedMessageTag = classificationTag.slice(
      0,
      normalizedOptions.maximumMessageTagCharacters,
    )
    const classification = classifySignal(
      boundedInstrumentation.observations,
      classificationTag,
      timestampMilliseconds,
      normalizedOptions,
    )
    const metricsAfterClassification = SignalPerformanceMetrics.make({
      ...boundedInstrumentation.metrics,
      classificationWorkUnits:
        boundedInstrumentation.metrics.classificationWorkUnits +
        classification.workUnits,
    })

    if (classification.kind === 'Continuous') {
      const updateReturn = update(model, message)
      return [
        SignalInstrumentationState.make({
          ...boundedInstrumentation,
          lastClassification: classification.kind,
          metrics: SignalPerformanceMetrics.make({
            ...metricsAfterClassification,
            suppressedContinuousCount:
              metricsAfterClassification.suppressedContinuousCount + 1,
          }),
          observations: classification.observations,
        }),
        updateReturn,
        Option.none(),
      ]
    } else if (classification.kind === 'Periodic') {
      const updateReturn = update(model, message)
      return [
        SignalInstrumentationState.make({
          ...boundedInstrumentation,
          lastClassification: classification.kind,
          metrics: SignalPerformanceMetrics.make({
            ...metricsAfterClassification,
            suppressedPeriodicCount:
              metricsAfterClassification.suppressedPeriodicCount + 1,
          }),
          observations: classification.observations,
        }),
        updateReturn,
        Option.none(),
      ]
    } else {
      const previousModel = config.captureModel(model)
      const updateReturn = update(model, message)
      const [nextModel] = updateReturn
      const maybeModelDelta = Option.map(
        config.difference(previousModel, nextModel),
        modelDelta =>
          modelDelta.slice(0, normalizedOptions.maximumDeltaCharacters),
      )
      const transition = SignalTransition.make({
        kind: classification.kind,
        messageTag: retainedMessageTag,
        modelDelta: maybeModelDelta,
        timestampMilliseconds,
      })
      const transitions = Array.takeRight(
        Array.append(boundedInstrumentation.transitions, transition),
        normalizedOptions.maximumTransitions,
      )
      const retainedDeltaCharacters = countRetainedDeltaCharacters(transitions)

      return [
        SignalInstrumentationState.make({
          lastClassification: classification.kind,
          metrics: SignalPerformanceMetrics.make({
            ...metricsAfterClassification,
            discreteTransitionsEmitted:
              metricsAfterClassification.discreteTransitionsEmitted + 1,
            modelCaptureCount: metricsAfterClassification.modelCaptureCount + 1,
            modelDifferenceCount:
              metricsAfterClassification.modelDifferenceCount + 1,
            retainedDeltaCharacters,
            retainedTransitionCount: Array.length(transitions),
          }),
          observations: classification.observations,
          transitions,
        }),
        updateReturn,
        Option.some(transition),
      ]
    }
  }
}

type NormalizedOptions = Readonly<{
  continuousPatterns: ReadonlyArray<string>
  discretePatterns: ReadonlyArray<string>
  highFrequencyThresholdHz: number
  maximumDeltaCharacters: number
  maximumMessageTagCharacters: number
  maximumObservedMessages: number
  maximumSamplesPerMessage: number
  maximumTransitions: number
  observationWindowMilliseconds: number
  periodicJitterTolerance: number
  periodicPatterns: ReadonlyArray<string>
}>

const maximumSafeDeltaCharacters = 4_000
const maximumSafeMessageIdentityCharacters = 8
const maximumSafeMessageTagCharacters = 256
const maximumSafeObservedMessages = 64
const maximumSafePatternCharacters = 256
const maximumSafePatternsPerKind = 64
const maximumSafeSamplesPerMessage = 128
const maximumSafeTransitions = 64
const maximumSafeObservationWindowMilliseconds = 86_400_000
const maximumSafeFrequencyThresholdHz = 100_000

const normalizeOptions = (
  options: SignalInstrumentationOptions,
): NormalizedOptions => ({
  ...options,
  continuousPatterns: normalizePatterns(options.continuousPatterns),
  discretePatterns: normalizePatterns(options.discretePatterns),
  highFrequencyThresholdHz: boundedNumber(
    options.highFrequencyThresholdHz,
    0,
    maximumSafeFrequencyThresholdHz,
  ),
  maximumDeltaCharacters: boundedInteger(
    options.maximumDeltaCharacters,
    0,
    maximumSafeDeltaCharacters,
  ),
  maximumMessageTagCharacters: boundedInteger(
    options.maximumMessageTagCharacters,
    1,
    maximumSafeMessageTagCharacters,
  ),
  maximumObservedMessages: boundedInteger(
    options.maximumObservedMessages,
    1,
    maximumSafeObservedMessages,
  ),
  maximumSamplesPerMessage: boundedInteger(
    options.maximumSamplesPerMessage,
    4,
    maximumSafeSamplesPerMessage,
  ),
  maximumTransitions: boundedInteger(
    options.maximumTransitions,
    1,
    maximumSafeTransitions,
  ),
  observationWindowMilliseconds: boundedNumber(
    options.observationWindowMilliseconds,
    0,
    maximumSafeObservationWindowMilliseconds,
  ),
  periodicJitterTolerance: boundedNumber(options.periodicJitterTolerance, 0, 1),
  periodicPatterns: normalizePatterns(options.periodicPatterns),
})

const boundedInteger = (
  value: number,
  minimum: number,
  maximum: number,
): number => Math.floor(boundedNumber(value, minimum, maximum))

const boundedNumber = (
  value: number,
  minimum: number,
  maximum: number,
): number =>
  Math.min(
    maximum,
    Math.max(minimum, globalThis.Number.isFinite(value) ? value : maximum),
  )

const normalizePatterns = (
  patterns: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Array.take(
    Array.map(
      Array.filter(patterns, pattern => pattern.length > 0),
      pattern => pattern.slice(0, maximumSafePatternCharacters),
    ),
    maximumSafePatternsPerKind,
  )

const boundInstrumentation = (
  instrumentation: SignalInstrumentationState,
  options: NormalizedOptions,
): SignalInstrumentationState => {
  const transitionsNeedBounding =
    Array.length(instrumentation.transitions) > options.maximumTransitions ||
    Array.some(
      instrumentation.transitions,
      transition =>
        transition.messageTag.length > options.maximumMessageTagCharacters ||
        Option.match(transition.modelDelta, {
          onNone: () => false,
          onSome: modelDelta =>
            modelDelta.length > options.maximumDeltaCharacters,
        }),
    )
  const observationsNeedBounding =
    Array.length(instrumentation.observations) >
      options.maximumObservedMessages ||
    Array.some(
      instrumentation.observations,
      observation =>
        observation.messageIdentity.length >
          maximumSafeMessageIdentityCharacters ||
        Array.length(observation.timestampsMilliseconds) >
          options.maximumSamplesPerMessage,
    )
  if (!transitionsNeedBounding && !observationsNeedBounding) {
    return instrumentation
  }

  const transitions = transitionsNeedBounding
    ? Array.map(
        Array.takeRight(
          instrumentation.transitions,
          options.maximumTransitions,
        ),
        transition =>
          SignalTransition.make({
            ...transition,
            messageTag: transition.messageTag.slice(
              0,
              options.maximumMessageTagCharacters,
            ),
            modelDelta: Option.map(transition.modelDelta, modelDelta =>
              modelDelta.slice(0, options.maximumDeltaCharacters),
            ),
          }),
      )
    : instrumentation.transitions
  const observations = observationsNeedBounding
    ? Array.map(
        Array.takeRight(
          instrumentation.observations,
          options.maximumObservedMessages,
        ),
        observation =>
          SignalObservation.make({
            ...observation,
            messageIdentity: observation.messageIdentity.slice(
              0,
              maximumSafeMessageIdentityCharacters,
            ),
            timestampsMilliseconds: Array.takeRight(
              observation.timestampsMilliseconds,
              options.maximumSamplesPerMessage,
            ),
          }),
      )
    : instrumentation.observations
  return SignalInstrumentationState.make({
    ...instrumentation,
    metrics: SignalPerformanceMetrics.make({
      ...instrumentation.metrics,
      retainedDeltaCharacters: countRetainedDeltaCharacters(transitions),
      retainedTransitionCount: Array.length(transitions),
    }),
    observations,
    transitions,
  })
}

const countRetainedDeltaCharacters = (
  transitions: ReadonlyArray<SignalTransition>,
): number =>
  Array.reduce(
    transitions,
    0,
    (total, retainedTransition) =>
      total +
      Option.match(retainedTransition.modelDelta, {
        onNone: () => 0,
        onSome: modelDelta => modelDelta.length,
      }),
  )

type Classification = Readonly<{
  kind: SignalKind
  observations: ReadonlyArray<SignalObservation>
  workUnits: number
}>

const classifySignal = (
  observations: ReadonlyArray<SignalObservation>,
  messageTag: string,
  timestampMilliseconds: number,
  options: NormalizedOptions,
): Classification => {
  const explicitWorkUnits =
    Array.length(options.continuousPatterns) +
    Array.length(options.periodicPatterns) +
    Array.length(options.discretePatterns)

  if (matchesPattern(messageTag, options.continuousPatterns)) {
    return { kind: 'Continuous', observations, workUnits: explicitWorkUnits }
  } else if (matchesPattern(messageTag, options.periodicPatterns)) {
    return { kind: 'Periodic', observations, workUnits: explicitWorkUnits }
  } else if (matchesPattern(messageTag, options.discretePatterns)) {
    return { kind: 'Discrete', observations, workUnits: explicitWorkUnits }
  }

  const observationIdentity = messageIdentity(messageTag)
  const nextObservations = observeUnknownMessage(
    observations,
    observationIdentity,
    timestampMilliseconds,
    options,
  )
  const maybeObservation = Array.findFirst(
    nextObservations,
    observation => observation.messageIdentity === observationIdentity,
  )
  if (Option.isNone(maybeObservation)) {
    return {
      kind: 'Discrete',
      observations: nextObservations,
      workUnits: explicitWorkUnits,
    }
  }

  const timestamps = maybeObservation.value.timestampsMilliseconds
  const sampleCount = Array.length(timestamps)
  const workUnits = explicitWorkUnits + sampleCount
  if (sampleCount < 4) {
    return { kind: 'Discrete', observations: nextObservations, workUnits }
  }

  const maybeFirst = Array.head(timestamps)
  const maybeLast = Array.last(timestamps)
  if (Option.isNone(maybeFirst) || Option.isNone(maybeLast)) {
    return { kind: 'Discrete', observations: nextObservations, workUnits }
  }
  const windowMilliseconds = maybeLast.value - maybeFirst.value
  if (windowMilliseconds <= 0) {
    return { kind: 'Continuous', observations: nextObservations, workUnits }
  }
  const frequencyHz = (sampleCount - 1) / (windowMilliseconds / 1_000)
  if (frequencyHz <= options.highFrequencyThresholdHz) {
    return { kind: 'Discrete', observations: nextObservations, workUnits }
  }

  const intervals = Array.map(
    Array.zip(Array.drop(timestamps, 1), timestamps),
    ([current, previous]) => current - previous,
  )
  const meanInterval =
    Array.reduce(intervals, 0, (total, interval) => total + interval) /
    Array.length(intervals)
  if (meanInterval <= 0) {
    return { kind: 'Continuous', observations: nextObservations, workUnits }
  }
  const maximumRelativeJitter = Array.reduce(
    intervals,
    0,
    (maximum, interval) =>
      Math.max(maximum, Math.abs(interval - meanInterval) / meanInterval),
  )
  if (maximumRelativeJitter <= options.periodicJitterTolerance) {
    return { kind: 'Periodic', observations: nextObservations, workUnits }
  } else {
    return { kind: 'Continuous', observations: nextObservations, workUnits }
  }
}

const matchesPattern = (
  messageTag: string,
  patterns: ReadonlyArray<string>,
): boolean =>
  Array.some(patterns, pattern => String_.includes(pattern)(messageTag))

const observeUnknownMessage = (
  observations: ReadonlyArray<SignalObservation>,
  messageIdentity: string,
  timestampMilliseconds: number,
  options: NormalizedOptions,
): ReadonlyArray<SignalObservation> => {
  const maybeCurrent = Array.findFirst(
    observations,
    observation => observation.messageIdentity === messageIdentity,
  )
  const cutoff = timestampMilliseconds - options.observationWindowMilliseconds
  const retainedTimestamps = Option.match(maybeCurrent, {
    onNone: () => globalThis.Array<number>(),
    onSome: current => {
      if (timestampMilliseconds < current.lastObservedAtMilliseconds) {
        return globalThis.Array<number>()
      } else {
        return Array.filter(
          current.timestampsMilliseconds,
          observedAt => observedAt >= cutoff,
        )
      }
    },
  })
  const timestampsMilliseconds = Array.takeRight(
    Array.append(retainedTimestamps, timestampMilliseconds),
    options.maximumSamplesPerMessage,
  )
  const nextObservation = SignalObservation.make({
    lastObservedAtMilliseconds: timestampMilliseconds,
    messageIdentity,
    timestampsMilliseconds,
  })
  return Array.takeRight(
    Array.append(
      Array.filter(
        observations,
        observation => observation.messageIdentity !== messageIdentity,
      ),
      nextObservation,
    ),
    options.maximumObservedMessages,
  )
}

const messageIdentity = (messageTag: string): string => {
  let hash = 2_166_136_261
  for (
    let characterIndex = 0;
    characterIndex < messageTag.length;
    characterIndex += 1
  ) {
    hash = Math.imul(hash ^ messageTag.charCodeAt(characterIndex), 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
