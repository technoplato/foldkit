import {
  HeldClaimStatus,
  type SectionColumn,
  type SentTransaction,
  type WalletActivityEntry,
  type WalletAddress,
  WatchedNetworkId,
} from 'brandon-core-example'
import { type Effect, type Option, Schema as S } from 'effect'
import { AtomicUnits } from 'wallet-core-example'

import type { Account } from './account.js'

// STORE

/** What a section paints. */
export const SectionKind = S.Literals([
  'Markdown',
  'QrLinks',
  'Scoreboard',
  'Football',
  'Wallets',
  'Wallet',
])
/** What a section paints. */
export type SectionKind = typeof SectionKind.Type

/** One link of a QrLinks section, as the row keeps it. */
export type LinkRow = Readonly<{ label: string; url: string }>

/** One `brandonSections` row. */
export type SectionRow = Readonly<{
  sectionKey: string
  title: string
  kind: SectionKind
  column: SectionColumn
  flag: string
  position: number
  maybeMarkdown: Option.Option<string>
  maybeLinks: Option.Option<ReadonlyArray<LinkRow>>
}>

/**
 * One `walletAccounts` row of a person: a public address on one network,
 * and whether Scribe holds its key for them (custody `Scribe`, a key on
 * Michael's Mac) or it is their own wallet's.
 */
export const PersonAccount = S.Struct({
  networkId: WatchedNetworkId,
  address: S.String,
  isHeldByScribe: S.Boolean,
})
/** One `walletAccounts` row of a person. */
export type PersonAccount = typeof PersonAccount.Type

/**
 * One `walletClaims` row: a move of held money a person asked for. Its
 * key is `<held accountKey>|<requestedAtMs>`, and its send id is the one
 * payment `scribe-wallet send --id` makes of it.
 */
export const ClaimRecord = S.Struct({
  claimKey: S.String,
  holder: S.String,
  networkId: WatchedNetworkId,
  fromAddress: S.String,
  toAddress: S.String,
  sendId: S.String,
  requestedAtMs: S.Number,
  status: HeldClaimStatus,
  maybeAmountAtomic: S.Option(AtomicUnits),
  maybeTransactionId: S.Option(S.String),
  maybeFailure: S.Option(S.String),
  updatedAtMs: S.Number,
})
/** One `walletClaims` row. */
export type ClaimRecord = typeof ClaimRecord.Type

/**
 * What the origin reads. Every row is the owner's alone in Instant, so the
 * live store holds the admin token and only this process reads them.
 */
export type BrandonStore = Readonly<{
  account: (accountKey: string) => Effect.Effect<Option.Option<Account>, Error>
  sections: Effect.Effect<ReadonlyArray<SectionRow>, Error>
  wallets: Effect.Effect<ReadonlyArray<WalletAddress>, Error>
  walletActivity: (
    holder: string,
  ) => Effect.Effect<ReadonlyArray<WalletActivityEntry>, Error>
  watchedAccountKeys: (
    holder: string,
  ) => Effect.Effect<ReadonlyArray<string>, Error>
  addWatchedAccount: (
    account: Readonly<{
      holder: string
      networkId: WatchedNetworkId
      address: string
    }>,
  ) => Effect.Effect<void, Error>
  addSentTransaction: (
    holder: string,
    sent: SentTransaction,
  ) => Effect.Effect<void, Error>
  personAccounts: (
    holder: string,
  ) => Effect.Effect<ReadonlyArray<PersonAccount>, Error>
  claims: (holder: string) => Effect.Effect<ReadonlyArray<ClaimRecord>, Error>
  addClaim: (claim: ClaimRecord) => Effect.Effect<void, Error>
}>
