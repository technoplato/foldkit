import { Array, Effect, Option, Schema as S } from 'effect'

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

/** A non-production environment where test funding may be requested. */
export const TestFundingEnvironment = S.Literals([
  'Testnet',
  'Development',
  'Local',
])
/** A non-production environment where test funding may be requested. */
export type TestFundingEnvironment = typeof TestFundingEnvironment.Type

/** A chain-agnostic Wallet capability advertised by an adapter. */
export const WalletCapability = S.Literals([
  'Transfer',
  'TestFunding',
  'ExternalTestFunding',
  'TransactionHistory',
  'TransactionObservation',
  'ChallengeSignature',
])
/** A chain-agnostic Wallet capability advertised by an adapter. */
export type WalletCapability = typeof WalletCapability.Type

/** No test-funding path exists for this network. */
export const UnavailableTestFundingMethod = S.TaggedStruct(
  'UnavailableTestFundingMethod',
  {},
)
/** The selected adapter can request test funds directly. */
export const AdapterTestFundingMethod = S.TaggedStruct(
  'AdapterTestFundingMethod',
  {},
)
/** A human must complete a real provider-owned faucet flow. */
export const ExternalTestFundingMethod = S.TaggedStruct(
  'ExternalTestFundingMethod',
  {
    providerName: S.String,
    providerUrl: S.String,
  },
)
const NetworkTestFundingMethod = S.Union([
  UnavailableTestFundingMethod,
  AdapterTestFundingMethod,
  ExternalTestFundingMethod,
]).pipe(
  S.withDecodingDefaultKey(
    Effect.succeed(UnavailableTestFundingMethod.make({})),
  ),
  S.withConstructorDefault(
    Effect.succeed(UnavailableTestFundingMethod.make({})),
  ),
)
/** How test funds are acquired for one normalized network. */
export const TestFundingMethod = NetworkTestFundingMethod
/** How test funds are acquired for one normalized network. */
export type TestFundingMethod = typeof TestFundingMethod.Type

/** A normalized public description of one configured network. */
export const NetworkDescriptor = S.Struct({
  networkId: NetworkId,
  chainId: ChainId,
  displayName: S.String,
  environment: NetworkEnvironment,
  capabilities: S.Array(WalletCapability),
  testFundingMethod: NetworkTestFundingMethod,
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

/** An exact signed integer encoded in portable decimal notation. */
export const AtomicUnits = S.TemplateLiteral([S.BigInt])
/** An exact signed integer encoded in portable decimal notation. */
export type AtomicUnits = typeof AtomicUnits.Type
const oneAtomicUnit = S.decodeUnknownSync(AtomicUnits)('1')

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
  atomicUnitName: S.String.pipe(
    S.withDecodingDefaultKey(Effect.succeed('atomic unit')),
    S.withConstructorDefault(Effect.succeed('atomic unit')),
  ),
  suggestedTestTransferAtomicUnits: AtomicUnits.pipe(
    S.withDecodingDefaultKey(Effect.succeed(oneAtomicUnit)),
    S.withConstructorDefault(Effect.succeed(oneAtomicUnit)),
  ),
  decimalPlaces: AssetDecimalPlaces,
  kind: AssetKind,
})
/** A normalized public description of one asset on one network. */
export type AssetDescriptor = typeof AssetDescriptor.Type

/** An exact quantity that refers to one normalized asset. */
export const AssetAmount = S.Struct({
  assetId: AssetId,
  atomicUnits: AtomicUnits,
  observedAt: S.Number,
})
/** An exact quantity that refers to one normalized asset. */
export type AssetAmount = typeof AssetAmount.Type

/** Why a user-entered display amount could not become exact atomic units. */
export const AssetDisplayAmountFailureCode = S.Literals([
  'InvalidFormat',
  'TooManyDecimalPlaces',
  'MustBePositive',
])
/** Why a user-entered display amount could not become exact atomic units. */
export type AssetDisplayAmountFailureCode =
  typeof AssetDisplayAmountFailureCode.Type

/** A display amount could not be represented as positive exact atomic units. */
export const InvalidAssetDisplayAmount = S.TaggedStruct(
  'InvalidAssetDisplayAmount',
  { code: AssetDisplayAmountFailureCode },
)
/** A display amount was converted to positive exact atomic units. */
export const ConvertedAssetDisplayAmount = S.TaggedStruct(
  'ConvertedAssetDisplayAmount',
  { atomicUnits: AtomicUnits },
)
/** The exact result of converting a user-entered display amount. */
export const AssetDisplayAmountConversion = S.Union([
  InvalidAssetDisplayAmount,
  ConvertedAssetDisplayAmount,
])
/** The exact result of converting a user-entered display amount. */
export type AssetDisplayAmountConversion =
  typeof AssetDisplayAmountConversion.Type

const unsignedDisplayAmountPattern = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/

/** Converts a positive decimal display amount without floating-point math. */
export const convertDisplayAmountToAtomicUnits = (
  displayAmount: string,
  decimalPlaces: AssetDecimalPlaces,
): AssetDisplayAmountConversion => {
  const normalizedDisplayAmount = displayAmount.trim()
  if (!unsignedDisplayAmountPattern.test(normalizedDisplayAmount)) {
    return InvalidAssetDisplayAmount.make({ code: 'InvalidFormat' })
  }
  const parts = normalizedDisplayAmount.split('.')
  const wholeUnits = Option.getOrElse(Array.head(parts), () => '0')
  const fractionalUnits = Option.getOrElse(Array.get(parts, 1), () => '')
  if (fractionalUnits.length > decimalPlaces) {
    return InvalidAssetDisplayAmount.make({ code: 'TooManyDecimalPlaces' })
  }
  const paddedFractionalUnits = fractionalUnits.padEnd(decimalPlaces, '0')
  const unnormalizedAtomicUnits = `${wholeUnits}${paddedFractionalUnits}`
  const normalizedAtomicUnits = unnormalizedAtomicUnits.replace(
    /^0+(?=[0-9])/,
    '',
  )
  if (BigInt(normalizedAtomicUnits) <= 0n) {
    return InvalidAssetDisplayAmount.make({ code: 'MustBePositive' })
  }
  return ConvertedAssetDisplayAmount.make({
    atomicUnits: S.decodeUnknownSync(AtomicUnits)(normalizedAtomicUnits),
  })
}

/** Formats exact atomic units as a canonical decimal display amount. */
export const displayAmountFromAtomicUnits = (
  atomicUnits: AtomicUnits,
  decimalPlaces: AssetDecimalPlaces,
): string => {
  const isNegative = atomicUnits.startsWith('-')
  const unsignedAtomicUnits = isNegative ? atomicUnits.slice(1) : atomicUnits
  const paddedAtomicUnits = unsignedAtomicUnits.padStart(decimalPlaces + 1, '0')
  const wholeUnits =
    decimalPlaces === 0
      ? paddedAtomicUnits
      : paddedAtomicUnits.slice(0, -decimalPlaces)
  const fractionalUnits =
    decimalPlaces === 0
      ? ''
      : paddedAtomicUnits.slice(-decimalPlaces).replace(/0+$/, '')
  const displayAmount =
    fractionalUnits === '' ? wholeUnits : `${wholeUnits}.${fractionalUnits}`
  return `${isNegative ? '-' : ''}${displayAmount}`
}

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
