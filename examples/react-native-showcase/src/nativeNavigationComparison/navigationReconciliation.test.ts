import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  PendingNativeTransition,
  nativeNavigationReconciliation,
} from './navigationReconciliation'

describe('native navigation reconciliation', () => {
  it('pushes a Program Scene after a completed strict native pop', () => {
    const completedPop = nativeNavigationReconciliation({
      isProgramHome: true,
      maybePendingTransition: Option.some(
        PendingNativeTransition.make({
          maybeDecision: Option.some('Allowed'),
          policy: 'StrictProgramFirst',
        }),
      ),
      nativeRoute: 'Home',
    })

    expect(completedPop._tag).toBe('ReleasedAcceptedNativePop')

    const nextProgramScene = nativeNavigationReconciliation({
      isProgramHome: false,
      maybePendingTransition: Option.none(),
      nativeRoute: 'Home',
    })

    expect(nextProgramScene._tag).toBe('PushedNativeScene')
  })

  it('rolls back an optimistic rejection after native Home commits', () => {
    const reconciliation = nativeNavigationReconciliation({
      isProgramHome: false,
      maybePendingTransition: Option.some(
        PendingNativeTransition.make({
          maybeDecision: Option.some('Rejected'),
          policy: 'OptimisticNative',
        }),
      ),
      nativeRoute: 'Home',
    })

    expect(reconciliation._tag).toBe('StartedOptimisticNativeRollback')
  })
})
