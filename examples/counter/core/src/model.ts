import { Schema as S } from 'effect'

// MODEL

/** The count every Counter occurrence starts from. */
export const initialCount = 0

/**
 * The Counter Model: one count. The action menu and its navigation belong
 * to the composed App, not to the Counter.
 */
export const Model = S.Struct({
  count: S.Number,
})
/** A Counter Model value. */
export type Model = typeof Model.Type
