import { Effect, Option } from 'effect'
import { Processor } from 'foldkit'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { InstantEngine } from './instantEngine.js'
import { Increment, OpenedNavigation } from './message.js'
import { Model } from './model.js'
import {
  MemoryLive,
  makeMemorySnapshotLogTransport,
  startLiveCounter,
} from './startLive.js'
import { waitForSyncedHandle } from './startSynced.js'
import { navigationOfReady } from './synced.js'

describe('startLiveCounter', () => {
  it('reaches Ready on the Memory Instant Layer', async () => {
    const handle = startLiveCounter(MemoryLive(Processor.Host.Cli()))
    const ready = await waitForSyncedHandle(handle)
    expect(ready).toEqual({
      _tag: 'Ready',
      product: Model.make({ count: 0 }),
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
      product: Model.make({ count: 1 }),
      actionMenu: { _tag: 'Closed' },
    })
    handle.stop()
  })

  it('shares occupancy across two Memory Processors', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    const writer = startLiveCounter(Processor.Host.Cli(), {
      transport: snapshot,
    })
    await waitForSyncedHandle(writer)
    writer.send(OpenedNavigation({ device: 'phone' }))
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        const model = writer.readModel()
        if (
          model._tag === 'Ready' &&
          Option.isSome(model.product.maybeDevice) &&
          model.product.maybeDevice.value === 'phone'
        ) {
          clearTimeout(timeout)
          stop()
          resolve()
        }
      }
      const timeout = setTimeout(() => {
        stop()
        reject(new Error('Timed out waiting for phone occupancy.'))
      }, 2000)
      const stop = writer.subscribe(finish)
      finish()
    })
    await writer.stop()

    const reader = startLiveCounter(Processor.Host.Tui(), {
      transport: snapshot,
    })
    const ready = await waitForSyncedHandle(reader)
    expect(navigationOfReady(ready)).toEqual({ device: 'phone' })
    await reader.stop()
  })

  it('shares home occupancy from OpenedNavigation path counter', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    const writer = startLiveCounter(Processor.Host.Cli(), {
      transport: snapshot,
    })
    await waitForSyncedHandle(writer)
    writer.send(OpenedNavigation({ device: 'phone', path: 'counter' }))
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        const model = writer.readModel()
        if (
          model._tag === 'Ready' &&
          Option.isSome(model.product.maybeDevice) &&
          model.product.maybeDevice.value === 'phone' &&
          Option.isSome(model.product.maybePath) &&
          model.product.maybePath.value === 'counter'
        ) {
          clearTimeout(timeout)
          stop()
          resolve()
        }
      }
      const timeout = setTimeout(() => {
        stop()
        reject(new Error('Timed out waiting for home occupancy.'))
      }, 2000)
      const stop = writer.subscribe(finish)
      finish()
    })
    await writer.stop()

    const reader = startLiveCounter(Processor.Host.Tui(), {
      transport: snapshot,
    })
    const ready = await waitForSyncedHandle(reader)
    expect(navigationOfReady(ready)).toEqual({
      device: 'phone',
      path: 'counter',
    })
    await reader.stop()
  })

  it('shares kitchen occupancy across two Memory Processors', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    const writer = startLiveCounter(Processor.Host.Cli(), {
      transport: snapshot,
    })
    await waitForSyncedHandle(writer)
    writer.send(OpenedNavigation({ path: 'kitchen' }))
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        const model = writer.readModel()
        if (
          model._tag === 'Ready' &&
          Option.isSome(model.product.maybePath) &&
          model.product.maybePath.value === 'kitchen'
        ) {
          clearTimeout(timeout)
          stop()
          resolve()
        }
      }
      const timeout = setTimeout(() => {
        stop()
        reject(new Error('Timed out waiting for kitchen occupancy.'))
      }, 2000)
      const stop = writer.subscribe(finish)
      finish()
    })
    await writer.stop()

    const reader = startLiveCounter(Processor.Host.Tui(), {
      transport: snapshot,
    })
    const ready = await waitForSyncedHandle(reader)
    expect(navigationOfReady(ready)).toEqual({ path: 'kitchen' })
    await reader.stop()
  })

  it('forwards instance into Node Instant resolve', () => {
    const source = readFileSync(
      new URL('./startLive.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain(
      "options?.instance ?? process.env['COUNTER_INSTANT_ROOM']",
    )
    expect(source).toContain('resolveInstantSyncEngine')
    expect(source).toContain('countId: activeCountId()')
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
