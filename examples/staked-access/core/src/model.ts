import { Schema as S } from 'effect'

import { AccessClaim } from './claim.js'
import {
  AccessGrant,
  ClaimRejection,
  ForfeitedStakeReceipt,
  RefundedStakeReceipt,
  SignedAccessClaim,
  StakeLock,
} from './protocolClient.js'

// MODEL

/** A public protocol operation that can fail. */
export const ProtocolOperation = S.Literals([
  'BuildChallenge',
  'SignClaim',
  'VerifySignature',
  'AuthorizeAndLockStake',
  'VerifyClaim',
  'RefundStake',
  'ForfeitStake',
])
/** A public protocol operation that can fail. */
export type ProtocolOperation = typeof ProtocolOperation.Type

/** A sanitized failure code safe to journal and replay. */
export const ProtocolFailureCode = S.Literals([
  'Unavailable',
  'Denied',
  'UnsupportedAccount',
  'InvalidPayload',
  'VerificationFailed',
  'CanonicalizationFailed',
  'HashingUnavailable',
  'ReplayDetected',
  'SettlementConflict',
  'InvalidEvidence',
])
/** A sanitized failure code safe to journal and replay. */
export type ProtocolFailureCode = typeof ProtocolFailureCode.Type

/** A sanitized protocol failure with no host cause or secret material. */
export const ProtocolFailure = S.Struct({
  operation: ProtocolOperation,
  code: ProtocolFailureCode,
})
/** A sanitized protocol failure with no host cause or secret material. */
export type ProtocolFailure = typeof ProtocolFailure.Type

/** The access claim is ready for review and signing. */
export const DraftClaim = S.TaggedStruct('DraftClaim', {
  claim: AccessClaim,
})
/** The claim-signing Command is in flight. */
export const SigningClaim = S.TaggedStruct('SigningClaim', {
  claim: AccessClaim,
})
/** Claim signing failed with a sanitized failure. */
export const FailedClaimSignature = S.TaggedStruct('FailedClaimSignature', {
  claim: AccessClaim,
  failure: ProtocolFailure,
})
/** The exact claim has a verified public signature proof. */
export const SignedClaim = S.TaggedStruct('SignedClaim', {
  signedClaim: SignedAccessClaim,
})
/** Stake authorization and escrow locking are in flight. */
export const AuthorizingStake = S.TaggedStruct('AuthorizingStake', {
  signedClaim: SignedAccessClaim,
})
/** Stake authorization or escrow locking failed. */
export const FailedStakeAuthorization = S.TaggedStruct(
  'FailedStakeAuthorization',
  {
    signedClaim: SignedAccessClaim,
    failure: ProtocolFailure,
  },
)
/** The exact stake is locked for the signed claim. */
export const StakeLocked = S.TaggedStruct('StakeLocked', {
  signedClaim: SignedAccessClaim,
  lock: StakeLock,
})
/** Claim verification is in flight against the committed adjudicator. */
export const VerifyingClaim = S.TaggedStruct('VerifyingClaim', {
  signedClaim: SignedAccessClaim,
  lock: StakeLock,
})
/** Claim verification failed before an approval or rejection. */
export const FailedClaimVerification = S.TaggedStruct(
  'FailedClaimVerification',
  {
    signedClaim: SignedAccessClaim,
    lock: StakeLock,
    failure: ProtocolFailure,
  },
)
/** An approved claim is waiting for its exact stake refund. */
export const RefundingStake = S.TaggedStruct('RefundingStake', {
  signedClaim: SignedAccessClaim,
  lock: StakeLock,
  grant: AccessGrant,
})
/** Refund settlement failed after access approval. */
export const FailedStakeRefund = S.TaggedStruct('FailedStakeRefund', {
  signedClaim: SignedAccessClaim,
  lock: StakeLock,
  grant: AccessGrant,
  failure: ProtocolFailure,
})
/** A rejected claim is waiting for its exact stake forfeiture. */
export const ForfeitingStake = S.TaggedStruct('ForfeitingStake', {
  signedClaim: SignedAccessClaim,
  lock: StakeLock,
  rejection: ClaimRejection,
})
/** Forfeiture settlement failed after claim rejection. */
export const FailedStakeForfeiture = S.TaggedStruct('FailedStakeForfeiture', {
  signedClaim: SignedAccessClaim,
  lock: StakeLock,
  rejection: ClaimRejection,
  failure: ProtocolFailure,
})
/** Access was granted and the exact stake was refunded. */
export const GrantedAccess = S.TaggedStruct('GrantedAccess', {
  signedClaim: SignedAccessClaim,
  lock: StakeLock,
  grant: AccessGrant,
  receipt: RefundedStakeReceipt,
})
/** Access was rejected and the exact stake was forfeited. */
export const RejectedAccess = S.TaggedStruct('RejectedAccess', {
  signedClaim: SignedAccessClaim,
  lock: StakeLock,
  rejection: ClaimRejection,
  receipt: ForfeitedStakeReceipt,
})

/** The complete renderer-independent Staked Access Model. */
export const Model = S.Union([
  DraftClaim,
  SigningClaim,
  FailedClaimSignature,
  SignedClaim,
  AuthorizingStake,
  FailedStakeAuthorization,
  StakeLocked,
  VerifyingClaim,
  FailedClaimVerification,
  RefundingStake,
  FailedStakeRefund,
  ForfeitingStake,
  FailedStakeForfeiture,
  GrantedAccess,
  RejectedAccess,
])
/** The complete renderer-independent Staked Access Model. */
export type Model = typeof Model.Type
