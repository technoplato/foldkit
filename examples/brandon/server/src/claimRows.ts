import { HeldClaimStatus, WatchedNetworkId } from 'brandon-core-example'
import { Array, Option, Result, Schema as S } from 'effect'
import { AtomicUnits } from 'wallet-core-example'

import type { ClaimUpdate } from './heldClaims.js'
import type { ClaimRecord, PersonAccount } from './store.js'

// CLAIM ROWS

const formatVersion = 1

/** The one custody a `walletAccounts` row can name: Scribe holds its key on Michael's Mac. */
export const scribeCustody = 'Scribe'

const PersonAccountRow = S.Struct({
  networkId: WatchedNetworkId,
  address: S.String,
  custody: S.optionalKey(S.NullOr(S.String)),
})

const ClaimRow = S.Struct({
  claimKey: S.String,
  holder: S.String,
  networkId: WatchedNetworkId,
  fromAddress: S.String,
  toAddress: S.String,
  sendId: S.String,
  requestedAtMs: S.Number,
  status: HeldClaimStatus,
  amountAtomic: S.optionalKey(S.NullOr(AtomicUnits)),
  transactionId: S.optionalKey(S.NullOr(S.String)),
  failure: S.optionalKey(S.NullOr(S.String)),
  updatedAtMs: S.Number,
})

/**
 * A person's `walletAccounts` rows as Instant answers them. A row that
 * does not read is left out, never taken for one of theirs.
 */
export const personAccountsOf = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<PersonAccount> =>
  Array.filterMap(rows, row =>
    Option.match(S.decodeUnknownOption(PersonAccountRow)(row), {
      onNone: () => Result.failVoid,
      onSome: ({ networkId, address, custody }) =>
        Result.succeed({
          networkId,
          address,
          isHeldByScribe: custody === scribeCustody,
        }),
    }),
  )

/**
 * `walletClaims` rows as Instant answers them. A row that does not read is
 * left out, so it is never paid.
 */
export const claimRecordsOf = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<ClaimRecord> =>
  Array.filterMap(rows, row =>
    Option.match(S.decodeUnknownOption(ClaimRow)(row), {
      onNone: () => Result.failVoid,
      onSome: claim =>
        Result.succeed({
          claimKey: claim.claimKey,
          holder: claim.holder,
          networkId: claim.networkId,
          fromAddress: claim.fromAddress,
          toAddress: claim.toAddress,
          sendId: claim.sendId,
          requestedAtMs: claim.requestedAtMs,
          status: claim.status,
          maybeAmountAtomic: Option.fromNullishOr(claim.amountAtomic),
          maybeTransactionId: Option.fromNullishOr(claim.transactionId),
          maybeFailure: Option.fromNullishOr(claim.failure),
          updatedAtMs: claim.updatedAtMs,
        }),
    }),
  )

/** What `walletClaims` holds for a new claim, owned as its holder's rows are. */
export const claimFieldsOf = (claim: ClaimRecord, ownerUserID: string) => ({
  ownerUserID,
  formatVersion,
  claimKey: claim.claimKey,
  holder: claim.holder,
  networkId: claim.networkId,
  fromAddress: claim.fromAddress,
  toAddress: claim.toAddress,
  sendId: claim.sendId,
  requestedAtMs: claim.requestedAtMs,
  status: claim.status,
  updatedAtMs: claim.updatedAtMs,
})

/** The fields a claim's end changes. A field a claim does not end with is left out, never cleared. */
export const claimUpdateFieldsOf = (update: ClaimUpdate) => ({
  status: update.status,
  updatedAtMs: update.updatedAtMs,
  ...Option.match(update.maybeAmountAtomic, {
    onNone: () => ({}),
    onSome: amountAtomic => ({ amountAtomic }),
  }),
  ...Option.match(update.maybeTransactionId, {
    onNone: () => ({}),
    onSome: transactionId => ({ transactionId }),
  }),
  ...Option.match(update.maybeFailure, {
    onNone: () => ({}),
    onSome: failure => ({ failure }),
  }),
})
