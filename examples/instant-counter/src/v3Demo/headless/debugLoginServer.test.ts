import { describe, expect, it } from 'vitest'

import {
  handleMultipleCountersV3DebugLoginRequest,
  multipleCountersV3DebugLoginHost,
} from './debugLoginServer.js'

const auth = (code = '135790') => {
  const calls: Array<string> = []
  return {
    calls,
    createToken: async (input: { email: string }) => {
      calls.push(`createToken:${input.email}`)
    },
    generateMagicCode: async (email: string) => {
      calls.push(`generateMagicCode:${email}`)
      return { code }
    },
  }
}

describe('Multiple Counters v3 debug login server', () => {
  it('mints a magic code for Alice after ensuring the Instant subject exists', async () => {
    const debugAuth = auth()
    const response = await handleMultipleCountersV3DebugLoginRequest(
      debugAuth,
      'POST',
      '/magic-code',
      { email: 'alice@fake.com' },
    )

    expect(response).toEqual({
      body: {
        code: '135790',
        email: 'alice@fake.com',
        label: 'Alice',
      },
      status: 200,
    })
    expect(debugAuth.calls).toEqual([
      'createToken:alice@fake.com',
      'generateMagicCode:alice@fake.com',
    ])
  })

  it('rejects unknown emails before touching Instant', async () => {
    const debugAuth = auth()
    const response = await handleMultipleCountersV3DebugLoginRequest(
      debugAuth,
      'POST',
      '/magic-code',
      { email: 'eve@example.com' },
    )

    expect(response.status).toBe(400)
    expect(debugAuth.calls).toEqual([])
  })

  it('rejects non-POST magic-code routes', async () => {
    const debugAuth = auth()
    const missing = await handleMultipleCountersV3DebugLoginRequest(
      debugAuth,
      'GET',
      '/magic-code',
      { email: 'bob@fake.com' },
    )
    const unknown = await handleMultipleCountersV3DebugLoginRequest(
      debugAuth,
      'POST',
      '/token',
      { email: 'bob@fake.com' },
    )

    expect(missing.status).toBe(405)
    expect(unknown.status).toBe(404)
    expect(debugAuth.calls).toEqual([])
  })

  it('returns a sanitized failure when Instant cannot mint a code', async () => {
    const response = await handleMultipleCountersV3DebugLoginRequest(
      {
        createToken: async () => undefined,
        generateMagicCode: async () => {
          throw new Error('admin token leaked: secret-token')
        },
      },
      'POST',
      '/magic-code',
      { email: 'bob@fake.com' },
    )

    expect(response.status).toBe(503)
    expect(JSON.stringify(response.body)).not.toContain('secret-token')
  })

  it('answers CORS preflight without touching Instant', async () => {
    const debugAuth = auth()
    const response = await handleMultipleCountersV3DebugLoginRequest(
      debugAuth,
      'OPTIONS',
      '/magic-code',
      {},
    )

    expect(response.status).toBe(204)
    expect(debugAuth.calls).toEqual([])
  })
})

describe('Multiple Counters v3 debug login bind address', () => {
  it('stays on loopback unless the operator names a LAN host', () => {
    expect(multipleCountersV3DebugLoginHost({})).toBe('127.0.0.1')
    expect(
      multipleCountersV3DebugLoginHost({
        FOLDKIT_INSTANT_DEBUG_LOGIN_HOST: '0.0.0.0',
      }),
    ).toBe('0.0.0.0')
  })
})
