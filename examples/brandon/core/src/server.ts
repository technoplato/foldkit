import { Context, Effect } from 'effect'

import type {
  Game,
  HeldAccount,
  HeldClaimRequest,
  Page,
  SectionKey,
  SentTransaction,
  WalletActivityEntry,
  WalletAddress,
  WalletPublicAccount,
} from './page.js'

// SERVICE

/**
 * Everything Brandon dot asks of the page's origin and its browser. The
 * origin checks the Cloudflare Access login on every read, so a section
 * this person's flags leave off never reaches them. Tests use one in
 * memory.
 */
export class BrandonServer extends Context.Service<
  BrandonServer,
  Readonly<{
    loadPage: Effect.Effect<Page, string>
    loadFootball: Effect.Effect<ReadonlyArray<Game>, string>
    loadWallets: Effect.Effect<ReadonlyArray<WalletAddress>, string>
    loadWalletActivity: Effect.Effect<
      ReadonlyArray<WalletActivityEntry>,
      string
    >
    loadHeldAccounts: Effect.Effect<ReadonlyArray<HeldAccount>, string>
    fileHeldClaim: (request: HeldClaimRequest) => Effect.Effect<void, string>
    watchWalletAccounts: (
      accounts: ReadonlyArray<WalletPublicAccount>,
    ) => Effect.Effect<void, string>
    reportSentTransaction: (
      sent: SentTransaction,
    ) => Effect.Effect<void, string>
    scrollToSection: (sectionKey: SectionKey) => Effect.Effect<void>
    reloadPage: Effect.Effect<void>
    nowMs: Effect.Effect<number>
  }>
>()('brandon/BrandonServer') {}
