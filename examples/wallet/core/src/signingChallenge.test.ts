import { describe, expect, it } from 'vitest'

import { makeWalletTestChallenge } from './signingChallenge.js'

describe('Wallet test challenge', () => {
  it('uses one deterministic 32-byte Keccak digest for every host', () => {
    const challenge = makeWalletTestChallenge('challenge', 'account')

    expect(challenge.digest).toStrictEqual({
      algorithm: 'Keccak256',
      domain: 'foldkit.example.wallet',
      digestHex:
        '0x434a8d65ff6dedb682353c0b64080d079094c7bc538c6bf29c5049c4dca72e22',
    })
    expect(challenge.digest.digestHex).toMatch(/^0x[0-9a-f]{64}$/u)
  })
})
