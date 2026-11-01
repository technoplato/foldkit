import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { Game, Page, SectionKey, WalletAddress } from './page.js'

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
/** A fresh pointer moved this page to its section. */
export const CompletedScrollToSection = m('CompletedScrollToSection', {
  sectionKey: SectionKey,
})
/** A pointer older than this page was left alone. */
export const IgnoredStalePointer = m('IgnoredStalePointer')
/** A reload request older than this page was left alone. */
export const IgnoredStaleReload = m('IgnoredStaleReload')

/** Every Brandon dot Message. */
export const Message = S.Union([
  AwardedPoints,
  NotedPlayer,
  PointedAtSection,
  ChangedSections,
  MirroredWallets,
  RequestedReload,
  ReceivedPage,
  FailedPage,
  ReceivedFootball,
  FailedFootball,
  ReceivedWallets,
  FailedWallets,
  CompletedScrollToSection,
  IgnoredStalePointer,
  IgnoredStaleReload,
])
/** Every Brandon dot Message. */
export type Message = typeof Message.Type

/** The tags that travel on the log: facts any guest may read. */
export const logMessageTags: ReadonlyArray<Message['_tag']> = [
  'AwardedPoints',
  'NotedPlayer',
  'PointedAtSection',
  'ChangedSections',
  'MirroredWallets',
  'RequestedReload',
]
