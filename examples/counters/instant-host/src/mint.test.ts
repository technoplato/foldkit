import { describe, expect, it } from 'vitest'

import { CountersDemoMintError, mintCountersDemoSession } from './mint.js'

describe('mintCountersDemoSession', () => {
  it('mints the shared Counters demo email', async () => {
    const session = await mintCountersDemoSession({
      auth: {
        createToken: async input => {
          expect(input.email).toBe('counter@foldkit.dev')
          return 'demo-token'
        },
      },
    })
    expect(session).toEqual({
      email: 'counter@foldkit.dev',
      token: 'demo-token',
    })
  })

  it('fails when Instant returns an empty token', async () => {
    await expect(
      mintCountersDemoSession({
        auth: {
          createToken: async () => '',
        },
      }),
    ).rejects.toBeInstanceOf(CountersDemoMintError)
  })
})
