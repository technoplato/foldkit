import {
  type Digit,
  type Message,
  type Model,
  type Operation,
  PressedBackspace,
  PressedClear,
  PressedDecimalSeparator,
  PressedDigit,
  PressedEquals,
  PressedOperation,
  PressedPercent,
  PressedSign,
  digitText,
  displayForModel,
  expressionForModel,
} from 'calculator-core-example'
import { Document, html } from 'foldkit/html'

import { Button } from '@foldkit/ui'

// VIEW

type CalculatorButton = Readonly<{
  label: string
  message: Message
  style: string
}>

// STYLE

const baseButtonStyle =
  'aspect-square rounded-full text-4xl font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
const numberButtonStyle = `${baseButtonStyle} bg-zinc-800 text-white hover:bg-zinc-700`
const operationButtonStyle = `${baseButtonStyle} bg-orange-500 text-white hover:bg-orange-400`
const utilityButtonStyle = `${baseButtonStyle} bg-zinc-500 text-white hover:bg-zinc-400`

const digitButton = (digit: Digit): CalculatorButton => ({
  label: digitText(digit),
  message: PressedDigit({ digit }),
  style: numberButtonStyle,
})

const operationButton = (
  label: string,
  operation: Operation,
): CalculatorButton => ({
  label,
  message: PressedOperation({ operation }),
  style: operationButtonStyle,
})

const buttons: ReadonlyArray<CalculatorButton> = [
  {
    label: '⌫',
    message: PressedBackspace(),
    style: utilityButtonStyle,
  },
  {
    label: 'AC',
    message: PressedClear(),
    style: utilityButtonStyle,
  },
  {
    label: '%',
    message: PressedPercent(),
    style: utilityButtonStyle,
  },
  operationButton('÷', 'Divide'),
  digitButton('Seven'),
  digitButton('Eight'),
  digitButton('Nine'),
  operationButton('×', 'Multiply'),
  digitButton('Four'),
  digitButton('Five'),
  digitButton('Six'),
  operationButton('−', 'Subtract'),
  digitButton('One'),
  digitButton('Two'),
  digitButton('Three'),
  operationButton('+', 'Add'),
  {
    label: '+/-',
    message: PressedSign(),
    style: numberButtonStyle,
  },
  digitButton('Zero'),
  {
    label: '.',
    message: PressedDecimalSeparator(),
    style: numberButtonStyle,
  },
  {
    label: '=',
    message: PressedEquals(),
    style: operationButtonStyle,
  },
]

/** Renders the Calculator with Foldkit HTML. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const expression = expressionForModel(model)

  return {
    title: `Calculator: ${displayForModel(model)}`,
    body: h.main(
      [
        h.Class(
          'min-h-screen bg-black text-white flex items-center justify-center p-6',
        ),
      ],
      [
        h.section(
          [h.Class('w-full max-w-sm bg-black p-3')],
          [
            h.div(
              [
                h.Class(
                  'mb-6 flex min-h-56 flex-col items-end justify-end text-right',
                ),
              ],
              [
                h.p(
                  [
                    h.Class(
                      'mb-3 h-8 text-3xl font-medium text-zinc-500 tabular-nums',
                    ),
                  ],
                  [expression],
                ),
                h.div(
                  [
                    h.Class(
                      'max-w-full overflow-hidden text-7xl font-light leading-none tracking-tight tabular-nums',
                    ),
                  ],
                  [displayForModel(model)],
                ),
              ],
            ),
            h.div(
              [h.Class('grid grid-cols-4 gap-3')],
              buttons.map(button =>
                Button.view<Message>({
                  onClick: button.message,
                  toView: attributes =>
                    h.button(
                      [
                        ...attributes.button,
                        h.Key(button.label),
                        h.Class(button.style),
                      ],
                      [button.label],
                    ),
                }),
              ),
            ),
          ],
        ),
      ],
    ),
  }
}
