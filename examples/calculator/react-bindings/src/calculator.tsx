import {
  CalculatorProgram,
  type Digit,
  Message,
  Model,
  type Operation,
  PressedBackspace,
  PressedClear,
  PressedDecimalSeparator,
  PressedDigit,
  PressedEquals,
  PressedOperation,
  PressedPercent,
  PressedSign,
} from 'calculator-core-example'
import { Layer } from 'effect'
import { createReactProgramBindings } from 'shared-react-bindings-example'

/** Actions exposed to React consumers of the Calculator Program. */
export type CalculatorActions = Readonly<{
  pressedBackspace: () => void
  pressedClear: () => void
  pressedDecimalSeparator: () => void
  pressedDigit: (digit: Digit) => void
  pressedEquals: () => void
  pressedOperation: (operation: Operation) => void
  pressedPercent: () => void
  pressedSign: () => void
}>

const calculatorBindings = createReactProgramBindings<
  Model,
  Message,
  CalculatorActions
>({
  createActions: enqueueMessage => ({
    pressedBackspace: () => enqueueMessage(PressedBackspace()),
    pressedClear: () => enqueueMessage(PressedClear()),
    pressedDecimalSeparator: () => enqueueMessage(PressedDecimalSeparator()),
    pressedDigit: digit => enqueueMessage(PressedDigit({ digit })),
    pressedEquals: () => enqueueMessage(PressedEquals()),
    pressedOperation: operation =>
      enqueueMessage(PressedOperation({ operation })),
    pressedPercent: () => enqueueMessage(PressedPercent()),
    pressedSign: () => enqueueMessage(PressedSign()),
  }),
  name: 'Calculator',
  program: CalculatorProgram,
  resources: Layer.empty,
})

/** Provides one Calculator runtime to React children. */
export const CalculatorProvider = calculatorBindings.Provider

/** Reads the current immutable Calculator Model and re-renders on Model changes. */
export const useCalculatorModel = calculatorBindings.useModel

/** Returns stable, host-callable Calculator actions. */
export const useCalculatorActions = calculatorBindings.useActions
