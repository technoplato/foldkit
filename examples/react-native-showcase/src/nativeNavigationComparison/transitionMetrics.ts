import { Match as M, Option, Schema as S } from 'effect'

/** The native navigation ordering policy selected by the comparison host. */
export const NavigationPolicy = S.Literals([
  'StrictProgramFirst',
  'OptimisticNative',
])
/** A native navigation ordering policy. */
export type NavigationPolicy = typeof NavigationPolicy.Type

/** The host-only decision returned for one prototype Back attempt. */
export const ProgramDecision = S.Literals(['Allowed', 'Rejected'])
/** A host-only prototype decision. */
export type ProgramDecision = typeof ProgramDecision.Type

/** The latency mode of the host-only injected decision gate. */
export const DecisionDelay = S.Literals(['Immediate', 'Slow650Milliseconds'])
/** An injected decision-gate latency mode. */
export type DecisionDelay = typeof DecisionDelay.Type

/** The observable lifecycle phase of one native Back comparison. */
export const TransitionPhase = S.Literals([
  'Idle',
  'AwaitingPrototypeDecision',
  'AwaitingProgramCommit',
  'NativePopInFlight',
  'RollingBack',
])
/** An observable native Back comparison phase. */
export type TransitionPhase = typeof TransitionPhase.Type

/** Records that a native Back transition was attempted. */
export const AttemptedNativeBackTransition = S.TaggedStruct(
  'AttemptedNativeBackTransition',
  {},
)
/** Records the host's prototype-injected Program decision boundary. */
export const ObservedPrototypeInjectedProgramDecision = S.TaggedStruct(
  'ObservedPrototypeInjectedProgramDecision',
  {
    decision: ProgramDecision,
    latencyMilliseconds: S.Number,
  },
)
/** Records that the accepted Back Message reached HomeScene in the Program Model. */
export const ObservedProgramModelCommit = S.TaggedStruct(
  'ObservedProgramModelCommit',
  { latencyMilliseconds: S.Number },
)
/** Records that the native pop transition started. */
export const ObservedNativePopStart = S.TaggedStruct('ObservedNativePopStart', {
  latencyMilliseconds: S.Number,
})
/** Records that the navigation container committed native Home state. */
export const ObservedNativeStackStateCommit = S.TaggedStruct(
  'ObservedNativeStackStateCommit',
  { latencyMilliseconds: S.Number },
)
/** Records that the native pop became visually committed. */
export const ObservedVisualCommit = S.TaggedStruct('ObservedVisualCommit', {
  latencyMilliseconds: S.Number,
})
/** Records that an optimistic native pop visibly rolled back. */
export const ObservedVisualRollback = S.TaggedStruct('ObservedVisualRollback', {
  latencyMilliseconds: S.Number,
})
/** Records that the optimistic rollback transition started. */
export const ObservedVisualRollbackStart = S.TaggedStruct(
  'ObservedVisualRollbackStart',
  { latencyMilliseconds: S.Number },
)
/** Records that native-stack emitted its gestureCancel event. */
export const CancelledNativeBackGesture = S.TaggedStruct(
  'CancelledNativeBackGesture',
  {},
)
/** Records that the host suppressed a second Back attempt while one was pending. */
export const SuppressedDuplicateNativeBackTransition = S.TaggedStruct(
  'SuppressedDuplicateNativeBackTransition',
  {},
)

/** Every observable transition event recorded by the native comparison host. */
export const TransitionObservation = S.Union([
  AttemptedNativeBackTransition,
  ObservedPrototypeInjectedProgramDecision,
  ObservedProgramModelCommit,
  ObservedNativePopStart,
  ObservedNativeStackStateCommit,
  ObservedVisualCommit,
  ObservedVisualRollbackStart,
  ObservedVisualRollback,
  CancelledNativeBackGesture,
  SuppressedDuplicateNativeBackTransition,
])
/** An observable transition event. */
export type TransitionObservation = typeof TransitionObservation.Type

/** One sequenced entry in the raw native transition observation trace. */
export const RecordedTransitionObservation = S.Struct({
  observation: TransitionObservation,
  sequenceNumber: S.Number,
})
/** A sequenced raw native transition observation. */
export type RecordedTransitionObservation =
  typeof RecordedTransitionObservation.Type

