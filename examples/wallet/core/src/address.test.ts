import { describe, expect, it } from 'vitest'

import {
  invalidNetworkAddressMessage,
  networkAddressRuleMessages,
  validateNetworkAddress,
} from './address.js'
import { EthereumSepolia, SolanaDevnet } from './currency.js'

describe('Wallet network address validation', () => {
  it('validates Ethereum and Solana addresses against their own networks', () => {
    expect(
      validateNetworkAddress(
        EthereumSepolia.make({}),
        '0x2222222222222222222222222222222222222222',
      ),
    ).toMatchObject({
      _tag: 'ValidNetworkAddress',
      address: { _tag: 'EthereumNetworkAddress' },
    })
    expect(
      validateNetworkAddress(
        SolanaDevnet.make({}),
        '11111111111111111111111111111111',
      ),
    ).toMatchObject({
      _tag: 'ValidNetworkAddress',
      address: { _tag: 'SolanaNetworkAddress' },
    })
  })

  it('returns printable structured guidance for the selected network', () => {
    const validation = validateNetworkAddress(
      EthereumSepolia.make({}),
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    )
    if (validation._tag !== 'InvalidNetworkAddress') {
      throw new Error('Expected the 32-byte value to fail address validation')
    }

    expect(invalidNetworkAddressMessage(validation)).toBe(
      'That is not a valid address for Ethereum Sepolia. Valid addresses for Ethereum Sepolia look like 0x1234567890abcdef1234567890abcdef12345678 and follow the following rules.',
    )
    expect(networkAddressRuleMessages(validation.format)).toStrictEqual([
      'It starts with 0x.',
      'It uses only hexadecimal characters: 0-9 and A-F.',
      'It contains exactly 40 characters after the prefix.',
      'It represents exactly 20 bytes.',
    ])
  })

  it('does not accept an address from the other chain', () => {
    expect(
      validateNetworkAddress(
        SolanaDevnet.make({}),
        '0x2222222222222222222222222222222222222222',
      )._tag,
    ).toBe('InvalidNetworkAddress')
    expect(
      validateNetworkAddress(
        EthereumSepolia.make({}),
        '11111111111111111111111111111111',
      )._tag,
    ).toBe('InvalidNetworkAddress')
  })
})
