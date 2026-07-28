import { describe, expect, it } from 'vitest'

import { isValidDemoRecipientAddress } from './server.js'

describe('Wallet testnet recipient policy', () => {
  it('accepts Ethereum recipients and rejects 32-byte non-address values', () => {
    expect(
      isValidDemoRecipientAddress('0x2222222222222222222222222222222222222222'),
    ).toBe(true)
    expect(
      isValidDemoRecipientAddress(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ),
    ).toBe(false)
  })
})
