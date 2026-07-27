import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import type { CallableTaggedStruct } from 'foldkit/schema'

// MESSAGE

/** Records that the decrement control was clicked. */
export const ClickedDecrement: CallableTaggedStruct<'ClickedDecrement', {}> =
  m('ClickedDecrement')
/** Records that the increment control was clicked. */
export const ClickedIncrement: CallableTaggedStruct<'ClickedIncrement', {}> =
  m('ClickedIncrement')
/** Records that the reset control was clicked. */
export const ClickedReset: CallableTaggedStruct<'ClickedReset', {}> =
  m('ClickedReset')

/** Every Message accepted by the Counter Program. */
export const Message = S.Union([
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
])
/** A Counter Message value. */
export type Message = typeof Message.Type
