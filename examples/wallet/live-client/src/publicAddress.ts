import { Option } from 'effect'
import { isAddress as isEthereumAddress, isHash } from 'viem'

import { isSignature, isAddress as isSolanaAddress } from '@solana/kit'

// PUBLIC ADDRESS

/**
 * True when this text is a public address on this chain: 32 bytes in
 * base58 on Solana, and on Ethereum 20 bytes in hex whose mixed case, if
 * any, passes its checksum. A base58 key pair is 64 bytes, and a hex key
 * is 32, so neither passes.
 *
 * @example
 * ```typescript
 * isPublicAddressOn('solana', 'So11111111111111111111111111111111111111112') // true
 * isPublicAddressOn('ethereum', `0x${'a'.repeat(64)}`) // false
 * ```
 */
export const isPublicAddressOn = (
  chainId: 'solana' | 'ethereum',
  address: string,
): boolean =>
  chainId === 'solana'
    ? isSolanaAddress(address)
    : isEthereumAddress(address, { strict: true })

// NOTE: @solana/kit's isSignature throws on text that is not base58, where
// its isAddress answers false.
const isSolanaSignature = (text: string): boolean =>
  Option.getOrElse(Option.liftThrowable(isSignature)(text), () => false)

/**
 * True when this text is a transaction's public id on this chain: a 64-byte
 * signature in base58 on Solana, a 32-byte hash in hex on Ethereum.
 *
 * @example
 * ```typescript
 * isTransactionIdOn('ethereum', `0x${'a'.repeat(64)}`) // true
 * isTransactionIdOn('solana', 'not-a-signature') // false
 * ```
 */
export const isTransactionIdOn = (
  chainId: 'solana' | 'ethereum',
  transactionId: string,
): boolean =>
  chainId === 'solana'
    ? isSolanaSignature(transactionId)
    : isHash(transactionId)
