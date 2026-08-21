import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  CopiedToClipboard,
  FailedClipboardCopy,
  clipboardCopyRequestForAddress,
} from './clipboard.js'
import { AssetAmount, AssetDescriptor, NativeAsset } from './currency.js'
import { NetworkFailure, TransferGuidance } from './model.js'
import {
  assetAmountLabel,
  clipboardCopyFailureMessage,
  clipboardCopyLabel,
  shortenedAddress,
  walletDataSourceDetail,
  walletDataSourceLabel,
  walletFailureMessage,
} from './presentation.js'

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

  it('labels adapter-backed live portfolio provenance', () => {
    expect(walletDataSourceLabel('Live')).toBe('Live network data')
    expect(walletDataSourceDetail('Live')).toContain(
      'persisted Wallet accounts',
    )
  })

  it('labels and explains the matching address copy flow', () => {
    const request = clipboardCopyRequestForAddress('account-address')
    const copied = CopiedToClipboard.make({ request })
    const denied = FailedClipboardCopy.make({ request, code: 'Denied' })

    expect(clipboardCopyLabel(copied, request)).toBe('Copied')
    expect(clipboardCopyLabel(denied, request)).toBe('Try copy again')
    expect(
      Option.getOrThrow(clipboardCopyFailureMessage(denied, request)),
    ).toContain('denied')
  })

  it('prints adapter guidance with a rejected network failure', () => {
    const failure = NetworkFailure.make({
      operation: 'SubmitTransaction',
      code: 'Rejected',
      maybeGuidance: Option.some(
        TransferGuidance.make({
          summary:
            'This amount is too small to create the destination account.',
          details: [
            'A new Solana account needs at least 890880 lamports to stay rent-exempt.',
          ],
        }),
      ),
    })

    expect(walletFailureMessage(failure)).toContain(
      'SubmitTransaction/Rejected',
    )
    expect(walletFailureMessage(failure)).toContain(
      'This amount is too small to create the destination account.',
    )
    expect(walletFailureMessage(failure)).toContain('890880 lamports')
  })
})
