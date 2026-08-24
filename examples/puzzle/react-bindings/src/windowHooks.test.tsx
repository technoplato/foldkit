import { Processor, Runtime } from 'foldkit'
import {
  GuessedYes,
  Path,
  demoModel,
  describePuzzleSyncError,
  emptyModel,
  hangingSyncedEngine,
  startSyncedPuzzleHandle,
  update,
  uriOf,
  waitForSyncedHandle,
} from 'puzzle-core-example'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { cleanup, renderHook, waitFor } from '@testing-library/react'

import {
  installSyncedPuzzleHandle,
  resetSyncedPuzzleHandle,
  useActionMenuKeys,
  useActions,
  useModel,
} from './windowHooks.js'

const [afterYes] = update(emptyModel(), GuessedYes())

afterEach(() => {
  resetSyncedPuzzleHandle()
  cleanup()
})

describe('Puzzle synced hooks', () => {
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
    expect(result.current.actions).toHaveProperty('yesButtonTapped')
    const reset = result.current.actions.resetButtonTapped
    expect(reset._tag).toBe('Tappable')
    if (reset._tag === 'Tappable') {
      reset.tap()
    }
    await waitFor(() => {
      expect(result.current.view).toEqual({
        _tag: 'Ready',
        product: emptyModel(),
        actionMenu: { _tag: 'Closed' },
      })
    })
    result.current.actions.yesButtonTapped()
    await waitFor(() => {
      expect(result.current.view).toEqual({
        _tag: 'Ready',
        product: afterYes,
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
        product: demoModel(),
        actionMenu: { _tag: 'Closed' },
      })
    })
    const tappable = result.current.actions.resetButtonTapped
    expect(tappable._tag).toBe('Tappable')

    if (tappable._tag === 'Tappable') {
      tappable.tap()
    }
    await waitFor(() => {
      expect(result.current.actions.resetButtonTapped._tag).toBe('Hidden')
    })
    const hidden = result.current.actions.resetButtonTapped
    if (hidden._tag === 'Hidden') {
      expect(hidden.because).toBe('tape is already empty')
    }

    result.current.actions.yesButtonTapped()
    await waitFor(() => {
      expect(result.current.actions.resetButtonTapped._tag).toBe('Tappable')
    })
  })

  it('selects a field from the synced Model', async () => {
    const { result } = renderHook(() =>
      useModel(Path(), model =>
        model._tag === 'Ready' ? uriOf(model.product) : undefined,
      ),
    )
    await waitFor(() => {
      expect(result.current).toBe(uriOf(demoModel()))
    })
  })

  it('shows Failed when Instant subscribe never settles', async () => {
    const handle = startSyncedPuzzleHandle(
      hangingSyncedEngine(Processor.Host.React()),
      { settleMs: 50 },
    )
    installSyncedPuzzleHandle(handle)
    await waitForSyncedHandle(handle, 1000)
    const { result } = renderHook(() => useModel(Path()))
    await waitFor(() => {
      expect(result.current._tag).toBe('Failed')
    })
    if (result.current._tag === 'Failed') {
      const text = describePuzzleSyncError(result.current.error)
      expect(text).toContain('This Processor never became Ready.')
      expect(text).toContain('start did not settle')
      expect(text).not.toContain('TransportFailed')
    }
    await handle.stop()
  })

  it('shows Failed when Instant boot read fails', async () => {
    const engine = Runtime.Memory({ processor: Processor.Host.React() })
    engine.failNextRead('Instant is down.')
    const handle = startSyncedPuzzleHandle(engine)
    installSyncedPuzzleHandle(handle)
    await waitForSyncedHandle(handle)
    const { result } = renderHook(() => useModel(Path()))
    await waitFor(() => {
      expect(result.current._tag).toBe('Failed')
    })
    if (result.current._tag === 'Failed') {
      const text = describePuzzleSyncError(result.current.error)
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
