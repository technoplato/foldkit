import { type Model, MultipleCountersProgram } from 'counters-core-example'
import {
  type CountersWindowTape,
  startCountersWindowRuntime,
} from 'counters-instant-example'
import { afterEach, describe, expect, it } from 'vitest'

import {
  installCountersWindowRuntime,
  useActions,
  useModel,
} from './processor.js'

const [initialModel] = MultipleCountersProgram.init()

const missingAppIdError =
  'VITE_INSTANT_APP_ID is missing. Start through the Instant demo wrapper.'

const waitForSnapshot = async (
  runtime: ReturnType<typeof startCountersWindowRuntime>,
  uri: string,
  tag: 'StartingWindow' | 'FailedWindow' | 'ReadyWindow',
) => {
  const current = useModel(uri)
  if (current._tag === tag) {
    return current
  }
  return new Promise<ReturnType<typeof useModel>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop()
      reject(new Error(`Timed out waiting for ${tag}`))
    }, 1000)
    const stop = runtime.subscribe(() => {
      const next = useModel(uri)
      if (next._tag === tag) {
        clearTimeout(timeout)
        stop()
        resolve(next)
      }
    })
  })
}

const waitForReadyCount = async (
  runtime: ReturnType<typeof startCountersWindowRuntime>,
  uri: string,
  count: number,
) => {
  const current = useModel(uri)
  if (current._tag === 'ReadyWindow' && current.count === count) {
    return current
  }
  return new Promise<ReturnType<typeof useModel>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop()
      reject(new Error(`Timed out waiting for count ${String(count)}`))
    }, 1000)
    const stop = runtime.subscribe(() => {
      const next = useModel(uri)
      if (next._tag === 'ReadyWindow' && next.count === count) {
        clearTimeout(timeout)
        stop()
        resolve(next)
      }
    })
  })
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

let windowRuntime: ReturnType<typeof startCountersWindowRuntime> | undefined

afterEach(() => {
  windowRuntime?.stop()
  windowRuntime = undefined
})

describe('Multiple Counters Svelte processor', () => {
  it('draws FailedWindow from useModel when Instant sign-in fails', async () => {
    windowRuntime = startCountersWindowRuntime({
      openTape: () => Promise.reject(new Error(missingAppIdError)),
      signIn: () =>
        Promise.resolve({
          _tag: 'FailedCountersSession',
          error: missingAppIdError,
        }),
    })
    installCountersWindowRuntime(windowRuntime)

    const snapshot = await waitForSnapshot(
      windowRuntime,
      '/counters',
      'FailedWindow',
    )
    expect(snapshot).toEqual({
      _tag: 'FailedWindow',
      error: missingAppIdError,
    })
    expect(useActions('/counters')).not.toHaveProperty('send')
    expect(useActions('/counters')).toHaveProperty('signIn')
  })

  it('draws Starting then Ready from useModel and increments without send', async () => {
    let finishSignIn: (
      session:
        | { readonly _tag: 'SignedInCountersSession'; readonly userId: string }
        | { readonly _tag: 'FailedCountersSession'; readonly error: string },
    ) => void = () => undefined
    windowRuntime = startCountersWindowRuntime({
      openTape: () => Promise.resolve(memoryTape()),
      signIn: () =>
        new Promise(resolve => {
          finishSignIn = resolve
        }),
    })
    installCountersWindowRuntime(windowRuntime)

    expect(useModel('/counters')._tag).toBe('StartingWindow')
    expect(useActions('/counters')).not.toHaveProperty('send')

    finishSignIn({
      _tag: 'SignedInCountersSession',
      userId: 'user-1',
    })

    const ready = await waitForSnapshot(
      windowRuntime,
      '/counters/counter-1',
      'ReadyWindow',
    )
    expect(ready._tag).toBe('ReadyWindow')
    if (ready._tag === 'ReadyWindow') {
      expect(ready.count).toBe(0)
      expect(ready.selectedId).toBe('counter-1')
    }

    useActions('/counters/counter-1').increment()
    const incremented = await waitForReadyCount(
      windowRuntime,
      '/counters/counter-1',
      1,
    )
    expect(incremented._tag).toBe('ReadyWindow')
    if (incremented._tag === 'ReadyWindow') {
      expect(incremented.count).toBe(1)
    }
  })
})
