import { Array, Schema as S } from 'effect'
import {
  type NetworkDescriptor,
  type WalletCapability,
} from 'wallet-core-example'

/** The configured adapter advertises the requested capability. */
export const SupportedCapability = S.TaggedStruct('SupportedCapability', {})

/** The configured adapter does not advertise the requested capability. */
export const UnsupportedCapability = S.TaggedStruct('UnsupportedCapability', {
  capability: S.String,
})

/** Whether a normalized network advertises one generic Wallet capability. */
export const NetworkCapability = S.Union([
  SupportedCapability,
  UnsupportedCapability,
])
/** Whether a normalized network advertises one generic Wallet capability. */
export type NetworkCapability = typeof NetworkCapability.Type

/** Evaluates a generic capability without branching on a chain tag. */
export const capabilityForNetwork = (
  network: NetworkDescriptor,
  capability: WalletCapability,
): NetworkCapability =>
  Array.contains(network.capabilities, capability)
    ? SupportedCapability.make({})
    : UnsupportedCapability.make({ capability })
