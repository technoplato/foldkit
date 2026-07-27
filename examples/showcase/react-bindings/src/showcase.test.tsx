import * as Program from 'foldkit/program'
import { type ReactNode, StrictMode } from 'react'
import { CounterScene, modelForNavigation } from 'showcase-core-example'
import { describe, expect, it } from 'vitest'

import { act, renderHook } from '@testing-library/react'

import {
  ShowcaseProvider,
  useShowcaseActions,
  useShowcaseModel,
  useShowcaseReplay,
} from './showcase.js'

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <StrictMode>
    <ShowcaseProvider>{children}</ShowcaseProvider>
  </StrictMode>
)

describe('showcase React bindings', () => {
  it('replays navigation and branches through domain actions', () => {
    const { result } = renderHook(
      () => ({
        actions: useShowcaseActions(),
        model: useShowcaseModel(),
        replay: useShowcaseReplay(),
      }),
      { wrapper },
    )

    expect(result.current.model.navigation._tag).toBe('HomeScene')

    act(() => {
      result.current.actions.tappedCounterButton()
    })
    expect(result.current.model.navigation._tag).toBe('CounterScene')
    expect(result.current.replay.finalFrame).toBe(1)

    act(() => {
      result.current.replay.seek(0)
    })
    expect(result.current.model.navigation._tag).toBe('HomeScene')
    expect(result.current.replay.mode).toBe('Inspecting')

    act(() => {
      result.current.actions.tappedCalculatorButton()
    })
    expect(result.current.model.navigation._tag).toBe('CalculatorScene')
    expect(result.current.replay.mode).toBe('Live')
  })

  it('starts from a portable Program route supplied by the host', () => {
    const counterRoute = Program.state(
      modelForNavigation(CounterScene.make({})),
    )
    const counterWrapper = ({
      children,
    }: Readonly<{ children: ReactNode }>) => (
      <ShowcaseProvider initialRoute={counterRoute}>
        {children}
      </ShowcaseProvider>
    )
    const { result } = renderHook(() => useShowcaseModel(), {
      wrapper: counterWrapper,
    })

    expect(result.current.navigation._tag).toBe('CounterScene')
  })
})
