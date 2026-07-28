import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { CurrencyValue, Eth, EthereumSepolia } from './currency.js'
import { initialModel } from './model.js'
import {
  currencyValueLabel,
  primaryWalletBalance,
  shortenedAddress,
} from './presentation.js'

describe('Wallet presentation', () => {
  it('formats exact atomic values without floating-point conversion', () => {
    expect(
      currencyValueLabel(
        CurrencyValue.make({
          atomicUnits: '5100000000000000000',
          currency: Eth.make({ network: EthereumSepolia.make({}) }),
          decimalPlaces: 18,
          observedAt: 0,
        }),
      ),
    ).toBe('5.1 ETH')
  })

  it('shortens public addresses and has no primary balance before loading', () => {
    expect(shortenedAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(
      '0x12345678…345678',
    )
    expect(Option.isNone(primaryWalletBalance(initialModel))).toBe(true)
  })
})
