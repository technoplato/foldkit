import { Context, Effect } from 'effect'

import type { Game, Page, SectionKey, WalletAddress } from './page.js'

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
    scrollToSection: (sectionKey: SectionKey) => Effect.Effect<void>
    reloadPage: Effect.Effect<void>
    nowMs: Effect.Effect<number>
  }>
>()('brandon/BrandonServer') {}
