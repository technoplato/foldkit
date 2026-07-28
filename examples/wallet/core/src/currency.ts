import { Array, Option, Schema as S } from 'effect'

/** A stable identifier for one blockchain family. */
export const ChainId = S.String
/** A stable identifier for one blockchain family. */
export type ChainId = typeof ChainId.Type

/** A stable identifier for one configured blockchain network. */
export const NetworkId = S.String
/** A stable identifier for one configured blockchain network. */
export type NetworkId = typeof NetworkId.Type

/** A stable identifier for one asset on one configured network. */
export const AssetId = S.String
/** A stable identifier for one asset on one configured network. */
export type AssetId = typeof AssetId.Type

/** A portable public description of one blockchain family. */
export const ChainDescriptor = S.Struct({
  chainId: ChainId,
  displayName: S.String,
})
/** A portable public description of one blockchain family. */
export type ChainDescriptor = typeof ChainDescriptor.Type

/** The deployment environment represented by one configured network. */
export const NetworkEnvironment = S.Literals([
  'Mainnet',
  'Testnet',
  'Development',
  'Local',
])
/** The deployment environment represented by one configured network. */
export type NetworkEnvironment = typeof NetworkEnvironment.Type

/** A chain-agnostic Wallet capability advertised by an adapter. */
export const WalletCapability = S.Literals([
  'Transfer',
  'TransactionHistory',
  'TransactionObservation',
  'ChallengeSignature',
])
/** A chain-agnostic Wallet capability advertised by an adapter. */
export type WalletCapability = typeof WalletCapability.Type

/** A normalized public description of one configured network. */
export const NetworkDescriptor = S.Struct({
  networkId: NetworkId,
  chainId: ChainId,
  displayName: S.String,
  environment: NetworkEnvironment,
  capabilities: S.Array(WalletCapability),
})
/** A normalized public description of one configured network. */
export type NetworkDescriptor = typeof NetworkDescriptor.Type

/** A native asset issued by its network. */
export const NativeAsset = S.TaggedStruct('NativeAsset', {})
/** An issued asset identified by an adapter-owned reference. */
export const IssuedAsset = S.TaggedStruct('IssuedAsset', {
  reference: S.String,
})
/** How an asset is represented on its configured network. */
export const AssetKind = S.Union([NativeAsset, IssuedAsset])
/** How an asset is represented on its configured network. */
export type AssetKind = typeof AssetKind.Type

/** The number of decimal places used to render an exact asset amount. */
export const AssetDecimalPlaces = S.Literals([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29, 30,
])
/** The number of decimal places used to render an exact asset amount. */
export type AssetDecimalPlaces = typeof AssetDecimalPlaces.Type

/** A normalized public description of one asset on one network. */
export const AssetDescriptor = S.Struct({
  assetId: AssetId,
  networkId: NetworkId,
  displayName: S.String,
  symbol: S.String,
  decimalPlaces: AssetDecimalPlaces,
  kind: AssetKind,
})
/** A normalized public description of one asset on one network. */
export type AssetDescriptor = typeof AssetDescriptor.Type

/** An exact signed integer encoded in portable decimal notation. */
export const AtomicUnits = S.TemplateLiteral([S.BigInt])
/** An exact signed integer encoded in portable decimal notation. */
export type AtomicUnits = typeof AtomicUnits.Type

/** An exact quantity that refers to one normalized asset. */
export const AssetAmount = S.Struct({
  assetId: AssetId,
  atomicUnits: AtomicUnits,
  observedAt: S.Number,
})
/** An exact quantity that refers to one normalized asset. */
export type AssetAmount = typeof AssetAmount.Type

/** Finds one normalized chain descriptor by its stable identifier. */
export const chainForId = (
  chains: ReadonlyArray<ChainDescriptor>,
  chainId: ChainId,
): Option.Option<ChainDescriptor> =>
  Array.findFirst(chains, chain => chain.chainId === chainId)

/** Finds one normalized network descriptor by its stable identifier. */
export const networkForId = (
  networks: ReadonlyArray<NetworkDescriptor>,
  networkId: NetworkId,
): Option.Option<NetworkDescriptor> =>
  Array.findFirst(networks, network => network.networkId === networkId)

/** Finds one normalized asset descriptor by its stable identifier. */
export const assetForId = (
  assets: ReadonlyArray<AssetDescriptor>,
  assetId: AssetId,
): Option.Option<AssetDescriptor> =>
  Array.findFirst(assets, asset => asset.assetId === assetId)
