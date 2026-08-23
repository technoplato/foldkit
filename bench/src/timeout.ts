import { Schema as S } from 'effect'

/** Timeout as a single millisecond budget. */
export const TimeoutMs = S.Number

/** Timeout split into a total budget and a per-step budget. */
export const TimeoutSteps = S.Struct({
  totalMs: S.Number,
  stepMs: S.Number,
})

/**
 * Request timeout. A number is milliseconds. An object splits total vs step.
 */
export const Timeout = S.Union([TimeoutMs, TimeoutSteps])
/** Request timeout. */
export type Timeout = typeof Timeout.Type

const defaultTotalMs = 180_000

/** Total millisecond budget for one bench run. */
export const totalTimeoutMs = (timeout: Timeout | undefined): number => {
  if (timeout === undefined) {
    return defaultTotalMs
  }
  if (S.is(TimeoutMs)(timeout)) {
    return timeout
  }
  return timeout.totalMs
}

/** Per-step millisecond budget. Falls back to the total when unset. */
export const stepTimeoutMs = (timeout: Timeout | undefined): number => {
  if (timeout === undefined) {
    return defaultTotalMs
  }
  if (S.is(TimeoutMs)(timeout)) {
    return timeout
  }
  return timeout.stepMs
}
