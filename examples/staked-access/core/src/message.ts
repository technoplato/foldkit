import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { ProtocolFailure } from './model.js'
import {
  AccessGrant,
  ClaimRejection,
  ForfeitedStakeReceipt,
  RefundedStakeReceipt,
  SignedAccessClaim,
  StakeLock,
  VerificationDecision,
} from './protocolClient.js'

// MESSAGE

/** The host requested a signature over the exact draft claim. */
export const RequestedClaimSignature = m('RequestedClaimSignature')
/** SignAccessClaim produced a verified public signature proof. */
export const SucceededSignAccessClaim = m('SucceededSignAccessClaim', {
  claimId: S.String,
  signedClaim: SignedAccessClaim,
})
/** SignAccessClaim failed without exposing a host cause or secret. */
export const FailedSignAccessClaim = m('FailedSignAccessClaim', {
  claimId: S.String,
  failure: ProtocolFailure,
})
/** The host requested stake authorization and escrow locking. */
export const RequestedStakeAuthorization = m('RequestedStakeAuthorization')
/** AuthorizeAndLockStake locked the exact signed stake terms. */
export const SucceededAuthorizeAndLockStake = m(
  'SucceededAuthorizeAndLockStake',
  {
    claimId: S.String,
    lock: StakeLock,
  },
)
/** AuthorizeAndLockStake failed without exposing host details. */
export const FailedAuthorizeAndLockStake = m('FailedAuthorizeAndLockStake', {
  claimId: S.String,
  failure: ProtocolFailure,
})
/** The host requested verification of the signed, staked claim. */
export const RequestedClaimVerification = m('RequestedClaimVerification')
/** VerifyAccessClaim returned an approval or rejection. */
export const SucceededVerifyAccessClaim = m('SucceededVerifyAccessClaim', {
  escrowId: S.String,
  decision: VerificationDecision,
})
/** VerifyAccessClaim failed before adjudication completed. */
export const FailedVerifyAccessClaim = m('FailedVerifyAccessClaim', {
  escrowId: S.String,
  failure: ProtocolFailure,
})
/** The host requested a retry of the pending refund or forfeiture. */
export const RequestedStakeSettlement = m('RequestedStakeSettlement')
/** RefundStake refunded an approved claim's exact stake. */
export const SucceededRefundStake = m('SucceededRefundStake', {
  escrowId: S.String,
  grant: AccessGrant,
  receipt: RefundedStakeReceipt,
})
/** RefundStake failed without changing the access decision. */
export const FailedRefundStake = m('FailedRefundStake', {
  escrowId: S.String,
  grant: AccessGrant,
  failure: ProtocolFailure,
})
/** ForfeitStake forfeited a rejected claim's exact stake. */
export const SucceededForfeitStake = m('SucceededForfeitStake', {
  escrowId: S.String,
  rejection: ClaimRejection,
  receipt: ForfeitedStakeReceipt,
})
/** ForfeitStake failed without changing the rejection decision. */
export const FailedForfeitStake = m('FailedForfeitStake', {
  escrowId: S.String,
  rejection: ClaimRejection,
  failure: ProtocolFailure,
})

/** Every Message accepted by the Staked Access Program. */
export const Message = S.Union([
  RequestedClaimSignature,
  SucceededSignAccessClaim,
  FailedSignAccessClaim,
  RequestedStakeAuthorization,
  SucceededAuthorizeAndLockStake,
  FailedAuthorizeAndLockStake,
  RequestedClaimVerification,
  SucceededVerifyAccessClaim,
  FailedVerifyAccessClaim,
  RequestedStakeSettlement,
  SucceededRefundStake,
  FailedRefundStake,
  SucceededForfeitStake,
  FailedForfeitStake,
])
/** Every Message accepted by the Staked Access Program. */
export type Message = typeof Message.Type
