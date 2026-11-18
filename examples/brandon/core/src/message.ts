import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import * as Wallet from 'wallet-core-example'

import {
  Game,
  HeldAccount,
  HeldClaimRequest,
  Page,
  SectionKey,
  WalletActivityEntry,
  WalletAddress,
} from './page.js'

// MESSAGE

/** A score change. A correction is another one with negative points. */
export const AwardedPoints = m('AwardedPoints', {
  eventId: S.String,
  name: S.String,
  points: S.Int,
  reason: S.String,
  awardedBy: S.String,
})
/** A note beside a player's name, and whether they wear the dunce hat. */
export const NotedPlayer = m('NotedPlayer', {
  name: S.String,
  maybeNote: S.OptionFromOptionalKey(S.String),
  isDunce: S.Boolean,
})
/** The listener pointed every open page at a section. */
export const PointedAtSection = m('PointedAtSection', {
  sectionKey: SectionKey,
  atMs: S.Number,
})
/** A section's words, order, or flag changed. It carries no words. */
export const ChangedSections = m('ChangedSections', { atMs: S.Number })
/** The wallet mirror wrote fresh public data. It carries no data. */
export const MirroredWallets = m('MirroredWallets', { atMs: S.Number })
/** The chain watcher wrote wallet activity. It carries no data and names no one. */
export const ChangedWalletActivity = m('ChangedWalletActivity', {
  atMs: S.Number,
})
/** The listener asked every open page to reload. */
export const RequestedReload = m('RequestedReload', { atMs: S.Number })

/** The origin sent this person's sections. */
export const ReceivedPage = m('ReceivedPage', { page: Page })
/** The origin refused or could not be reached. */
export const FailedPage = m('FailedPage', { reason: S.String })
/** The origin sent this minute's games. */
export const ReceivedFootball = m('ReceivedFootball', { games: S.Array(Game) })
/** The games could not be read; the last ones stay on screen. */
export const FailedFootball = m('FailedFootball')
/** The origin sent the mirrored addresses this person may see. */
export const ReceivedWallets = m('ReceivedWallets', {
  wallets: S.Array(WalletAddress),
})
/** The mirror could not be read; the last rows stay on screen. */
export const FailedWallets = m('FailedWallets')
/** The origin sent this person's wallet activity. */
export const ReceivedWalletActivity = m('ReceivedWalletActivity', {
  entries: S.Array(WalletActivityEntry),
})
/** The activity could not be read; the last rows stay on screen. */
export const FailedWalletActivity = m('FailedWalletActivity')
/** The origin follows this wallet's public addresses on the chain. */
export const SucceededWatchWalletAccounts = m('SucceededWatchWalletAccounts')
/** The origin did not take this wallet's public addresses. */
export const FailedWatchWalletAccounts = m('FailedWatchWalletAccounts')
/** The origin sent the accounts Scribe holds for this person. */
export const ReceivedHeldAccounts = m('ReceivedHeldAccounts', {
  accounts: S.Array(HeldAccount),
})
/** The held accounts could not be read; the last ones stay on screen. */
export const FailedHeldAccounts = m('FailedHeldAccounts')
/** This person asked to move money Scribe holds for them to their own wallet. */
export const ClickedMoveHeldMoney = m('ClickedMoveHeldMoney', {
  request: HeldClaimRequest,
})
/** The origin took the move; Michael's Mac sends it. */
export const SucceededFileHeldClaim = m('SucceededFileHeldClaim')
/** The origin did not take the move, and why. Nothing was sent. */
export const FailedFileHeldClaim = m('FailedFileHeldClaim', {
  reason: S.String,
})
/** The page told the origin of a send. If that failed, the chain still says so. */
export const CompletedReportSentTransaction = m(
  'CompletedReportSentTransaction',
)
/** A fresh pointer moved this page to its section. */
export const CompletedScrollToSection = m('CompletedScrollToSection', {
  sectionKey: SectionKey,
})
/** A pointer older than this page was left alone. */
export const IgnoredStalePointer = m('IgnoredStalePointer')
/** A reload request older than this page was left alone. */
export const IgnoredStaleReload = m('IgnoredStaleReload')
/** The wallet section's own Message. It never leaves this device. */
export const GotWalletMessage = m('GotWalletMessage', {
  message: Wallet.Message,
})

/** Every Brandon dot Message. */
export const Message = S.Union([
  AwardedPoints,
  NotedPlayer,
  PointedAtSection,
  ChangedSections,
  MirroredWallets,
  ChangedWalletActivity,
  RequestedReload,
  ReceivedPage,
  FailedPage,
  ReceivedFootball,
  FailedFootball,
  ReceivedWallets,
  FailedWallets,
  ReceivedWalletActivity,
  FailedWalletActivity,
  SucceededWatchWalletAccounts,
  FailedWatchWalletAccounts,
  ReceivedHeldAccounts,
  FailedHeldAccounts,
  ClickedMoveHeldMoney,
  SucceededFileHeldClaim,
  FailedFileHeldClaim,
  CompletedReportSentTransaction,
  CompletedScrollToSection,
  IgnoredStalePointer,
  IgnoredStaleReload,
  GotWalletMessage,
])
/** Every Brandon dot Message. */
export type Message = typeof Message.Type

/**
 * What the page's own controls send its Program: the wallet's Messages,
 * and a move of held money. Anything else a page could send is refused
 * when it is decoded.
 */
export const PageInput = S.Union([GotWalletMessage, ClickedMoveHeldMoney])
/** What the page's own controls send its Program. */
export type PageInput = typeof PageInput.Type

/** The facts that travel on the log, which any guest may read. */
export const LogMessage = S.Union([
  AwardedPoints,
  NotedPlayer,
  PointedAtSection,
  ChangedSections,
  MirroredWallets,
  ChangedWalletActivity,
  RequestedReload,
])
/** The facts that travel on the log, which any guest may read. */
export type LogMessage = typeof LogMessage.Type

/** The tags that travel on the log: facts any guest may read. */
export const logMessageTags: ReadonlyArray<Message['_tag']> = [
  'AwardedPoints',
  'NotedPlayer',
  'PointedAtSection',
  'ChangedSections',
  'MirroredWallets',
  'ChangedWalletActivity',
  'RequestedReload',
]
