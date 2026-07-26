import * as Calculator from 'calculator-core-example'
import * as Counter from 'counter-core-example'
import { Array, Option } from 'effect'
import * as Fact from 'fact-core-example'

/** One explicitly host-sendable Message in a replay example. */
export type ReplayHostAction<Message> = Readonly<{
  id: string
  label: string
  message: Message
}>

const counterAction = (
  id: string,
  label: string,
  message: Counter.Message,
): ReplayHostAction<Counter.Message> => ({ id, label, message })

const calculatorAction = (
  id: string,
  label: string,
  message: Calculator.Message,
): ReplayHostAction<Calculator.Message> => ({ id, label, message })

const factAction = (
  id: string,
  label: string,
  message: Fact.Message,
): ReplayHostAction<Fact.Message> => ({ id, label, message })

/** Counter Messages that a replay host may send deliberately. */
export const counterActions: ReadonlyArray<ReplayHostAction<Counter.Message>> =
  [
    counterAction('increment', 'increment', Counter.ClickedIncrement()),
    counterAction('decrement', 'decrement', Counter.ClickedDecrement()),
    counterAction('reset', 'reset', Counter.ClickedReset()),
  ]

/** Calculator Messages that a replay host may send deliberately. */
export const calculatorActions: ReadonlyArray<
  ReplayHostAction<Calculator.Message>
> = [
  calculatorAction('backspace', '⌫', Calculator.PressedBackspace()),
  calculatorAction('clear', 'AC', Calculator.PressedClear()),
  calculatorAction('percent', '%', Calculator.PressedPercent()),
  calculatorAction(
    'operation-divide',
    '÷',
    Calculator.PressedOperation({ operation: 'Divide' }),
  ),
  calculatorAction(
    'digit-seven',
    '7',
    Calculator.PressedDigit({ digit: 'Seven' }),
  ),
  calculatorAction(
    'digit-eight',
    '8',
    Calculator.PressedDigit({ digit: 'Eight' }),
  ),
  calculatorAction(
    'digit-nine',
    '9',
    Calculator.PressedDigit({ digit: 'Nine' }),
  ),
  calculatorAction(
    'operation-multiply',
    '×',
    Calculator.PressedOperation({ operation: 'Multiply' }),
  ),
  calculatorAction(
    'digit-four',
    '4',
    Calculator.PressedDigit({ digit: 'Four' }),
  ),
  calculatorAction(
    'digit-five',
    '5',
    Calculator.PressedDigit({ digit: 'Five' }),
  ),
  calculatorAction('digit-six', '6', Calculator.PressedDigit({ digit: 'Six' })),
  calculatorAction(
    'operation-subtract',
    '−',
    Calculator.PressedOperation({ operation: 'Subtract' }),
  ),
  calculatorAction('digit-one', '1', Calculator.PressedDigit({ digit: 'One' })),
  calculatorAction('digit-two', '2', Calculator.PressedDigit({ digit: 'Two' })),
  calculatorAction(
    'digit-three',
    '3',
    Calculator.PressedDigit({ digit: 'Three' }),
  ),
  calculatorAction(
    'operation-add',
    '+',
    Calculator.PressedOperation({ operation: 'Add' }),
  ),
  calculatorAction('sign', '+/−', Calculator.PressedSign()),
  calculatorAction(
    'digit-zero',
    '0',
    Calculator.PressedDigit({ digit: 'Zero' }),
  ),
  calculatorAction('decimal', '.', Calculator.PressedDecimalSeparator()),
  calculatorAction('equals', '=', Calculator.PressedEquals()),
]

/** Fact Messages that a replay host may send deliberately. */
export const factActions: ReadonlyArray<ReplayHostAction<Fact.Message>> = [
  factAction('load-fact', 'load fact', Fact.ClickedLoadFact()),
]

/** The default Counter tape is a sequence of real Messages. */
export const defaultCounterMessages: ReadonlyArray<Counter.Message> = [
  Counter.ClickedIncrement(),
  Counter.ClickedIncrement(),
  Counter.ClickedDecrement(),
]

/** The default Calculator tape is a sequence of real Messages. */
export const defaultCalculatorMessages: ReadonlyArray<Calculator.Message> = [
  Calculator.PressedDigit({ digit: 'Six' }),
  Calculator.PressedDigit({ digit: 'Six' }),
  Calculator.PressedOperation({ operation: 'Multiply' }),
  Calculator.PressedDigit({ digit: 'Seven' }),
  Calculator.PressedDigit({ digit: 'Seven' }),
]

/** Finds one permitted host action by stable identifier. */
export const replayActionForId = <Message>(
  actions: ReadonlyArray<ReplayHostAction<Message>>,
  id: string,
): Option.Option<ReplayHostAction<Message>> =>
  Array.findFirst(actions, action => action.id === id)
