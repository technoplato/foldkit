import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { Digit, Operation } from './model.js'

// MESSAGE

/** Records that a digit control was pressed. */
export const PressedDigit = m('PressedDigit', { digit: Digit })
/** Records that an arithmetic operation control was pressed. */
export const PressedOperation = m('PressedOperation', {
  operation: Operation,
})
/** Records that the decimal separator control was pressed. */
export const PressedDecimalSeparator = m('PressedDecimalSeparator')
/** Records that the percent control was pressed. */
export const PressedPercent = m('PressedPercent')
/** Records that the sign toggle control was pressed. */
export const PressedSign = m('PressedSign')
/** Records that the backspace control was pressed. */
export const PressedBackspace = m('PressedBackspace')
/** Records that the equals control was pressed. */
export const PressedEquals = m('PressedEquals')
/** Records that the clear control was pressed. */
export const PressedClear = m('PressedClear')

/** Every Message accepted by the Calculator Program. */
export const Message = S.Union([
  PressedDigit,
  PressedOperation,
  PressedDecimalSeparator,
  PressedPercent,
  PressedSign,
  PressedBackspace,
  PressedEquals,
  PressedClear,
])
/** A Calculator Message value. */
export type Message = typeof Message.Type
