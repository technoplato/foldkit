import { isAddress as isEthereumAddress } from 'viem'

import { isAddress as isSolanaAddress } from '@solana/kit'

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
