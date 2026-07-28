import { Schema as S } from 'effect'

/** A public block-explorer confirmation supplied by a chain adapter. */
export const BlockExplorerConfirmation = S.Struct({
  label: S.String,
  transactionId: S.String,
  url: S.String,
})
/** A public block-explorer confirmation supplied by a chain adapter. */
export type BlockExplorerConfirmation = typeof BlockExplorerConfirmation.Type
