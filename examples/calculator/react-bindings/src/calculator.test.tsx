import {
  displayForModel,
  expressionForModel,
  initialModel,
} from 'calculator-core-example'
import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook } from '@testing-library/react'

import {
  CalculatorProvider,
  useCalculatorActions,
  useCalculatorModel,
} from './index.js'

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <CalculatorProvider>{children}</CalculatorProvider>
  </StrictMode>
)

describe('Calculator React bindings', () => {
  it('observes the shared Calculator Model and exposes stable actions', () => {
    const { result } = renderHook(
      () => ({
        actions: useCalculatorActions(),
        model: useCalculatorModel(),
      }),
      { wrapper },
    )

    const actions = result.current.actions
    expect(result.current.model).toEqual(initialModel)

    act(() => {
      result.current.actions.pressedDigit('Seven')
      result.current.actions.pressedOperation('Multiply')
      result.current.actions.pressedDigit('Six')
      result.current.actions.pressedEquals()
    })
    expect(displayForModel(result.current.model)).toBe('42')
    expect(expressionForModel(result.current.model)).toBe('7×6')
    expect(result.current.actions).toBe(actions)

    act(() => {
      result.current.actions.pressedBackspace()
      result.current.actions.pressedClear()
    })
    expect(result.current.model).toEqual(initialModel)
  })
})
