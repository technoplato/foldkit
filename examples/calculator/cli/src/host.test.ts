import {
  PressedBackspace,
  PressedDecimalSeparator,
  PressedDigit,
  PressedEquals,
  PressedOperation,
  PressedPercent,
  PressedSign,
  displayForModel,
  initialModel,
} from 'calculator-core-example'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeCalculatorInput } from './host.js'

describe('Calculator CLI host', () => {
  it('shows the imported initial Model without Messages', async () => {
    const execution = await Effect.runPromise(executeCalculatorInput([]))

    expect(execution.initialModel).toEqual(initialModel)
    expect(execution.messages).toEqual([])
    expect(execution.finalModel).toBe(execution.initialModel)
  })

  it('runs button tokens as imported Message constructors', async () => {
    const execution = await Effect.runPromise(
      executeCalculatorInput(['7', 'x', '6', '=']),
    )

    expect(execution.messages).toEqual([
      PressedDigit({ digit: 'Seven' }),
      PressedOperation({ operation: 'Multiply' }),
      PressedDigit({ digit: 'Six' }),
      PressedEquals(),
    ])
    expect(displayForModel(execution.finalModel)).toBe('42')
  })

  it('supports the full calculator button set', async () => {
    const execution = await Effect.runPromise(
      executeCalculatorInput(['5', '.', '5', '%', '+/-', 'backspace']),
    )

    expect(execution.messages).toEqual([
      PressedDigit({ digit: 'Five' }),
      PressedDecimalSeparator(),
      PressedDigit({ digit: 'Five' }),
      PressedPercent(),
      PressedSign(),
      PressedBackspace(),
    ])
    expect(displayForModel(execution.finalModel)).toBe('-0.05')
  })
})
