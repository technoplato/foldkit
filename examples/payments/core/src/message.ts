import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { Receipt, SessionOffer } from './processor.js'
import { CredentialFieldId, RailId } from './rail/index.js'

/** Host selected a merchant rail. */
export const SelectedRail = m('SelectedRail', { rail: RailId })
/** Host recorded that a credential slot is filled. The secret stays in the adapter. */
export const RecordedCredentialPresence = m('RecordedCredentialPresence', {
  field: CredentialFieldId,
  isPresent: S.Boolean,
})
/** Host cleared every credential slot. */
export const ClearedCredentials = m('ClearedCredentials')
/** Host connected a wallet. */
export const ConnectedWallet = m('ConnectedWallet')
/** Host disconnected a wallet. */
export const DisconnectedWallet = m('DisconnectedWallet')
/** Host chose the resource being sold. */
export const SelectedResource = m('SelectedResource', {
  slug: S.String,
  title: S.String,
  amountAtomic: S.String,
  origin: S.String,
})
/** Host requested a provider session on the selected rail. */
export const RequestedSession = m('RequestedSession')
/** Processor created a provider session. */
export const SucceededCreateSession = m('SucceededCreateSession', {
  offer: SessionOffer,
})
/** Processor could not create a provider session. */
export const FailedCreateSession = m('FailedCreateSession', { why: S.String })
/** Host requested verification of the current offer. */
export const RequestedVerify = m('RequestedVerify', {
  sessionId: S.optionalKey(S.String),
  orderId: S.optionalKey(S.String),
  paymentIntentId: S.optionalKey(S.String),
  checkoutId: S.optionalKey(S.String),
})
/** Processor verified a provider session. */
export const SucceededVerify = m('SucceededVerify', { receipt: Receipt })
/** Processor could not verify a provider session. */
export const FailedVerify = m('FailedVerify', { why: S.String })
/** Host asked to return to idle checkout. */
export const ResetCheckout = m('ResetCheckout')

/** Every Message accepted by the Payments Program. */
export const Message = S.Union([
  SelectedRail,
  RecordedCredentialPresence,
  ClearedCredentials,
  ConnectedWallet,
  DisconnectedWallet,
  SelectedResource,
  RequestedSession,
  SucceededCreateSession,
  FailedCreateSession,
  RequestedVerify,
  SucceededVerify,
  FailedVerify,
  ResetCheckout,
])
/** A Payments Message value. */
export type Message = typeof Message.Type
