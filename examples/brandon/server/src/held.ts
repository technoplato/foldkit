import type { HeldAccount, HeldClaimRequest } from 'brandon-core-example'
import { Array, Option, Order, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'
import type { AtomicUnits } from 'wallet-core-example'

import { accountKeyOf } from './activity.js'
import { isLookAlikeOf } from './lookAlike.js'
import { ClaimRecord, type PersonAccount } from './store.js'

// HELD

/** One held account by where it is: its network and its address. */
type HeldPlace = Readonly<{ networkId: string; address: string }>

const byRequestedAt = Order.mapInput(
  Order.Number,
  (claim: ClaimRecord) => claim.requestedAtMs,
)

/**
 * The newest claim on one held account, if any.
 *
 * @example
 * ```typescript
 * newestClaimFor(claims, { networkId: 'solana:mainnet-beta', address })
 * // Option.some({ status: 'Requested', … })
 * ```
 */
export const newestClaimFor = (
  claims: ReadonlyArray<ClaimRecord>,
  held: HeldPlace,
): Option.Option<ClaimRecord> =>
  Array.match(
    Array.filter(
      claims,
      claim =>
        claim.networkId === held.networkId &&
        claim.fromAddress === held.address,
    ),
    {
      onEmpty: () => Option.none(),
      onNonEmpty: claimsOfHeld =>
        Option.some(Array.max(claimsOfHeld, byRequestedAt)),
    },
  )

/**
 * What the page gets for one held account: the account, the balance the
 * chain reported just now, and the newest move its person asked for.
 */
export const heldAccountOf = (
  account: PersonAccount,
  maybeClaim: Option.Option<ClaimRecord>,
  maybeBalanceAtomic: Option.Option<AtomicUnits>,
): HeldAccount => ({
  networkId: account.networkId,
  address: account.address,
  maybeBalanceAtomic,
  maybeClaim: Option.map(maybeClaim, claim => ({
    toAddress: claim.toAddress,
    requestedAtMs: claim.requestedAtMs,
    status: claim.status,
    maybeAmountAtomic: claim.maybeAmountAtomic,
    maybeTransactionId: claim.maybeTransactionId,
    maybeFailure: claim.maybeFailure,
  })),
})

/**
 * A claim's key: one per held account and moment it was asked for.
 *
 * @example
 * ```typescript
 * claimKeyOf(holder, request, 1794364000000)
 * // 'brandon-dot:<hash>|solana:mainnet-beta|<held address>|1794364000000'
 * ```
 */
export const claimKeyOf = (
  holder: string,
  request: HeldClaimRequest,
  requestedAtMs: number,
): string =>
  `${accountKeyOf({ holder, networkId: request.networkId, address: request.heldAddress })}|${requestedAtMs.toString()}`

// DECISION

/** The money would move to the account it is already in. */
export const RefusedSameAddress = ts('RefusedSameAddress')
/** Scribe holds no such account for this person on that network. */
export const RefusedNotHeld = ts('RefusedNotHeld')
/** The address looks like an account Scribe holds for them: a copied wrong address looks so. */
export const RefusedLookAlike = ts('RefusedLookAlike')
/** The address is not one their own wallet registered on that network. */
export const RefusedNotOwnAddress = ts('RefusedNotOwnAddress')
/** A move of that held account is on its way already. */
export const AlreadyRequested = ts('AlreadyRequested')
/** File this claim. */
export const FileClaim = ts('FileClaim', { claim: ClaimRecord })

/** What the origin does with a move a person asked for. */
export const ClaimDecision = S.Union([
  RefusedSameAddress,
  RefusedNotHeld,
  RefusedLookAlike,
  RefusedNotOwnAddress,
  AlreadyRequested,
  FileClaim,
])
/** What the origin does with a move a person asked for. */
export type ClaimDecision = typeof ClaimDecision.Type

const isAt = (
  account: PersonAccount,
  networkId: string,
  address: string,
): boolean => account.networkId === networkId && account.address === address

/**
 * What to do with a move a signed-in person asked for. Money moves only
 * from an account Scribe holds for them, only to an address their own
 * wallet registered on the same network, never to an address that looks
 * like an account Scribe holds for them, and one move at a time.
 */
export const claimDecisionOf = ({
  holder,
  request,
  accounts,
  claims,
  nowMs,
  sendId,
}: Readonly<{
  holder: string
  request: HeldClaimRequest
  accounts: ReadonlyArray<PersonAccount>
  claims: ReadonlyArray<ClaimRecord>
  nowMs: number
  sendId: string
}>): ClaimDecision => {
  const isHeldThere = Array.some(
    accounts,
    account =>
      account.isHeldByScribe &&
      isAt(account, request.networkId, request.heldAddress),
  )
  const isTheirOwnThere = Array.some(
    accounts,
    account =>
      !account.isHeldByScribe &&
      isAt(account, request.networkId, request.toAddress),
  )
  const isLookAlike = Array.some(
    accounts,
    account =>
      account.isHeldByScribe &&
      isLookAlikeOf(request.toAddress, account.address),
  )
  const isOnItsWay = Option.exists(
    newestClaimFor(claims, {
      networkId: request.networkId,
      address: request.heldAddress,
    }),
    claim => claim.status === 'Requested',
  )
  if (!isHeldThere) {
    return RefusedNotHeld()
  } else if (request.toAddress === request.heldAddress) {
    return RefusedSameAddress()
  } else if (isLookAlike) {
    return RefusedLookAlike()
  } else if (!isTheirOwnThere) {
    return RefusedNotOwnAddress()
  } else if (isOnItsWay) {
    return AlreadyRequested()
  } else {
    return FileClaim({
      claim: {
        claimKey: claimKeyOf(holder, request, nowMs),
        holder,
        networkId: request.networkId,
        fromAddress: request.heldAddress,
        toAddress: request.toAddress,
        sendId,
        requestedAtMs: nowMs,
        status: 'Requested',
        maybeAmountAtomic: Option.none(),
        maybeTransactionId: Option.none(),
        maybeFailure: Option.none(),
        updatedAtMs: nowMs,
      },
    })
  }
}

/** True when this person's account at that place is one Scribe holds. */
export const isHeldByScribeAt = (
  accounts: ReadonlyArray<PersonAccount>,
  networkId: string,
  address: string,
): boolean =>
  Array.some(
    accounts,
    account => account.isHeldByScribe && isAt(account, networkId, address),
  )
