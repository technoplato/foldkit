import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import * as Wallet from 'wallet-core-example'

import {
  Game,
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
  CompletedReportSentTransaction,
  CompletedScrollToSection,
  IgnoredStalePointer,
  IgnoredStaleReload,
  GotWalletMessage,
])
/** Every Brandon dot Message. */
export type Message = typeof Message.Type

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
