import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

// MESSAGE

/** Records that the decrement control was clicked. */
export const ClickedDecrement = m('ClickedDecrement')
/** Records that the increment control was clicked. */
export const ClickedIncrement = m('ClickedIncrement')
/** Records that the reset control was clicked. */
export const ClickedReset = m('ClickedReset')

/** Every Message accepted by the Counter Program. */
export const Message = S.Union([
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
])
/** A Counter Message value. */
export type Message = typeof Message.Type
