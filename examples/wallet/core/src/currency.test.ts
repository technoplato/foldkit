import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  NetworkDescriptor,
  convertDisplayAmountToAtomicUnits,
  displayAmountFromAtomicUnits,
} from './currency.js'

describe('exact asset display amounts', () => {
  it('decodes legacy networks with an explicit unavailable funding method', () => {
    const network = S.decodeUnknownSync(NetworkDescriptor)({
      networkId: 'bitcoin:mainnet',
      chainId: 'bitcoin',
      displayName: 'Bitcoin Mainnet',
      environment: 'Mainnet',
      capabilities: ['Transfer'],
    })

    expect(network.testFundingMethod._tag).toBe('UnavailableTestFundingMethod')
  })

  it('converts display amounts without floating-point rounding', () => {
    expect(convertDisplayAmountToAtomicUnits('1.000001', 6)).toStrictEqual({
      _tag: 'ConvertedAssetDisplayAmount',
      atomicUnits: '1000001',
    })
    expect(displayAmountFromAtomicUnits('1000001', 6)).toBe('1.000001')
  })

  it('rejects imprecise, non-canonical, and non-positive amounts', () => {
    expect(convertDisplayAmountToAtomicUnits('0.0000001', 6)).toMatchObject({
      code: 'TooManyDecimalPlaces',
    })
    expect(convertDisplayAmountToAtomicUnits('1e3', 6)).toMatchObject({
      code: 'InvalidFormat',
    })
    expect(convertDisplayAmountToAtomicUnits('0', 6)).toMatchObject({
      code: 'MustBePositive',
    })
  })
})
