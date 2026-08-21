/**
 * Message surface — composed tags under the hood; Got* names kept as
 * constructors so hosts enqueue without learning nested tags first.
 */
import type * as Calculator from 'calculator-core-example'
import type * as Counter from 'counter-core-example'
import type * as Counters from 'counters-core-example'

import {
  CounterListProgram,
  DemoCatalog,
  ShowcaseShell,
  calcMessage,
  multiMessage,
  singleMessage,
} from './catalog.js'
import {
  CanvasChanged as ChromeCanvasChanged,
  FocusedSlotChanged as ChromeFocusedSlotChanged,
  ToggledShowCalc as ChromeToggledShowCalc,
  ToggledShowList as ChromeToggledShowList,
  ToggledShowMulti as ChromeToggledShowMulti,
  ToggledShowSingle as ChromeToggledShowSingle,
  type FocusedSlot,
} from './chrome.js'
import type { Message as LabMessage } from './program.js'

export type Message = LabMessage
export const Message = ShowcaseShell.Message

/** Chrome: canvas pan/zoom. */
export const CanvasChanged = (fields: {
  x: number
  y: number
  scale: number
}): Message => ShowcaseShell.message.chrome(ChromeCanvasChanged(fields))

/** Chrome: focus ring. */
export const FocusedSlotChanged = (fields: { slot: FocusedSlot }): Message =>
  ShowcaseShell.message.chrome(ChromeFocusedSlotChanged(fields))

export const ToggledShowSingle = (): Message =>
  ShowcaseShell.message.chrome(ChromeToggledShowSingle())

export const ToggledShowMulti = (): Message =>
  ShowcaseShell.message.chrome(ChromeToggledShowMulti())

export const ToggledShowCalc = (): Message =>
  ShowcaseShell.message.chrome(ChromeToggledShowCalc())

export const ToggledShowList = (): Message =>
  ShowcaseShell.message.chrome(ChromeToggledShowList())

/** Product: single counter. */
export const GotSingleCounterMessage = (fields: {
  message: Counter.Message
}): Message => singleMessage(fields.message)

/** Product: multi counters. */
export const GotMultiCountersMessage = (fields: {
  message: Counters.Message
}): Message => multiMessage(fields.message)

/** Product: calculator. */
export const GotCalculatorMessage = (fields: {
  message: Calculator.Message
}): Message => calcMessage(fields.message)

/** Product: forEach counter list. */
export const GotCounterListMessage = (fields: {
  message: typeof CounterListProgram.Message.Type
}): Message =>
  ShowcaseShell.message.demos(DemoCatalog.message.list(fields.message))
