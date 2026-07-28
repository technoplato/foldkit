import { describe, expect, it } from 'vitest'

import { makeWalletTestChallenge } from './signingChallenge.js'

describe('makeWalletTestChallenge', () => {
  it('creates a chain-neutral domain-separated digest', () => {
    const challenge = makeWalletTestChallenge('challenge-1', 'account-1')

    expect(challenge.accountId).toBe('account-1')
    expect(challenge.digest.domain).toBe('foldkit.example.wallet')
    expect(challenge.digest.encoding).toBe('hex')
  })
})