/** Aggregate metrics shown by the native navigation comparison host. */
export const TransitionMetrics = S.Struct({
  attemptedTransitions: S.Number,
  canceledGestures: S.Number,
  duplicateTransitionsSuppressed: S.Number,
  maybePrototypeInjectedProgramDecisionLatencyMilliseconds: S.Option(S.Number),
  maybeProgramModelCommitLatencyMilliseconds: S.Option(S.Number),
  maybeNativePopStartLatencyMilliseconds: S.Option(S.Number),
  maybeNativeStackStateCommitLatencyMilliseconds: S.Option(S.Number),
  maybeVisualCommitLatencyMilliseconds: S.Option(S.Number),
  maybeVisualRollbackStartLatencyMilliseconds: S.Option(S.Number),
  maybeVisualRollbackLatencyMilliseconds: S.Option(S.Number),
  maybeLastDecision: S.Option(ProgramDecision),
  visualCommits: S.Number,
  visualRollbacks: S.Number,
})
/** Observable native navigation metrics. */
export type TransitionMetrics = typeof TransitionMetrics.Type

/** Empty native navigation metrics for a new comparison run. */
export const initialTransitionMetrics: TransitionMetrics =
  TransitionMetrics.make({
    attemptedTransitions: 0,
    canceledGestures: 0,
    duplicateTransitionsSuppressed: 0,
    maybeLastDecision: Option.none(),
    maybePrototypeInjectedProgramDecisionLatencyMilliseconds: Option.none(),
    maybeProgramModelCommitLatencyMilliseconds: Option.none(),
    maybeNativePopStartLatencyMilliseconds: Option.none(),
    maybeNativeStackStateCommitLatencyMilliseconds: Option.none(),
    maybeVisualCommitLatencyMilliseconds: Option.none(),
    maybeVisualRollbackStartLatencyMilliseconds: Option.none(),
    maybeVisualRollbackLatencyMilliseconds: Option.none(),
    visualCommits: 0,
    visualRollbacks: 0,
  })

/** Folds one native navigation observation into the displayed metrics. */
export const recordTransitionObservation = (
  metrics: TransitionMetrics,
  observation: TransitionObservation,
): TransitionMetrics =>
  M.value(observation).pipe(
    M.withReturnType<TransitionMetrics>(),
    M.tagsExhaustive({
      AttemptedNativeBackTransition: () =>
        TransitionMetrics.make({
          ...metrics,
          attemptedTransitions: metrics.attemptedTransitions + 1,
        }),
      ObservedPrototypeInjectedProgramDecision: ({
        decision,
        latencyMilliseconds,
      }) =>
        TransitionMetrics.make({
          ...metrics,
          maybeLastDecision: Option.some(decision),
          maybePrototypeInjectedProgramDecisionLatencyMilliseconds:
            Option.some(latencyMilliseconds),
        }),
      ObservedProgramModelCommit: ({ latencyMilliseconds }) =>
        TransitionMetrics.make({
          ...metrics,
          maybeProgramModelCommitLatencyMilliseconds:
            Option.some(latencyMilliseconds),
        }),
      ObservedNativePopStart: ({ latencyMilliseconds }) =>
        TransitionMetrics.make({
          ...metrics,
          maybeNativePopStartLatencyMilliseconds:
            Option.some(latencyMilliseconds),
        }),
      ObservedNativeStackStateCommit: ({ latencyMilliseconds }) =>
        TransitionMetrics.make({
          ...metrics,
          maybeNativeStackStateCommitLatencyMilliseconds:
            Option.some(latencyMilliseconds),
        }),
      ObservedVisualCommit: ({ latencyMilliseconds }) =>
        TransitionMetrics.make({
          ...metrics,
          maybeVisualCommitLatencyMilliseconds:
            Option.some(latencyMilliseconds),
          visualCommits: metrics.visualCommits + 1,
        }),
      ObservedVisualRollback: ({ latencyMilliseconds }) =>
        TransitionMetrics.make({
          ...metrics,
          maybeVisualRollbackLatencyMilliseconds:
            Option.some(latencyMilliseconds),
          visualRollbacks: metrics.visualRollbacks + 1,
        }),
      ObservedVisualRollbackStart: ({ latencyMilliseconds }) =>
        TransitionMetrics.make({
          ...metrics,
          maybeVisualRollbackStartLatencyMilliseconds:
            Option.some(latencyMilliseconds),
        }),
      CancelledNativeBackGesture: () =>
        TransitionMetrics.make({
          ...metrics,
          canceledGestures: metrics.canceledGestures + 1,
        }),
      SuppressedDuplicateNativeBackTransition: () =>
        TransitionMetrics.make({
          ...metrics,
          duplicateTransitionsSuppressed:
            metrics.duplicateTransitionsSuppressed + 1,
        }),
    }),
  )
