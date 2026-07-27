import { Match as M, Schema as S } from 'effect'
import { type Network } from 'wallet-core-example'

/** A network capability implemented by this Node adapter. */
export const SupportedCapability = S.TaggedStruct('SupportedCapability', {})
/** A network capability intentionally excluded from this Node adapter. */
export const UnsupportedCapability = S.TaggedStruct('UnsupportedCapability', {
  reason: S.Literals(['SolanaTestnetIsNotSolanaDevnet']),
})

/** Whether this adapter implements the requested network. */
export const NetworkCapability = S.Union([
  SupportedCapability,
  UnsupportedCapability,
])
/** Whether this adapter implements the requested network. */
export type NetworkCapability = typeof NetworkCapability.Type

/** Reports support without substituting Solana Testnet for Solana Devnet. */
export const capabilityForNetwork = (network: Network): NetworkCapability =>
  M.value(network).pipe(
    M.withReturnType<NetworkCapability>(),
    M.tagsExhaustive({
      EthereumSepolia: () => SupportedCapability.make({}),
      SolanaDevnet: () => SupportedCapability.make({}),
      SolanaTestnet: () =>
        UnsupportedCapability.make({
          reason: 'SolanaTestnetIsNotSolanaDevnet',
        }),
    }),
  )
