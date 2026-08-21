import { afterEach, describe, expect, it } from 'vitest'

import { subscribeHostPaint } from './hostPaint.js'

describe('subscribeHostPaint', () => {
  const originalRaf = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
    globalThis.cancelAnimationFrame = originalCancel
  })

  it('paints once when three notifies land before the frame', () => {
    const listeners = new Set<() => void>()
    const subscribe = (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
    let paints = 0
    let flush: () => void = () => {}
    globalThis.requestAnimationFrame = ((
      callback: FrameRequestCallback,
    ): number => {
      flush = () => {
        callback(0)
      }
      return 1
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame

    subscribeHostPaint(subscribe, () => {
      paints += 1
    })
    for (const listener of listeners) {
      listener()
      listener()
      listener()
    }
    expect(paints).toBe(0)
    flush()
    expect(paints).toBe(1)
  })

  it('paints immediately when requestAnimationFrame is missing', () => {
    const listeners = new Set<() => void>()
    const subscribe = (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
    let paints = 0
    Reflect.deleteProperty(globalThis, 'requestAnimationFrame')

    subscribeHostPaint(subscribe, () => {
      paints += 1
    })
    for (const listener of listeners) {
      listener()
      listener()
    }
    expect(paints).toBe(2)
  })
})
