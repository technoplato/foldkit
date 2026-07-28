import { Array, Match as M, Schema as S } from 'effect'

/** One network family included in every created Wallet profile. */
export const WalletChain = S.Literals(['Bitcoin', 'Ethereum', 'Solana', 'Sui'])
/** One network family included in every created Wallet profile. */
export type WalletChain = typeof WalletChain.Type

/** The global non-production network mode shared by every Wallet profile. */
export const WalletNetworkMode = S.Literals(['Devnet', 'Testnet'])
/** The global non-production network mode shared by every Wallet profile. */
export type WalletNetworkMode = typeof WalletNetworkMode.Type

/** A supported Bitcoin receiving-address format. */
export const BitcoinAddressType = S.Literals(['NativeSegwit', 'Taproot'])
/** A supported Bitcoin receiving-address format. */
export type BitcoinAddressType = typeof BitcoinAddressType.Type

/** Both public Bitcoin address formats derived for one network mode. */
export const BitcoinAddressSet = S.Struct({
  nativeSegwitAddress: S.String,
  taprootAddress: S.String,
})
/** Both public Bitcoin address formats derived for one network mode. */
export type BitcoinAddressSet = typeof BitcoinAddressSet.Type

/** The public Bitcoin account in one created Wallet. */
export const BitcoinWalletAccount = S.TaggedStruct('BitcoinWalletAccount', {
  accountId: S.String,
  devnetAddresses: BitcoinAddressSet,
  testnetAddresses: BitcoinAddressSet,
  preferredAddressType: BitcoinAddressType,
})
/** The public Bitcoin account in one created Wallet. */
export type BitcoinWalletAccount = typeof BitcoinWalletAccount.Type

/** The public Ethereum account in one created Wallet. */
export const EthereumWalletAccount = S.TaggedStruct('EthereumWalletAccount', {
  accountId: S.String,
  address: S.String,
})
/** The public Ethereum account in one created Wallet. */
export type EthereumWalletAccount = typeof EthereumWalletAccount.Type

/** The public Solana account in one created Wallet. */
export const SolanaWalletAccount = S.TaggedStruct('SolanaWalletAccount', {
  accountId: S.String,
  address: S.String,
})
/** The public Solana account in one created Wallet. */
export type SolanaWalletAccount = typeof SolanaWalletAccount.Type

/** The public Sui account in one created Wallet. */
export const SuiWalletAccount = S.TaggedStruct('SuiWalletAccount', {
  accountId: S.String,
  address: S.String,
})
/** The public Sui account in one created Wallet. */
export type SuiWalletAccount = typeof SuiWalletAccount.Type

/** Exactly one public account for every chain supported by a Wallet profile. */
export const WalletProfileAccounts = S.Struct({
  bitcoin: BitcoinWalletAccount,
  ethereum: EthereumWalletAccount,
  solana: SolanaWalletAccount,
  sui: SuiWalletAccount,
})
/** Exactly one public account for every chain supported by a Wallet profile. */
export type WalletProfileAccounts = typeof WalletProfileAccounts.Type

/** One public multi-chain Wallet profile safe to journal and replay. */
export const WalletProfile = S.Struct({
  walletId: S.String,
  displayName: S.String,
  createdAt: S.Number,
  accounts: WalletProfileAccounts,
})
/** One public multi-chain Wallet profile safe to journal and replay. */
export type WalletProfile = typeof WalletProfile.Type

/** The idempotent public request passed to an injected Wallet vault. */
export const WalletCreationRequest = S.Struct({
  requestId: S.String,
  displayName: S.String,
})
/** The idempotent public request passed to an injected Wallet vault. */
export type WalletCreationRequest = typeof WalletCreationRequest.Type

/** No Wallet profile creation is in flight. */
export const ReadyToCreateWallet = S.TaggedStruct('ReadyToCreateWallet', {})
/** One Wallet profile is being created by the injected vault. */
export const CreatingWallet = S.TaggedStruct('CreatingWallet', {
  request: WalletCreationRequest,
})
/** One Wallet profile creation failed without exposing a host cause. */
export const FailedWalletCreation = S.TaggedStruct('FailedWalletCreation', {
  request: WalletCreationRequest,
  code: S.Literals(['Unavailable', 'InvalidKeyMaterial']),
})
/** The complete finite lifecycle of Wallet profile creation. */
export const WalletCreationState = S.Union([
  ReadyToCreateWallet,
  CreatingWallet,
  FailedWalletCreation,
])
/** The complete finite lifecycle of Wallet profile creation. */
export type WalletCreationState = typeof WalletCreationState.Type

