import {
  FailedCounterSession,
  memoryCounterTape,
  startCounterWindowRuntime,
} from 'counter-core-example'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanup, renderHook, waitFor } from '@testing-library/react'

import {
  installCounterWindowRuntime,
  resetCounterWindowRuntime,
  useActions,
  useModel,
} from './windowHooks.js'

afterEach(() => {
  resetCounterWindowRuntime()
  cleanup()
})

describe('Counter window hooks', () => {
  it('exposes useModel(uri) and useActions(uri) without store.send', async () => {
    const { result } = renderHook(() => {
      const view = useModel('/counter')
      const actions = useActions('/counter')
      return { actions, view }
    })
    await waitFor(() => {
      expect(result.current.view._tag).toBe('ReadyWindow')
    })
    expect(result.current.actions).not.toHaveProperty('send')
    expect(result.current.actions).not.toHaveProperty('observe')
    expect(result.current.actions).toHaveProperty('clickedIncrement')
    result.current.actions.clickedIncrement()
    await waitFor(() => {
      expect(result.current.view).toEqual({ _tag: 'ReadyWindow', count: 1 })
    })
  })

  it('shows failed sign-in as a FailedWindow snapshot', async () => {
    const runtime = startCounterWindowRuntime({
      openTape: () => Promise.resolve(memoryCounterTape()),
      signIn: () =>
        Promise.resolve(
          FailedCounterSession.make({
            error: 'Sign-in failed. Instant has no session.',
          }),
        ),
    })
    installCounterWindowRuntime(runtime)
    const { result } = renderHook(() => useModel('/counter'))
    await waitFor(() => {
      expect(result.current).toEqual({
        _tag: 'FailedWindow',
        error: 'Sign-in failed. Instant has no session.',
      })
    })
  })
})
