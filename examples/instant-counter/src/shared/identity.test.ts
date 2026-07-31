import { describe, expect, it } from 'vitest'

import {
  deriveSessionId,
  deriveSessionIdWithDigest,
  isProcessorRoomId,
  processorRoomIdPrefix,
} from './identity.js'

describe('deriveSessionId', () => {
  it('selects the same non-secret Program session on every Client for one subject', async () => {
    const first = await deriveSessionId('subject-1')
    const second = await deriveSessionId('subject-1')

    expect(first).toBe(second)
    expect(first).toMatch(/^instant-counter:v1:[0-9a-f]{64}$/)
    expect(first).not.toContain('subject-1')
  })

  it('keeps different authenticated subjects in different Program sessions', async () => {
    const first = await deriveSessionId('subject-1')
    const second = await deriveSessionId('subject-2')

    expect(first).not.toBe(second)
  })

  it('accepts a platform-owned lowercase SHA-256 implementation', async () => {
    const digest = 'a'.repeat(64)

    await expect(
      deriveSessionIdWithDigest('subject-1', async () => digest),
    ).resolves.toBe(`instant-counter:v1:${digest}`)
    await expect(
      deriveSessionIdWithDigest('subject-1', async () => digest.toUpperCase()),
    ).rejects.toThrow('lowercase SHA-256')
  })

  it('recognizes only versioned room identifiers minted from random UUIDs', () => {
    expect(
      isProcessorRoomId(
        `${processorRoomIdPrefix}8f4a82d4-1cf4-4fd6-a42a-773e822e41bf`,
      ),
    ).toBe(true)
    expect(
      isProcessorRoomId(
        'instant-counter:v1:room:8f4a82d4-1cf4-3fd6-a42a-773e822e41bf',
      ),
    ).toBe(false)
    expect(
      isProcessorRoomId(
        'instant-counter:v2:room:8f4a82d4-1cf4-4fd6-a42a-773e822e41bf',
      ),
    ).toBe(false)
  })
})
