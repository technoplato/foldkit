import { type Model, MultipleCountersProgram } from 'counters-core-example'
import { describe, expect, it } from 'vitest'

import { incrementCounterMessage } from './hostActions.js'
import {
  type CountersWindowTape,
  startCountersWindowRuntime,
} from './window.js'

const [initialModel] = MultipleCountersProgram.init()

const waitForSnapshot = async (
  runtime: ReturnType<typeof startCountersWindowRuntime>,
  uri: string,
  tag: 'StartingWindow' | 'FailedWindow' | 'ReadyWindow',
) => {
  const current = runtime.getSnapshot(uri)
  if (current._tag === tag) {
    return current
  }
  return new Promise<ReturnType<typeof runtime.getSnapshot>>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        stop()
        reject(new Error(`Timed out waiting for ${tag}`))
      }, 1000)
      const stop = runtime.subscribe(() => {
        const next = runtime.getSnapshot(uri)
        if (next._tag === tag) {
          clearTimeout(timeout)
          stop()
          resolve(next)
        }
      })
    },
  )
}

const waitForReadyCount = async (
  runtime: ReturnType<typeof startCountersWindowRuntime>,
  uri: string,
  count: number,
) => {
  const current = runtime.getSnapshot(uri)
  if (current._tag === 'ReadyWindow' && current.count === count) {
    return current
  }
  return new Promise<ReturnType<typeof runtime.getSnapshot>>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        stop()
        reject(new Error(`Timed out waiting for count ${String(count)}`))
      }, 1000)
      const stop = runtime.subscribe(() => {
        const next = runtime.getSnapshot(uri)
        if (next._tag === 'ReadyWindow' && next.count === count) {
          clearTimeout(timeout)
          stop()
          resolve(next)
        }
      })
    },
  )
}

const memoryTape = (start: Model = initialModel): CountersWindowTape => {
  let model = start
  const listeners = new Set<(next: Model) => void>()
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

describe('Counters window runtime', () => {
  it('projects counter.count for a counter URI after sign-in', async () => {
    const tape = memoryTape()
    tape.send(incrementCounterMessage('counter-1'))
    const runtime = startCountersWindowRuntime({
      openTape: () => Promise.resolve(tape),
      signIn: () =>
        Promise.resolve({
          _tag: 'SignedInCountersSession',
          userId: 'user-1',
        }),
    })
    const snapshot = await waitForSnapshot(
      runtime,
      '/counters/counter-1',
      'ReadyWindow',
    )
    expect(snapshot._tag).toBe('ReadyWindow')
    if (snapshot._tag === 'ReadyWindow') {
      expect(snapshot.count).toBe(1)
      expect(snapshot.selectedId).toBe('counter-1')
    }
    runtime.stop()
  })

  it('increments through actions without exposing send', async () => {
    const runtime = startCountersWindowRuntime({
      openTape: () => Promise.resolve(memoryTape()),
      signIn: () =>
        Promise.resolve({
          _tag: 'SignedInCountersSession',
          userId: 'user-1',
        }),
    })
    await waitForSnapshot(runtime, '/counters/counter-1', 'ReadyWindow')
    runtime.actions('/counters/counter-1').increment()
    const snapshot = await waitForReadyCount(runtime, '/counters/counter-1', 1)
    expect(snapshot._tag).toBe('ReadyWindow')
    if (snapshot._tag === 'ReadyWindow') {
      expect(snapshot.count).toBe(1)
    }
    expect(runtime).not.toHaveProperty('send')
    runtime.stop()
  })

  it('surfaces failed sign-in instead of hanging on Starting', async () => {
    const runtime = startCountersWindowRuntime({
      openTape: () => Promise.reject(new Error('tape must not open')),
      signIn: () =>
        Promise.resolve({
          _tag: 'FailedCountersSession',
          error: 'Sign-in failed. Instant has no session.',
        }),
    })
    const snapshot = await waitForSnapshot(runtime, '/counters', 'FailedWindow')
    expect(snapshot).toEqual({
      _tag: 'FailedWindow',
      error: 'Sign-in failed. Instant has no session.',
    })
    runtime.stop()
  })

  it('surfaces a failed Instant write as FailedWindow', async () => {
    const tape: CountersWindowTape = {
      ...memoryTape(),
      send: () => Promise.reject(new Error('write failed')),
    }
    const runtime = startCountersWindowRuntime({
      openTape: () => Promise.resolve(tape),
      signIn: () =>
        Promise.resolve({
          _tag: 'SignedInCountersSession',
          userId: 'user-1',
        }),
    })
    await waitForSnapshot(runtime, '/counters/counter-1', 'ReadyWindow')
    runtime.actions('/counters/counter-1').increment()
    const snapshot = await waitForSnapshot(
      runtime,
      '/counters/counter-1',
      'FailedWindow',
    )
    expect(snapshot).toEqual({
      _tag: 'FailedWindow',
      error: 'Instant could not write the Message.',
    })
    runtime.stop()
  })

  it('unsubscribes listeners', async () => {
    const runtime = startCountersWindowRuntime({
      openTape: () => Promise.resolve(memoryTape()),
      signIn: () =>
        Promise.resolve({
          _tag: 'SignedInCountersSession',
          userId: 'user-1',
        }),
    })
    await waitForSnapshot(runtime, '/counters', 'ReadyWindow')
    let notifications = 0
    const stop = runtime.subscribe(() => {
      notifications += 1
    })
    stop()
    runtime.actions('/counters/counter-1').increment()
    expect(notifications).toBe(0)
    runtime.stop()
  })
})
