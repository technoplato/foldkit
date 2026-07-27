import { Context, Data, Effect, Schema as S } from 'effect'
import {
  SignatureProof,
  SigningChallenge,
  WalletCrypto,
  WalletSigner,
} from 'wallet-core-example'

import { AccessClaim, RequestedCapability, StakeTerms } from './claim.js'

/** A claim paired with the exact challenge and public signature proof. */
export const SignedAccessClaim = S.Struct({
  claim: AccessClaim,
  challenge: SigningChallenge,
  proof: SignatureProof,
})
/** A claim paired with the exact challenge and public signature proof. */
export type SignedAccessClaim = typeof SignedAccessClaim.Type

/** Public evidence that the exact stake was locked for one claim. */
export const StakeLock = S.Struct({
  escrowId: S.String,
  claimId: AccessClaim.fields.claimId,
  terms: StakeTerms,
  lockedAt: S.Number,
})
/** Public evidence that the exact stake was locked for one claim. */
export type StakeLock = typeof StakeLock.Type

/** A capability grant issued after successful adjudication. */
export const AccessGrant = S.Struct({
  grantId: S.String,
  claimId: AccessClaim.fields.claimId,
  capabilities: S.Array(RequestedCapability),
  grantedAt: S.Number,
  expiresAt: S.Number,
})
/** A capability grant issued after successful adjudication. */
export type AccessGrant = typeof AccessGrant.Type

/** A public rejection issued after unsuccessful adjudication. */
export const ClaimRejection = S.Struct({
  rejectionId: S.String,
  claimId: AccessClaim.fields.claimId,
  reasonCode: S.String,
  evidenceContentAddress: S.String,
  adjudicatedAt: S.Number,
})
/** A public rejection issued after unsuccessful adjudication. */
export type ClaimRejection = typeof ClaimRejection.Type

/** An adjudicator verified the claim and issued access. */
export const VerifiedClaim = S.TaggedStruct('VerifiedClaim', {
  grant: AccessGrant,
})
/** An adjudicator rejected the claim with public evidence. */
export const RejectedClaim = S.TaggedStruct('RejectedClaim', {
  rejection: ClaimRejection,
})

/** Every adjudication outcome for a locked claim. */
export const VerificationDecision = S.Union([VerifiedClaim, RejectedClaim])
/** Every adjudication outcome for a locked claim. */
export type VerificationDecision = typeof VerificationDecision.Type

/** Public evidence that an approved claim's stake was refunded. */
export const RefundedStakeReceipt = S.TaggedStruct('RefundedStakeReceipt', {
  settlementId: S.String,
  escrowId: StakeLock.fields.escrowId,
  transactionReference: S.String,
  settledAt: S.Number,
})
/** Public evidence that an approved claim's stake was refunded. */
export type RefundedStakeReceipt = typeof RefundedStakeReceipt.Type

/** Public evidence that a rejected claim's stake was forfeited. */
export const ForfeitedStakeReceipt = S.TaggedStruct('ForfeitedStakeReceipt', {
  settlementId: S.String,
  escrowId: StakeLock.fields.escrowId,
  transactionReference: S.String,
  settledAt: S.Number,
})
/** Public evidence that a rejected claim's stake was forfeited. */
export type ForfeitedStakeReceipt = typeof ForfeitedStakeReceipt.Type

/** A sanitized challenge-building failure. */
export class ClaimChallengeBuilderError extends Data.TaggedError(
  'ClaimChallengeBuilderError',
)<{
  readonly code: 'CanonicalizationFailed' | 'HashingUnavailable'
}> {}

/** A sanitized escrow or settlement failure. */
export class StakeEscrowError extends Data.TaggedError('StakeEscrowError')<{
  readonly code:
    | 'Unavailable'
    | 'Denied'
    | 'ReplayDetected'
    | 'SettlementConflict'
}> {}

/** A sanitized adjudication failure. */
export class ClaimAdjudicatorError extends Data.TaggedError(
  'ClaimAdjudicatorError',
)<{
  readonly code: 'Unavailable' | 'InvalidEvidence'
}> {}

/** Canonical challenge construction selected by the host. */
export type ClaimChallengeBuilderService = Readonly<{
  makeChallenge: (
    claim: AccessClaim,
  ) => Effect.Effect<typeof SigningChallenge.Type, ClaimChallengeBuilderError>
}>

/** An injected canonical challenge builder. */
export class ClaimChallengeBuilder extends Context.Service<
  ClaimChallengeBuilder,
  ClaimChallengeBuilderService
>()('StakedAccess/ClaimChallengeBuilder') {}

/** Stake authorization, escrow, and settlement selected by the host. */
export type StakeEscrowService = Readonly<{
  authorizeAndLock: (
    signedClaim: SignedAccessClaim,
  ) => Effect.Effect<StakeLock, StakeEscrowError>
  refund: (
    lock: StakeLock,
    grant: AccessGrant,
  ) => Effect.Effect<RefundedStakeReceipt, StakeEscrowError>
  forfeit: (
    lock: StakeLock,
    rejection: ClaimRejection,
  ) => Effect.Effect<ForfeitedStakeReceipt, StakeEscrowError>
}>

/** An injected stake escrow implementation. */
export class StakeEscrow extends Context.Service<
  StakeEscrow,
  StakeEscrowService
>()('StakedAccess/StakeEscrow') {}

/** Claim verification selected by the host. */
export type ClaimAdjudicatorService = Readonly<{
  verify: (
    signedClaim: SignedAccessClaim,
    lock: StakeLock,
  ) => Effect.Effect<VerificationDecision, ClaimAdjudicatorError>
}>

/** An injected access-claim adjudicator. */
export class ClaimAdjudicator extends Context.Service<
  ClaimAdjudicator,
  ClaimAdjudicatorService
>()('StakedAccess/ClaimAdjudicator') {}

/** Every service required by the Staked Access Program. */
export type StakedAccessResources =
  | ClaimChallengeBuilder
  | StakeEscrow
  | ClaimAdjudicator
  | WalletSigner
  | WalletCrypto
