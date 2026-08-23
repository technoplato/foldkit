import { type ReactNode, StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { act, renderHook } from '@testing-library/react'

import { PuzzleProvider, usePuzzleActions, usePuzzleModel } from './index.js'

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <PuzzleProvider>{children}</PuzzleProvider>
  </StrictMode>
)

describe('Puzzle React bindings', () => {
  it('observes the shared Puzzle Model and exposes stable actions', () => {
    const { result } = renderHook(
      () => ({
        actions: usePuzzleActions(),
        model: usePuzzleModel(),
      }),
      { wrapper },
    )

    const actions = result.current.actions
    expect(result.current.model.prompt._tag).toBe('ReplicateStep')

    act(() => {
      result.current.actions.clickedResetTape()
    })
    expect(result.current.model.tape).toEqual([])
    expect(result.current.model.prompt._tag).toBe('LabelStep')
    expect(result.current.actions).toBe(actions)

    act(() => {
      result.current.actions.clickedGuessedYes()
    })
    expect(result.current.model.tape).toHaveLength(1)

    act(() => {
      result.current.actions.clickedGuessedNo()
    })
    expect(result.current.model.tape).toHaveLength(2)

    act(() => {
      result.current.actions.clickedResetTape()
    })
    expect(result.current.model.tape).toEqual([])
  })
})
