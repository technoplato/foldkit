import {
  NumberToken,
  OperationToken,
  PressedBackspace,
  PressedClear,
  PressedDecimalSeparator,
  PressedDigit,
  PressedEquals,
  PressedOperation,
  PressedPercent,
  PressedSign,
  ShowingResult,
} from 'calculator-core-example'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { messageForInput, renderCalculatorScreen } from './host.js'

describe('Calculator TUI', () => {
  it('renders the imported Model and every interactive control group', () => {
    const screen = renderCalculatorScreen(
      ShowingResult({
        expression: [
          NumberToken({ input: '7' }),
          OperationToken({ operation: 'Multiply' }),
          NumberToken({ input: '6' }),
        ],
        maybeLastResult: Option.some('42'),
        rawResult: '42',
      }),
    )

    expect(screen).toContain('42')
    expect(screen).toContain('7×6')
    expect(screen).toContain('[0-9] digits')
    expect(screen).toContain('[=] equals')
    expect(screen).toContain('[AC/C] clear')
    expect(screen).toContain('[Q] quit')
  })

  it('maps controls to the imported Message constructors', () => {
    expect(messageForInput('7')).toEqual(
      Option.some(PressedDigit({ digit: 'Seven' })),
    )
    expect(messageForInput('+')).toEqual(
      Option.some(PressedOperation({ operation: 'Add' })),
    )
    expect(messageForInput('x')).toEqual(
      Option.some(PressedOperation({ operation: 'Multiply' })),
    )
    expect(messageForInput('.')).toEqual(Option.some(PressedDecimalSeparator()))
    expect(messageForInput('%')).toEqual(Option.some(PressedPercent()))
    expect(messageForInput('+/-')).toEqual(Option.some(PressedSign()))
    expect(messageForInput('delete')).toEqual(Option.some(PressedBackspace()))
    expect(messageForInput('=')).toEqual(Option.some(PressedEquals()))
    expect(messageForInput('C')).toEqual(Option.some(PressedClear()))
    expect(messageForInput('q')).toEqual(Option.none())
  })
})
