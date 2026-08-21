import { Schema as S } from 'effect'

// MODEL

/** The canonical initial count shared by Counter hosts. */
export const initialCount = 0

/** Portable URI for this Program. */
export const uri = '/counter'

/** Product identity title printed by `show` IDENTITY. Not host chrome. */
export const title = 'counter'

/**
 * Product identity sentence. Host chrome looks up `hostSurfaces`, not this.
 * `show` IDENTITY prints the CLI host description from core.
 */
export const description =
  'all business logic and sync logic are written in Foldkit; consumed and rendered by CLI.'

/** The Counter's current count. */
export const Model = S.Struct({ count: S.Number })
/** A Counter Model value. */
export type Model = typeof Model.Type
