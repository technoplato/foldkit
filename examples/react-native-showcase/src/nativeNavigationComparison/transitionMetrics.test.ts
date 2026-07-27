import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AttemptedNativeBackTransition,
  CancelledNativeBackGesture,
  ObservedNativePopStart,
  ObservedNativeStackStateCommit,
  ObservedProgramModelCommit,
  ObservedPrototypeInjectedProgramDecision,
  ObservedVisualCommit,
  ObservedVisualRollback,
  ObservedVisualRollbackStart,
  SuppressedDuplicateNativeBackTransition,
  initialTransitionMetrics,
  recordTransitionObservation,
} from './transitionMetrics'

describe('native navigation transition metrics', () => {
  it('records the complete optimistic rollback lifecycle', () => {
    const attempted = recordTransitionObservation(
      initialTransitionMetrics,
      AttemptedNativeBackTransition.make({}),
    )
    const decided = recordTransitionObservation(
      attempted,
      ObservedPrototypeInjectedProgramDecision.make({
        decision: 'Rejected',
        latencyMilliseconds: 640,
      }),
    )
    const committed = recordTransitionObservation(
      recordTransitionObservation(
        recordTransitionObservation(
          recordTransitionObservation(
            decided,
            ObservedProgramModelCommit.make({ latencyMilliseconds: 648 }),
          ),
          ObservedNativeStackStateCommit.make({ latencyMilliseconds: 649 }),
        ),
        ObservedNativePopStart.make({ latencyMilliseconds: 651 }),
      ),
      ObservedVisualCommit.make({ latencyMilliseconds: 302 }),
    )
    const rolledBack = recordTransitionObservation(
      recordTransitionObservation(
        committed,
        ObservedVisualRollbackStart.make({ latencyMilliseconds: 690 }),
      ),
      ObservedVisualRollback.make({ latencyMilliseconds: 991 }),
    )

    expect(rolledBack.attemptedTransitions).toBe(1)
    expect(rolledBack.visualCommits).toBe(1)
    expect(rolledBack.visualRollbacks).toBe(1)
    expect(rolledBack.maybeLastDecision).toStrictEqual(Option.some('Rejected'))
    expect(
      rolledBack.maybePrototypeInjectedProgramDecisionLatencyMilliseconds,
    ).toStrictEqual(Option.some(640))
    expect(rolledBack.maybeVisualCommitLatencyMilliseconds).toStrictEqual(
      Option.some(302),
    )
    expect(rolledBack.maybeProgramModelCommitLatencyMilliseconds).toStrictEqual(
      Option.some(648),
    )
    expect(rolledBack.maybeNativePopStartLatencyMilliseconds).toStrictEqual(
      Option.some(651),
    )
    expect(
      rolledBack.maybeNativeStackStateCommitLatencyMilliseconds,
    ).toStrictEqual(Option.some(649))
    expect(
      rolledBack.maybeVisualRollbackStartLatencyMilliseconds,
    ).toStrictEqual(Option.some(690))
    expect(rolledBack.maybeVisualRollbackLatencyMilliseconds).toStrictEqual(
      Option.some(991),
    )
  })

  it('counts canceled gestures and suppressed duplicate transitions', () => {
    const canceled = recordTransitionObservation(
      initialTransitionMetrics,
      CancelledNativeBackGesture.make({}),
    )
    const suppressed = recordTransitionObservation(
      canceled,
      SuppressedDuplicateNativeBackTransition.make({}),
    )

    expect(suppressed.canceledGestures).toBe(1)
    expect(suppressed.duplicateTransitionsSuppressed).toBe(1)
  })
})
