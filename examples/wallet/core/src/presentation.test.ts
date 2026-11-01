import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  CopiedToClipboard,
  FailedClipboardCopy,
  clipboardCopyRequestForAddress,
} from './clipboard.js'
import { AssetAmount, AssetDescriptor, NativeAsset } from './currency.js'
import { NetworkFailure, SigningFailure, TransferGuidance } from './model.js'
import {
  assetAmountLabel,
  clipboardCopyFailureMessage,
  clipboardCopyLabel,
  shortenedAddress,
  walletDataSourceDetail,
  walletDataSourceLabel,
  walletFailureLines,
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

  describe('a failed send on screen', () => {
    const networkFailure = (
      operation: typeof NetworkFailure.Type.operation,
      code: typeof NetworkFailure.Type.code,
    ) => NetworkFailure.make({ operation, code })

    it('says a stale preview sent nothing, and what to do', () => {
      expect(
        walletFailureLines(networkFailure('BuildTransferPayload', 'Rejected')),
      ).toEqual([
        'This preview can no longer be sent. Nothing was sent. Preview the send again.',
      ])
    })

    it('says a send the network refused was not sent', () => {
      expect(
        walletFailureLines(networkFailure('SubmitTransaction', 'Rejected')),
      ).toEqual(['The network refused this send. Nothing was sent.'])
    })

    it('never says nothing was sent when the network went quiet mid-send', () => {
      expect(
        walletFailureLines(networkFailure('SubmitTransaction', 'Unavailable')),
      ).toEqual([
        'The network did not answer, so this send may still land. Check your activity before you send it again.',
      ])
    })

    it('says a wallet that could not sign sent nothing', () => {
      expect(
        walletFailureLines(
          SigningFailure.make({
            operation: 'SignTransaction',
            code: 'Unavailable',
          }),
        ),
      ).toEqual(['This wallet could not sign. Nothing was sent.'])
    })

    it('says why a preview was refused', () => {
      expect(
        walletFailureLines(networkFailure('PreviewTransfer', 'Rejected')),
      ).toEqual([
        'This send cannot go through: check the amount against your balance and the fee. Nothing was sent.',
      ])
      expect(
        walletFailureLines(networkFailure('PreviewTransfer', 'Unavailable')),
      ).toEqual([
        'The network did not answer with a fee. Nothing was sent. Try the preview again.',
      ])
    })

    it('keeps the guidance beside the words', () => {
      expect(
        walletFailureLines(
          NetworkFailure.make({
            operation: 'SubmitTransaction',
            code: 'Rejected',
            maybeGuidance: Option.some(
              TransferGuidance.make({
                summary: 'This amount is too small.',
                details: ['A new account needs more.'],
              }),
            ),
          }),
        ),
      ).toEqual([
        'The network refused this send. Nothing was sent.',
        'This amount is too small.',
        '- A new account needs more.',
      ])
    })

    it('never prints an internal code on screen', () => {
      expect(
        walletFailureLines(networkFailure('ValidateTransfer', 'Unavailable')),
      ).toEqual([
        'This recipient could not be checked. Nothing was sent. Try again.',
      ])
    })
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
