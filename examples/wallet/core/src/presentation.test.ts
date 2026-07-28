import { describe, expect, it } from 'vitest'

import { AssetAmount, AssetDescriptor, NativeAsset } from './currency.js'
import { assetAmountLabel, shortenedAddress } from './presentation.js'

describe('wallet presentation', () => {
  it('renders normalized asset amounts from descriptors', () => {
    const asset = AssetDescriptor.make({
      assetId: 'solana:devnet:sol',
      networkId: 'solana:devnet',
      displayName: 'Devnet SOL',
      symbol: 'SOL',
      decimalPlaces: 9,
      kind: NativeAsset.make({}),
    })
    const amount = AssetAmount.make({
      assetId: asset.assetId,
      atomicUnits: '1250000000',
      observedAt: 1,
    })

    expect(assetAmountLabel(amount, asset)).toBe('1.25 SOL')
  })

  it('shortens long public addresses', () => {
    expect(shortenedAddress('1234567890abcdefghijklmnopqrstuvwxyz')).toBe(
      '1234567890…uvwxyz',
    )
  })
})
