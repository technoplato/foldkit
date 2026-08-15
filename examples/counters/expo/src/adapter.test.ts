import { MultipleCountersProgram } from 'counters-core-example'
import {
  type CountersWindowTape,
  startCountersWindowRuntime,
} from 'counters-instant-example/native'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanup, renderHook, waitFor } from '@testing-library/react'

import {
  installCountersWindowRuntime,
  useActions,
  useModel,
} from './windowHooks'

const [initialModel] = MultipleCountersProgram.init()

const memoryTape = (): CountersWindowTape => {
  let model = initialModel
  const listeners = new Set<(next: typeof initialModel) => void>()
  return {
    readModel: () => model,
    send: message => {
      const [next] = MultipleCountersProgram.update(model, message)
      model = next
      listeners.forEach(listener => {
        listener(model)
      })
    },
    stop: () => {
      listeners.clear()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

afterEach(() => {
  cleanup()
})

describe('Counters Expo adapter', () => {
  it('exposes useModel(uri) and useActions(uri) without store.send', async () => {
    const runtime = startCountersWindowRuntime({
      openTape: () => Promise.resolve(memoryTape()),
      signIn: () =>
        Promise.resolve({
          _tag: 'SignedInCountersSession',
          userId: 'user-1',
        }),
    })
    installCountersWindowRuntime(runtime)
    const { result } = renderHook(() => {
      const view = useModel('/counters/counter-1')
      const actions = useActions('/counters/counter-1')
      return { actions, view }
    })
    await waitFor(() => {
      expect(result.current.view._tag).toBe('ReadyWindow')
    })
    expect(result.current.actions).not.toHaveProperty('send')
    expect(result.current.actions).toHaveProperty('increment')
    result.current.actions.increment()
    await waitFor(() => {
      expect(result.current.view._tag).toBe('ReadyWindow')
      if (result.current.view._tag === 'ReadyWindow') {
        expect(result.current.view.count).toBe(1)
      }
    })
    runtime.stop()
  })

  it('shows failed sign-in as a FailedWindow snapshot', async () => {
    const runtime = startCountersWindowRuntime({
      openTape: () => Promise.reject(new Error('tape must not open')),
      signIn: () =>
        Promise.resolve({
          _tag: 'FailedCountersSession',
          error: 'Sign-in failed. Instant has no session.',
        }),
    })
    installCountersWindowRuntime(runtime)
    const { result } = renderHook(() => useModel('/counters'))
    await waitFor(() => {
      expect(result.current).toEqual({
        _tag: 'FailedWindow',
        error: 'Sign-in failed. Instant has no session.',
      })
    })
    runtime.stop()
  })
})
