import { Schema as S } from 'effect'

/**
 * Line churn between rounds. `changed` is added plus removed.
 */
export const Loc = S.Struct({
  added: S.Number,
  removed: S.Number,
  changed: S.Number,
})
/** Line churn between rounds. */
export type Loc = typeof Loc.Type

/** Honest zeros when this round did not edit the submission. */
export const unchangedLoc: Loc = {
  added: 0,
  removed: 0,
  changed: 0,
}
