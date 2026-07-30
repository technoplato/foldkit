import { Effect, Option } from 'effect'
import { describe, expect, it, vi } from 'vitest'

import {
  recoverViewerAfterFailure,
  viewerFailureReloadIntervalMs,
} from './viewerFailureRecovery.js'

describe('viewer failure recovery', () => {
  it('reloads once when no recent recovery was attempted', () => {
    const recordAttempt = vi.fn(() => true)
    const reload = vi.fn()

    const didReload = Effect.runSync(
      recoverViewerAfterFailure({
        maybeLastAttemptMs: () => Option.none(),
        nowMs: () => 10_000,
        recordAttempt,
        reload,
      }),
    )

    expect(didReload).toBe(true)
    expect(recordAttempt).toHaveBeenCalledWith(10_000)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('leaves the diagnostic visible after a recent recovery attempt', () => {
    const recordAttempt = vi.fn(() => true)
    const reload = vi.fn()

    const didReload = Effect.runSync(
      recoverViewerAfterFailure({
        maybeLastAttemptMs: () => Option.some(10_000),
        nowMs: () => 10_000 + viewerFailureReloadIntervalMs - 1,
        recordAttempt,
        reload,
      }),
    )

    expect(didReload).toBe(false)
    expect(recordAttempt).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not risk a reload loop when the attempt cannot be recorded', () => {
    const reload = vi.fn()

    const didReload = Effect.runSync(
      recoverViewerAfterFailure({
        maybeLastAttemptMs: () => Option.none(),
        nowMs: () => 10_000,
        recordAttempt: () => false,
        reload,
      }),
    )

    expect(didReload).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