/** Persisted Wallet profiles are being restored from injected secure storage. */
export const LoadingWalletProfiles = S.TaggedStruct('LoadingWalletProfiles', {})
/** Persisted Wallet profiles are available to the Program. */
export const LoadedWalletProfiles = S.TaggedStruct('LoadedWalletProfiles', {})
/** Persisted Wallet profiles could not be restored from secure storage. */
export const FailedWalletProfileLoading = S.TaggedStruct(
  'FailedWalletProfileLoading',
  { code: S.Literals(['Unavailable', 'InvalidKeyMaterial']) },
)
/** The finite lifecycle for restoring persisted Wallet profiles. */
export const WalletProfileLoadingState = S.Union([
  LoadingWalletProfiles,
  LoadedWalletProfiles,
  FailedWalletProfileLoading,
])
/** The finite lifecycle for restoring persisted Wallet profiles. */
export type WalletProfileLoadingState = typeof WalletProfileLoadingState.Type

/** One chain account projected through the globally selected network mode. */
export const ActiveWalletAccount = S.Struct({
  accountId: S.String,
  chain: WalletChain,
  networkMode: WalletNetworkMode,
  networkName: S.String,
  address: S.String,
  detail: S.String,
})
/** One chain account projected through the globally selected network mode. */
export type ActiveWalletAccount = typeof ActiveWalletAccount.Type

const bitcoinAddress = (
  account: BitcoinWalletAccount,
  networkMode: WalletNetworkMode,
): string => {
  const addresses =
    networkMode === 'Devnet'
      ? account.devnetAddresses
      : account.testnetAddresses
  if (account.preferredAddressType === 'NativeSegwit') {
    return addresses.nativeSegwitAddress
  } else {
    return addresses.taprootAddress
  }
}

/** Returns the human-readable network selected for one chain and global mode. */
export const walletNetworkName = (
  chain: WalletChain,
  networkMode: WalletNetworkMode,
): string =>
  M.value(chain).pipe(
    M.withReturnType<string>(),
    M.when('Bitcoin', () =>
      networkMode === 'Devnet' ? 'Bitcoin Regtest' : 'Bitcoin Testnet',
    ),
    M.when('Ethereum', () =>
      networkMode === 'Devnet' ? 'Ethereum Localnet' : 'Ethereum Sepolia',
    ),
    M.when('Solana', () =>
      networkMode === 'Devnet' ? 'Solana Devnet' : 'Solana Testnet',
    ),
    M.when('Sui', () =>
      networkMode === 'Devnet' ? 'Sui Devnet' : 'Sui Testnet',
    ),
    M.exhaustive,
  )

/** Projects every account in one Wallet through the globally selected mode. */
export const activeWalletAccounts = (
  wallet: WalletProfile,
  networkMode: WalletNetworkMode,
): ReadonlyArray<ActiveWalletAccount> => [
  ActiveWalletAccount.make({
    accountId: wallet.accounts.bitcoin.accountId,
    chain: 'Bitcoin',
    networkMode,
    networkName: walletNetworkName('Bitcoin', networkMode),
    address: bitcoinAddress(wallet.accounts.bitcoin, networkMode),
    detail:
      wallet.accounts.bitcoin.preferredAddressType === 'NativeSegwit'
        ? 'Native Segwit preferred · Taproot enabled'
        : 'Taproot preferred · Native Segwit enabled',
  }),
  ActiveWalletAccount.make({
    accountId: wallet.accounts.ethereum.accountId,
    chain: 'Ethereum',
    networkMode,
    networkName: walletNetworkName('Ethereum', networkMode),
    address: wallet.accounts.ethereum.address,
    detail: 'EVM account',
  }),
  ActiveWalletAccount.make({
    accountId: wallet.accounts.solana.accountId,
    chain: 'Solana',
    networkMode,
    networkName: walletNetworkName('Solana', networkMode),
    address: wallet.accounts.solana.address,
    detail: 'Ed25519 account',
  }),
  ActiveWalletAccount.make({
    accountId: wallet.accounts.sui.accountId,
    chain: 'Sui',
    networkMode,
    networkName: walletNetworkName('Sui', networkMode),
    address: wallet.accounts.sui.address,
    detail: 'Ed25519 account',
  }),
]

/** Produces the other global Wallet network mode. */
export const toggledWalletNetworkMode = (
  networkMode: WalletNetworkMode,
): WalletNetworkMode => (networkMode === 'Devnet' ? 'Testnet' : 'Devnet')

/** Creates the next stable, replayable Wallet creation request. */
export const nextWalletCreationRequest = (
  wallets: ReadonlyArray<WalletProfile>,
): WalletCreationRequest => {
  const nextWalletNumber = wallets.length + 1
  return WalletCreationRequest.make({
    requestId: `wallet-${nextWalletNumber.toString()}`,
    displayName: `Wallet ${nextWalletNumber.toString()}`,
  })
}

/** Adds or replaces one public Wallet profile without duplicating its id. */
export const upsertWalletProfile = (
  wallets: ReadonlyArray<WalletProfile>,
  wallet: WalletProfile,
): ReadonlyArray<WalletProfile> => [
  ...Array.filter(wallets, current => current.walletId !== wallet.walletId),
  wallet,
]
