import type {
  SectionColumn,
  WalletActivityEntry,
  WalletAddress,
  WatchedNetworkId,
} from 'brandon-core-example'
import { type Effect, type Option, Schema as S } from 'effect'

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
}>
