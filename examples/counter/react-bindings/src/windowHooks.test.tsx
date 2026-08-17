import {
  Path,
  describeCounterSyncError,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from 'counter-core-example'
import { Processor, Runtime } from 'foldkit'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanup, renderHook, waitFor } from '@testing-library/react'

import {
  installSyncedCounterHandle,
  resetSyncedCounterHandle,
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
    expect(result.current.actions).toHaveProperty('clickedIncrement')
    result.current.actions.clickedIncrement()
    await waitFor(() => {
      expect(result.current.view).toEqual({ _tag: 'Ready', count: 1 })
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
})
