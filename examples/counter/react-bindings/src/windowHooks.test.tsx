import {
  Path,
  describeCounterSyncError,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from 'counter-core-example'
import { Processor, Runtime } from 'foldkit'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { cleanup, renderHook, waitFor } from '@testing-library/react'

import {
  installSyncedCounterHandle,
  resetSyncedCounterHandle,
  useActionMenuKeys,
  useActions,
  useModel,
} from './windowHooks.js'

afterEach(() => {
  resetSyncedCounterHandle()
  cleanup()
})

describe('Counter synced hooks', () => {
  it('exposes useModel(Path()) and useActions(Path()) without store.send', async () => {
    const { result } = renderHook(() => {
      const view = useModel(Path())
      const actions = useActions(Path())
      return { actions, view }
    })
    await waitFor(() => {
      expect(result.current.view._tag).toBe('Ready')
    })
    expect(result.current.actions).not.toHaveProperty('send')
    expect(result.current.actions).not.toHaveProperty('observe')
    expect(result.current.actions).not.toHaveProperty('signIn')
    expect(result.current.actions).toHaveProperty('incrementButtonTapped')
    result.current.actions.incrementButtonTapped()
    await waitFor(() => {
      expect(result.current.view).toEqual({
        _tag: 'Ready',
        product: { count: 1 },
        actionMenu: { _tag: 'Closed' },
      })
    })
  })

  it('flips resetButtonTapped between Hidden and Tappable with the Model', async () => {
    const { result } = renderHook(() => {
      const view = useModel(Path())
      const actions = useActions(Path())
      return { actions, view }
    })
    await waitFor(() => {
      expect(result.current.view).toEqual({
        _tag: 'Ready',
        product: { count: 0 },
        actionMenu: { _tag: 'Closed' },
      })
    })
    const hidden = result.current.actions.resetButtonTapped
    expect(hidden._tag).toBe('Hidden')
    if (hidden._tag === 'Hidden') {
      expect(hidden.because).toBe('count is already 0')
    }

    result.current.actions.incrementButtonTapped()
    await waitFor(() => {
      expect(result.current.actions.resetButtonTapped._tag).toBe('Tappable')
    })

    const tappable = result.current.actions.resetButtonTapped
    if (tappable._tag === 'Tappable') {
      tappable.tap()
    }
    await waitFor(() => {
      expect(result.current.view).toEqual({
        _tag: 'Ready',
        product: { count: 0 },
        actionMenu: { _tag: 'Closed' },
      })
      expect(result.current.actions.resetButtonTapped._tag).toBe('Hidden')
    })
  })

  it('selects a field from the synced Model', async () => {
    const { result } = renderHook(() =>
      useModel(Path(), model =>
        model._tag === 'Ready' ? model.product.count : undefined,
      ),
    )
    await waitFor(() => {
      expect(result.current).toBe(0)
    })
  })

  it('shows Failed when Instant boot read fails', async () => {
    const engine = Runtime.Memory({ processor: Processor.Host.React() })
    engine.failNextRead('Instant is down.')
    const handle = startSyncedCounterHandle(engine)
    installSyncedCounterHandle(handle)
    await waitForSyncedHandle(handle)
    const { result } = renderHook(() => useModel(Path()))
    await waitFor(() => {
      expect(result.current._tag).toBe('Failed')
    })
    if (result.current._tag === 'Failed') {
      const text = describeCounterSyncError(result.current.error)
      expect(text).toContain('Instant is down.')
      expect(text).not.toContain('TransportFailed')
    }
    expect(result.current).not.toHaveProperty('signIn')
  })

  it('does not attach window keydown on React Native', () => {
    const add = vi.spyOn(window, 'addEventListener')
    Object.defineProperty(navigator, 'product', {
      configurable: true,
      value: 'ReactNative',
    })
    renderHook(() => {
      useActionMenuKeys()
    })
    expect(add).not.toHaveBeenCalledWith('keydown', expect.any(Function))
    add.mockRestore()
    Object.defineProperty(navigator, 'product', {
      configurable: true,
      value: 'Gecko',
    })
  })
})
