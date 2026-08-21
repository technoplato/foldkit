import { Program } from 'foldkit'
import { Text } from 'foldkit/renderers'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanup, renderHook, waitFor } from '@testing-library/react'

import {
  type ProgramHandle,
  bindProgram,
  resetBoundPrograms,
} from '../programHandle/index.js'
import { useActions, useModel } from './hooks.js'

type CountModel = Readonly<{ count: number }>
type Increment = Readonly<{ _tag: 'Increment' }>
type CountActions = Readonly<{
  incrementButtonTapped: () => void
}>

declare module '../programHandle/programHandle.js' {
  interface BoundPrograms {
    readonly Fake: {
      readonly model: CountModel
      readonly message: Increment
      readonly actions: CountActions
    }
  }
}

const FakePath = (): { readonly _tag: 'Fake' } => ({ _tag: 'Fake' })

const createFakeHandle = (): ProgramHandle<CountModel, Increment> & {
  sent: Array<Increment>
} => {
  const listeners = new Set<() => void>()
  let count = 0
  let snapshot: Program.SyncedModel<CountModel, Increment> = {
    _tag: 'Ready',
    count,
  }
  const sent: Array<Increment> = []
  return {
    sent,
    readModel: () => snapshot,
    send: message => {
      sent.push(message)
      count += 1
      snapshot = { _tag: 'Ready', count }
      for (const listener of listeners) {
        listener()
      }
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
  resetBoundPrograms()
  cleanup()
})

describe('useModel and useActions', () => {
  it('returns the full synced Model', async () => {
    const handle = createFakeHandle()
    bindProgram(FakePath(), {
      createHandle: () => handle,
      toActions: (_synced, send) => ({
        incrementButtonTapped: () => {
          send({ _tag: 'Increment' })
        },
      }),
      toScreen: () => Text('0'),
    })
    const { result } = renderHook(() => useModel(FakePath()))
    await waitFor(() => {
      expect(result.current).toEqual({ _tag: 'Ready', count: 0 })
    })
  })

  it('selects a field from the synced Model', async () => {
    const handle = createFakeHandle()
    bindProgram(FakePath(), {
      createHandle: () => handle,
      toActions: (_synced, send) => ({
        incrementButtonTapped: () => {
          send({ _tag: 'Increment' })
        },
      }),
      toScreen: () => Text('0'),
    })
    const { result } = renderHook(() =>
      useModel(FakePath(), model =>
        model._tag === 'Ready' ? model.count : undefined,
      ),
    )
    await waitFor(() => {
      expect(result.current).toBe(0)
    })
    handle.send({ _tag: 'Increment' })
    await waitFor(() => {
      expect(result.current).toBe(1)
    })
  })

  it('returns incrementButtonTapped from useActions', async () => {
    const handle = createFakeHandle()
    bindProgram(FakePath(), {
      createHandle: () => handle,
      toActions: (_synced, send) => ({
        incrementButtonTapped: () => {
          send({ _tag: 'Increment' })
        },
      }),
      toScreen: () => Text('0'),
    })
    const { result } = renderHook(() => {
      const view = useModel(FakePath())
      const actions = useActions(FakePath())
      return { actions, view }
    })
    await waitFor(() => {
      expect(result.current.view).toEqual({ _tag: 'Ready', count: 0 })
    })
    expect(result.current.actions).toHaveProperty('incrementButtonTapped')
    result.current.actions.incrementButtonTapped()
    await waitFor(() => {
      expect(result.current.view).toEqual({ _tag: 'Ready', count: 1 })
    })
    expect(handle.sent).toEqual([{ _tag: 'Increment' }])
  })
})
