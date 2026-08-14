import { Schema as S } from 'effect'

// MODEL

/** The canonical initial count shared by Counter hosts. */
export const initialCount = 0

/** Portable URI for this Program. */
export const uri = '/counter'

/** Identity title printed by `show`. */
export const title = 'counter'

/** The Counter's current count. */
export const Model = S.Struct({ count: S.Number })
/** A Counter Model value. */
export type Model = typeof Model.Type
