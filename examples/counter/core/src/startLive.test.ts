import { Processor } from 'foldkit'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { InstantEngine } from './instantEngine.js'
import { Increment } from './message.js'
import { MemoryLive, startLiveCounter } from './startLive.js'
import { waitForSyncedHandle } from './startSynced.js'

describe('startLiveCounter', () => {
  it('reaches Ready on the Memory Instant Layer', async () => {
    const handle = startLiveCounter(MemoryLive(Processor.Host.Cli()))
    const ready = await waitForSyncedHandle(handle)
    expect(ready).toEqual({
      _tag: 'Ready',
      product: { count: 0 },
      actionMenu: { _tag: 'Closed' },
    })
    handle.send(Increment())
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        const model = handle.readModel()
        if (model._tag === 'Ready' && model.product.count === 1) {
          clearTimeout(timeout)
          stop()
          resolve()
        }
      }
      const timeout = setTimeout(() => {
        stop()
        reject(new Error('Timed out waiting for count 1.'))
      }, 2000)
      const stop = handle.subscribe(finish)
      finish()
    })
    expect(handle.readModel()).toEqual({
      _tag: 'Ready',
      product: { count: 1 },
      actionMenu: { _tag: 'Closed' },
    })
    handle.stop()
  })

  it('forwards instance into Node Instant resolve', () => {
    const source = readFileSync(
      new URL('./startLive.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('instance: options.instance')
    expect(source).toContain('resolveInstantSyncEngine')
  })

  it('names InstantEngine as a Context.Service', () => {
    expect(InstantEngine.key).toBe('Counter/InstantEngine')
  })

  it('exports startLiveCounter and Layers from the core barrel', async () => {
    const barrel = await import('./index.js')
    expect(barrel.startLiveCounter).toEqual(expect.any(Function))
    expect(barrel.MemoryLive).toEqual(expect.any(Function))
    expect(barrel.NodeLive).toEqual(expect.any(Function))
    expect(barrel.BrowserLive).toEqual(expect.any(Function))
    expect(barrel.InstantEngine).toBe(InstantEngine)
    expect(barrel.isMemoryTape).toEqual(expect.any(Function))
  })
})
