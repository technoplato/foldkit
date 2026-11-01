import { Array, Match as M, Option, Result, Schema as S } from 'effect'
import {
  type WalletNetworkMode,
  displayAmountFromAtomicUnits,
} from 'wallet-core-example'

import type { WalletActivityState, WalletState } from './model.js'
import {
  type WalletActivityEntry,
  type WalletPublicAccount,
  WatchedNetworkId,
} from './page.js'
import { brandonWalletNetworks } from './wallet.js'

// WALLET ACTIVITY

/**
 * The public addresses this page's wallets hold on Brandon dot's four
 * networks, each once. Only the network and the address are read from the
 * wallet, so nothing else it holds can reach the origin.
 *
 * @example
 * ```typescript
 * publicAccountsOf(model.wallet)
 * // [{ networkId: 'solana:devnet', address: '5xAm658v71…' }]
 * ```
 */
export const publicAccountsOf = (
  wallet: WalletState,
): ReadonlyArray<WalletPublicAccount> =>
  M.value(wallet).pipe(
    M.withReturnType<ReadonlyArray<WalletPublicAccount>>(),
    M.tagsExhaustive({
      ClosedWallet: () => [],
      OpenWallet: ({ model }) =>
        Array.dedupeWith(
          Array.flatMap(model.wallets, profile =>
            Array.filterMap(profile.accounts, ({ networkId, address }) =>
              S.is(WatchedNetworkId)(networkId)
                ? Result.succeed({ networkId, address })
                : Result.failVoid,
            ),
          ),
          (left, right) =>
            left.networkId === right.networkId &&
            left.address === right.address,
        ),
    }),
  )

const modeOfNetwork = (networkId: WatchedNetworkId): WalletNetworkMode =>
  M.value(networkId).pipe(
    M.withReturnType<WalletNetworkMode>(),
    M.whenOr('solana:devnet', 'ethereum:sepolia', () => 'Devnet'),
    M.whenOr('solana:mainnet-beta', 'ethereum:mainnet', () => 'Live'),
    M.exhaustive,
  )

/**
 * The rows of one network mode, so test money never reads as real.
 *
 * @example
 * ```typescript
 * activityInMode(entries, 'Live') // only Solana Mainnet Beta and Ethereum Mainnet rows
 * ```
 */
export const activityInMode = (
  entries: ReadonlyArray<WalletActivityEntry>,
  mode: WalletNetworkMode,
): ReadonlyArray<WalletActivityEntry> =>
  Array.filter(entries, entry => modeOfNetwork(entry.networkId) === mode)

const isSameStanding = (
  left: WalletActivityEntry,
  right: WalletActivityEntry,
): boolean =>
  left.networkId === right.networkId &&
  left.transactionId === right.transactionId &&
  left.status === right.status &&
  Option.getOrNull(left.maybeFinality) === Option.getOrNull(right.maybeFinality)

/**
 * True when these rows hold a transaction, or a status, the page did not
 * know. The first read is never news: the wallet just read the chain.
 */
export const hasNewActivity = (
  known: WalletActivityState,
  entries: ReadonlyArray<WalletActivityEntry>,
): boolean =>
  M.value(known).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      LoadingWalletActivity: () => false,
      LoadedWalletActivity: ({ entries: knownEntries }) =>
        Array.some(
          entries,
          entry =>
            !Array.some(knownEntries, knownEntry =>
              isSameStanding(knownEntry, entry),
            ),
        ),
      UnavailableWalletActivity: ({ entries: knownEntries }) =>
        Array.some(
          entries,
          entry =>
            !Array.some(knownEntries, knownEntry =>
              isSameStanding(knownEntry, entry),
            ),
        ),
    }),
  )

/**
 * A row's amount in its asset: `0.5 SOL`. An asset outside the wallet's
 * catalog keeps its whole units and its id, so it never looks like more
 * than it is.
 */
export const walletActivityAmountLabel = (
  entry: WalletActivityEntry,
): string =>
  Option.match(
    Array.findFirst(
      brandonWalletNetworks,
      configuration => configuration.asset.assetId === entry.assetId,
    ),
    {
      onNone: () => `${entry.amountAtomic} ${entry.assetId}`,
      onSome: ({ asset }) =>
        `${displayAmountFromAtomicUnits(entry.amountAtomic, asset.decimalPlaces)} ${asset.symbol}`,
    },
  )

/** A row's network as the wallet's pickers name it: `Solana Devnet`. */
export const walletActivityNetworkLabel = (
  entry: WalletActivityEntry,
): string =>
  Option.match(
    Array.findFirst(
      brandonWalletNetworks,
      configuration => configuration.network.networkId === entry.networkId,
    ),
    {
      onNone: () => entry.networkId,
      onSome: ({ network }) => network.displayName,
    },
  )
