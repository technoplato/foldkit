import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  ChainId,
  NetworkDescriptor,
  type NetworkEnvironment,
  NetworkId,
} from './currency.js'

/** The global network environment selected across the Wallet UI. */
export const WalletNetworkMode = S.Literals(['Devnet', 'Testnet', 'Live'])
/** The global network environment selected across the Wallet UI. */
export type WalletNetworkMode = typeof WalletNetworkMode.Type

/** One exact public network account persisted in a Wallet profile. */
export const WalletProfileAccount = S.Struct({
  accountId: S.String,
  chainId: ChainId,
  networkId: NetworkId,
  address: S.String,
  displayName: S.String,
})
/** One exact public network account persisted in a Wallet profile. */
export type WalletProfileAccount = typeof WalletProfileAccount.Type

/** One public multi-network Wallet profile safe to journal and replay. */
export const WalletProfile = S.Struct({
  walletId: S.String,
  displayName: S.String,
  createdAt: S.Number,
  accounts: S.Array(WalletProfileAccount),
})
/** One public multi-network Wallet profile safe to journal and replay. */
export type WalletProfile = typeof WalletProfile.Type

/** The idempotent public request passed to an injected Wallet vault. */
export const WalletCreationRequest = S.Struct({
  requestId: S.String,
  displayName: S.String,
  networks: S.Array(NetworkDescriptor),
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

/** One persisted account projected through its loaded network descriptor. */
export const ActiveWalletAccount = S.Struct({
  accountId: S.String,
  chainId: ChainId,
  networkId: NetworkId,
  networkMode: WalletNetworkMode,
  networkName: S.String,
  address: S.String,
  displayName: S.String,
})
/** One persisted account projected through its loaded network descriptor. */
export type ActiveWalletAccount = typeof ActiveWalletAccount.Type

/** Finds the persisted Wallet profile that owns one exact account. */
export const walletProfileForAccountId = (
  wallets: ReadonlyArray<WalletProfile>,
  accountId: string,
): Option.Option<WalletProfile> =>
  Array.findFirst(wallets, wallet =>
    Array.some(wallet.accounts, account => account.accountId === accountId),
  )

/** Reports whether one network belongs to the selected global Wallet mode. */
export const isNetworkEnvironmentInWalletMode = (
  environment: NetworkEnvironment,
  networkMode: WalletNetworkMode,
): boolean =>
  M.value(networkMode).pipe(
    M.withReturnType<boolean>(),
    M.when(
      'Devnet',
      () => environment === 'Development' || environment === 'Local',
    ),
    M.when('Testnet', () => environment === 'Testnet'),
    M.when('Live', () => environment === 'Mainnet'),
    M.exhaustive,
  )

/** Projects every persisted account available in one global network mode. */
export const activeWalletAccounts = (
  wallet: WalletProfile,
  networks: ReadonlyArray<NetworkDescriptor>,
  networkMode: WalletNetworkMode,
): ReadonlyArray<ActiveWalletAccount> =>
  Array.flatMap(wallet.accounts, account => {
    const maybeNetwork = Array.findFirst(
      networks,
      network =>
        network.networkId === account.networkId &&
        network.chainId === account.chainId,
    )
    if (
      Option.isNone(maybeNetwork) ||
      !isNetworkEnvironmentInWalletMode(
        maybeNetwork.value.environment,
        networkMode,
      )
    ) {
      return []
    }
    return [
      ActiveWalletAccount.make({
        accountId: account.accountId,
        chainId: account.chainId,
        networkId: account.networkId,
        networkMode,
        networkName: maybeNetwork.value.displayName,
        address: account.address,
        displayName: account.displayName,
      }),
    ]
  })

/** Selects the next global Wallet network mode. */
export const toggledWalletNetworkMode = (
  networkMode: WalletNetworkMode,
): WalletNetworkMode =>
  M.value(networkMode).pipe(
    M.withReturnType<WalletNetworkMode>(),
    M.when('Devnet', () => 'Testnet'),
    M.when('Testnet', () => 'Live'),
    M.when('Live', () => 'Devnet'),
    M.exhaustive,
  )

/** Creates the next stable, replayable Wallet creation request. */
export const nextWalletCreationRequest = (
  wallets: ReadonlyArray<WalletProfile>,
  networks: ReadonlyArray<NetworkDescriptor>,
): WalletCreationRequest => {
  const nextWalletNumber = Array.length(wallets) + 1
  return WalletCreationRequest.make({
    requestId: `wallet-${nextWalletNumber.toString()}`,
    displayName: `Wallet ${nextWalletNumber.toString()}`,
    networks,
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
