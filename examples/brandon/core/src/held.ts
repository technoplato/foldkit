import { Array, Match as M, Option } from 'effect'
import { displayAmountFromAtomicUnits } from 'wallet-core-example'

import type { HeldAccountsState, Model } from './model.js'
import type { HeldAccount, HeldClaimRequest, WatchedNetworkId } from './page.js'
import { brandonWalletNetworks } from './wallet.js'
import { publicAccountsOf } from './walletActivity.js'

// HELD

/**
 * Where the page asks the origin to move held money. The facts travel as
 * a path because the origin reads no request body, so nothing can hand
 * it a key in one.
 *
 * @example
 * ```typescript
 * heldClaimPathOf({ networkId: 'solana:mainnet-beta', heldAddress: '43T9…', toAddress: '9Pz…' })
 * // '/api/wallet/claim/solana%3Amainnet-beta/43T9…/9Pz…'
 * ```
 */
export const heldClaimPathOf = ({
  networkId,
  heldAddress,
  toAddress,
}: HeldClaimRequest): string =>
  `/api/wallet/claim/${Array.join(
    Array.map([networkId, heldAddress, toAddress], encodeURIComponent),
    '/',
  )}`

const configurationOf = (networkId: WatchedNetworkId) =>
  Array.findFirst(
    brandonWalletNetworks,
    configuration => configuration.network.networkId === networkId,
  )

/**
 * An amount on one of the page's networks, in its asset.
 *
 * @example
 * ```typescript
 * heldAmountLabel('solana:mainnet-beta', '181071945') // '0.181071945 SOL'
 * ```
 */
export const heldAmountLabel = (
  networkId: WatchedNetworkId,
  atomicUnits: `${bigint}`,
): string =>
  Option.match(configurationOf(networkId), {
    onNone: () => `${atomicUnits} ${networkId}`,
    onSome: ({ asset }) =>
      `${displayAmountFromAtomicUnits(atomicUnits, asset.decimalPlaces)} ${asset.symbol}`,
  })

/** A network as the wallet's pickers name it: `Solana Mainnet Beta`. */
export const heldNetworkLabel = (networkId: WatchedNetworkId): string =>
  Option.match(configurationOf(networkId), {
    onNone: () => networkId,
    onSome: ({ network }) => network.displayName,
  })

/** True for the two networks that carry real money. */
export const isRealMoneyNetwork = (networkId: WatchedNetworkId): boolean =>
  M.value(networkId).pipe(
    M.withReturnType<boolean>(),
    M.whenOr('solana:mainnet-beta', 'ethereum:mainnet', () => true),
    M.whenOr('solana:devnet', 'ethereum:sepolia', () => false),
    M.exhaustive,
  )

/** True while a move of this held account is on its way. */
export const isHeldMoveOnItsWay = (held: HeldAccount): boolean =>
  Option.exists(held.maybeClaim, claim => claim.status === 'Requested')

/** True when the chain says nothing is left in this held account. */
export const isHeldAccountEmpty = (held: HeldAccount): boolean =>
  Option.exists(held.maybeBalanceAtomic, balance => BigInt(balance) <= 0n)

/**
 * The move the page may ask for on one held account: everything in it to
 * this person's own wallet's account on the same network, once the
 * origin follows that wallet. None while a move is on its way, when the
 * chain says nothing is left, or before their wallet has an account
 * there.
 *
 * @example
 * ```typescript
 * heldMoveRequestOf(model, held)
 * // Option.some({ networkId: 'solana:mainnet-beta', heldAddress: '43T9…', toAddress: '9Pz…' })
 * ```
 */
export const heldMoveRequestOf = (
  model: Model,
  held: HeldAccount,
): Option.Option<HeldClaimRequest> =>
  model.walletWatch._tag !== 'ConfirmedWalletWatch' ||
  isHeldMoveOnItsWay(held) ||
  isHeldAccountEmpty(held)
    ? Option.none()
    : Option.map(
        Array.findFirst(
          publicAccountsOf(model.wallet),
          account =>
            account.networkId === held.networkId &&
            account.address !== held.address,
        ),
        account => ({
          networkId: held.networkId,
          heldAddress: held.address,
          toAddress: account.address,
        }),
      )

/** The held accounts the page last heard of, however the last read went. */
export const knownHeldAccounts = (
  heldAccounts: HeldAccountsState,
): ReadonlyArray<HeldAccount> =>
  M.value(heldAccounts).pipe(
    M.withReturnType<ReadonlyArray<HeldAccount>>(),
    M.tagsExhaustive({
      LoadingHeldAccounts: () => [],
      LoadedHeldAccounts: ({ accounts }) => accounts,
      UnavailableHeldAccounts: ({ accounts }) => accounts,
    }),
  )
