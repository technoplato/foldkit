import { Schema as S } from 'effect'

/**
 * Model token counts for one round. Zero is honest when no model ran.
 */
export const Tokens = S.Struct({
  input: S.Number,
  output: S.Number,
  total: S.Number,
})
/** Model token counts for one round. */
export type Tokens = typeof Tokens.Type

/** Honest zeros when this round made no model call. */
export const zeroTokens: Tokens = {
  input: 0,
  output: 0,
  total: 0,
}
