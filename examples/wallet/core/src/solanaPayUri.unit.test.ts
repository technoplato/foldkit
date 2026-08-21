import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  parseSolanaPayTransferUri,
  printSolanaPayTransferUri,
} from './solanaPayUri.js'

const recipient = 'C5DLCjAX2UGrVDvoz8M4TYBCWSyUL9451GzG62SfQuih'

describe('Solana Pay transfer URI', () => {
  test('prints a native SOL transfer the wallet can paste', () => {
    expect(
      printSolanaPayTransferUri({
        recipient,
        amount: '0.001',
        label: 'the clip',
        cluster: 'devnet',
      }),
    ).toBe(`solana:${recipient}?amount=0.001&label=the%20clip&cluster=devnet`)
  })

  test('round-trips recipient, amount, and label', () => {
    const uri = printSolanaPayTransferUri({
      recipient,
      amount: '0.001',
      label: 'the clip',
      cluster: 'devnet',
    })
    const parsed = parseSolanaPayTransferUri(uri)
    expect(Option.isSome(parsed)).toBe(true)
    if (Option.isSome(parsed)) {
      expect(parsed.value.recipient).toBe(recipient)
      expect(parsed.value.maybeAmount).toEqual(Option.some('0.001'))
      expect(parsed.value.maybeLabel).toEqual(Option.some('the clip'))
      expect(parsed.value.maybeCluster).toEqual(Option.some('devnet'))
    }
  })

  test('accepts a pasted URI with surrounding whitespace', () => {
    const parsed = parseSolanaPayTransferUri(
      `  solana:${recipient}?amount=0.001  `,
    )
    expect(Option.isSome(parsed)).toBe(true)
    if (Option.isSome(parsed)) {
      expect(parsed.value.recipient).toBe(recipient)
      expect(parsed.value.maybeAmount).toEqual(Option.some('0.001'))
    }
  })

  test('accepts solana:// recipient form', () => {
    const parsed = parseSolanaPayTransferUri(
      `solana://${recipient}?amount=0.001`,
    )
    expect(Option.isSome(parsed)).toBe(true)
    if (Option.isSome(parsed)) {
      expect(parsed.value.recipient).toBe(recipient)
    }
  })

  test('accepts a recipient-only URI', () => {
    const parsed = parseSolanaPayTransferUri(`solana:${recipient}`)
    expect(Option.isSome(parsed)).toBe(true)
    if (Option.isSome(parsed)) {
      expect(parsed.value.recipient).toBe(recipient)
      expect(Option.isNone(parsed.value.maybeAmount)).toBe(true)
    }
  })

  test('rejects a raw address, another scheme, or an SPL token transfer', () => {
    expect(Option.isNone(parseSolanaPayTransferUri(recipient))).toBe(true)
    expect(
      Option.isNone(parseSolanaPayTransferUri(`ethereum:${recipient}`)),
    ).toBe(true)
    expect(
      Option.isNone(
        parseSolanaPayTransferUri(
          `solana:${recipient}?amount=1&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`,
        ),
      ),
    ).toBe(true)
  })
})
