import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import { runMemoryBurst, runMemoryCrossSurfaceBurst } from './stress.js'

describe('Counter Instant burst', () => {
  it('settles 200 Increments on a second Processor with one enqueue each', async () => {
    const result = await runMemoryBurst(200)
    expect(result.writerCount).toBe(200)
    expect(result.readerCount).toBe(200)
    expect(result.messageEvents).toBe(200)
    expect(result.elapsedMs).toBeLessThan(5_000)
  })

  it('settles 200 Increments on every Host including Expo iOS and Android', async () => {
    const result = await runMemoryCrossSurfaceBurst(200)
    expect(result.writerCount).toBe(200)
    expect(result.n).toBe(200)
    const hosts = Array.map(result.readers, reader => reader.host)
    expect(hosts).toContain('expo-ios')
    expect(hosts).toContain('expo-android')
    expect(hosts).toContain('react')
    expect(hosts).toContain('svelte')
    for (const reader of result.readers) {
      expect(reader.count).toBe(200)
    }
    expect(result.elapsedMs).toBeLessThan(5_000)
  })
})
