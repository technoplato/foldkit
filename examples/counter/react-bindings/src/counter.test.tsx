import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook } from '@testing-library/react'

import { CounterProvider, useCounterActions, useCounterModel } from './index.js'

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <CounterProvider>{children}</CounterProvider>
  </StrictMode>
)

describe('Counter React bindings', () => {
  it('observes the shared Counter Model and exposes stable actions', () => {
    const { result } = renderHook(
      () => ({
        actions: useCounterActions(),
        model: useCounterModel(),
      }),
      { wrapper },
    )

    const actions = result.current.actions
    expect(result.current.model).toEqual({ count: 0 })

    act(() => {
      result.current.actions.clickedIncrement()
    })
    expect(result.current.model).toEqual({ count: 1 })
    expect(result.current.actions).toBe(actions)

    act(() => {
      result.current.actions.clickedDecrement()
    })
    expect(result.current.model).toEqual({ count: 0 })

    act(() => {
      result.current.actions.clickedReset()
    })
    expect(result.current.model).toEqual({ count: 0 })
  })
})
