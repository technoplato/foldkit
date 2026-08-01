import { describe, expect, it } from 'vitest'

import { stopMultipleCountersV3BrowserAppOnPageHide } from './pageLifecycle.js'

describe('Multiple Counters v3 browser page lifecycle', () => {
  it('keeps bfcache state alive and stops a true page teardown', async () => {
    let stopCount = 0
    const app = {
      stop: () => {
        stopCount += 1
        return Promise.resolve()
      },
    }

    stopMultipleCountersV3BrowserAppOnPageHide(app, { persisted: true })
    await Promise.resolve()
    expect(stopCount).toBe(0)

    stopMultipleCountersV3BrowserAppOnPageHide(app, { persisted: false })
    await Promise.resolve()
    expect(stopCount).toBe(1)
  })
})
