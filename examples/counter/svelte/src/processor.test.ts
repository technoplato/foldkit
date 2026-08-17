import {
  type CounterWindowModel,
  startCounterWindowRuntime,
  startMemoryCounterWindow,
} from 'counter-core-example'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { startInstantCounterWindow } from './instantHost.js'
import {
  installCounterWindowRuntime,
  useActions,
  useModel,
} from './processor.js'

const waitForSnapshot = async (
  runtime: ReturnType<typeof startCounterWindowRuntime>,
  match: (snapshot: CounterWindowModel) => boolean,
): Promise<CounterWindowModel> => {
  const current = useModel('/counter')
  if (match(current)) {
    return current
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stop()
      reject(new Error('Timed out waiting for the Counter window.'))
    }, 1000)
    const stop = runtime.subscribe(() => {
      const next = useModel('/counter')
      if (match(next)) {
        clearTimeout(timeout)
        stop()
        resolve(next)
      }
    })
  })
}

let windowRuntime: ReturnType<typeof startCounterWindowRuntime> | undefined

afterEach(() => {
  windowRuntime?.stop()
  windowRuntime = undefined
})

describe('Counter Svelte processor', () => {
  it('keeps Instant out of the Svelte window', () => {
    const viewSource = readFileSync('src/App.svelte', 'utf8')
    expect(viewSource).toContain('useModel')
    expect(viewSource).toContain('useActions')
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('instantHost')
    expect(viewSource).not.toContain('store.send')
  })

  it('installs the Instant window runtime from the host', () => {
    const hostSource = readFileSync('src/instantHost.ts', 'utf8')
    const entrySource = readFileSync('src/main.ts', 'utf8')
    expect(hostSource).toContain('installCounterWindowRuntime')
    expect(hostSource).toContain('counterProcessorIds.svelte')
    expect(hostSource).toContain('openLiveCounterWindowTape')
    expect(entrySource).toContain('startInstantCounterWindow')
    expect(entrySource).toContain('VITE_INSTANT_APP_ID')
    expect(startInstantCounterWindow).toEqual(expect.any(Function))
  })

  it('draws Ready from useModel and adds one without send', async () => {
    windowRuntime = startMemoryCounterWindow()
    installCounterWindowRuntime(windowRuntime)

    const ready = await waitForSnapshot(
      windowRuntime,
      snapshot => snapshot._tag === 'ReadyWindow' && snapshot.count === 0,
    )
    expect(ready).toEqual({
      _tag: 'ReadyWindow',
      count: 0,
    })

    useActions('/counter').clickedIncrement()
    const next = await waitForSnapshot(
      windowRuntime,
      snapshot => snapshot._tag === 'ReadyWindow' && snapshot.count === 1,
    )
    expect(next).toEqual({
      _tag: 'ReadyWindow',
      count: 1,
    })
  })
})
