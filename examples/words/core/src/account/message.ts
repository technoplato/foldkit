import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { AccessIdentity, OriginFeatures } from '../origin.js'

// MESSAGE

/** The origin found a Scribe account for the Access email. */
export const FoundScribeAccount = m('FoundScribeAccount', {
  access: AccessIdentity,
  features: OriginFeatures,
})
/** The origin found no Scribe account for the Access email yet. */
export const FoundNoScribeAccount = m('FoundNoScribeAccount', {
  access: AccessIdentity,
  features: OriginFeatures,
})
/** No Cloudflare Access identity reached the origin. */
export const FoundNoAccessIdentity = m('FoundNoAccessIdentity')
/** The origin could not check the account. */
export const FailedCheckAccess = m('FailedCheckAccess', { reason: S.String })
/** The browser is signed in to the Scribe account. */
export const SucceededConnectAccount = m('SucceededConnectAccount')
/** Signing in to the Scribe account failed. */
export const FailedConnectAccount = m('FailedConnectAccount', {
  reason: S.String,
})
/** Instant reported no signed-in user while the account counted as connected. */
export const LostInstantSession = m('LostInstantSession')
/** The recheck timer fired while the page waits for the account. */
export const TickedAccountRecheck = m('TickedAccountRecheck')
/** The listener asked to check the account now. */
export const ClickedCheckAccountAgain = m('ClickedCheckAccountAgain')
/** The listener asked to sign out. */
export const ClickedSignOut = m('ClickedSignOut')
/** The browser signed out of Scribe's Instant app. */
export const CompletedSignOutOfScribe = m('CompletedSignOutOfScribe')
/** Signing out of Scribe's Instant app failed. */
export const FailedSignOutOfScribe = m('FailedSignOutOfScribe', {
  reason: S.String,
})
/** The browser started loading Cloudflare Access's logout page. */
export const CompletedLeaveForAccessLogout = m('CompletedLeaveForAccessLogout')
/** The listener asked to sign in again after signing out. */
export const ClickedSignInAgain = m('ClickedSignInAgain')
/** The listener asked to copy their Instant user id. */
export const ClickedCopyUserID = m('ClickedCopyUserID', { userID: S.String })
/** The listener asked to copy the link that opens the iPhone's Account screen. */
export const ClickedCopyAccountLink = m('ClickedCopyAccountLink')

/** Every account Message. */
export const Message = S.Union([
  FoundScribeAccount,
  FoundNoScribeAccount,
  FoundNoAccessIdentity,
  FailedCheckAccess,
  SucceededConnectAccount,
  FailedConnectAccount,
  LostInstantSession,
  TickedAccountRecheck,
  ClickedCheckAccountAgain,
  ClickedSignOut,
  CompletedSignOutOfScribe,
  FailedSignOutOfScribe,
  CompletedLeaveForAccessLogout,
  ClickedSignInAgain,
  ClickedCopyUserID,
  ClickedCopyAccountLink,
])
/** Every account Message. */
export type Message = typeof Message.Type

// OUT MESSAGE

/** The account asks the page to copy text and show a notice. */
export const RequestedCopy = m('RequestedCopy', {
  text: S.String,
  noticeText: S.String,
})

/** What the account tells the page. */
export const OutMessage = S.Union([RequestedCopy])
/** What the account tells the page. */
export type OutMessage = typeof OutMessage.Type
