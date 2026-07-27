import { Context, Effect, Hash, Layer } from 'effect'
import { SigningChallenge, type WalletResources } from 'wallet-core-example'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'

import { type AccessClaim } from './claim.js'
import {
  AccessGrant,
  ClaimAdjudicator,
  ClaimChallengeBuilder,
  ClaimRejection,
  ForfeitedStakeReceipt,
  RefundedStakeReceipt,
  RejectedClaim,
  StakeEscrow,
  StakeLock,
  type StakedAccessResources,
  VerifiedClaim,
} from './protocolClient.js'

/** The deterministic adjudication selected by the simulated Layer. */
export type SimulatedAdjudication = 'Grant' | 'Reject'

/** Every service supplied by the complete simulated Layer. */
export type SimulatedStakedAccessResources =
  | StakedAccessResources
  | WalletResources

const simulatedTime = 1_785_129_660_000

const digestHexForClaim = (claim: AccessClaim): string => {
  const segment = (Hash.string(JSON.stringify(claim)) >>> 0)
    .toString(16)
    .padStart(8, '0')
  return segment.repeat(8)
}

const makeSimulatedProtocolContext = (adjudication: SimulatedAdjudication) => {
  const challengeBuilder = ClaimChallengeBuilder.of({
    makeChallenge: claim =>
      Effect.succeed(
        SigningChallenge.make({
          challengeId: claim.claimId,
          accountId: claim.identityReference.signingAccountId,
          digest: {
            algorithm: 'Sha256',
            domain: claim.application.signingDomain,
            digestHex: digestHexForClaim(claim),
          },
        }),
      ),
  })
  const escrow = StakeEscrow.of({
    authorizeAndLock: signedClaim =>
      Effect.succeed(
        StakeLock.make({
          escrowId: `simulated-escrow-${signedClaim.claim.claimId}`,
          claimId: signedClaim.claim.claimId,
          terms: signedClaim.claim.stake,
          lockedAt: simulatedTime,
        }),
      ),
    refund: (lock, grant) =>
      Effect.succeed(
        RefundedStakeReceipt.make({
          settlementId: `simulated-refund-${grant.grantId}`,
          escrowId: lock.escrowId,
          transactionReference: `simulated:refund:${lock.escrowId}`,
          settledAt: simulatedTime + 2_000,
        }),
      ),
    forfeit: (lock, rejection) =>
      Effect.succeed(
        ForfeitedStakeReceipt.make({
          settlementId: `simulated-forfeit-${rejection.rejectionId}`,
          escrowId: lock.escrowId,
          transactionReference: `simulated:forfeit:${lock.escrowId}`,
          settledAt: simulatedTime + 2_000,
        }),
      ),
  })
  const adjudicator = ClaimAdjudicator.of({
    verify: (signedClaim, _lock) => {
      if (adjudication === 'Grant') {
        return Effect.succeed(
          VerifiedClaim.make({
            grant: AccessGrant.make({
              grantId: `simulated-grant-${signedClaim.claim.claimId}`,
              claimId: signedClaim.claim.claimId,
              capabilities: signedClaim.claim.requestedCapabilities,
              grantedAt: simulatedTime + 1_000,
              expiresAt: signedClaim.claim.expiresAt,
            }),
          }),
        )
      } else {
        return Effect.succeed(
          RejectedClaim.make({
            rejection: ClaimRejection.make({
              rejectionId: `simulated-rejection-${signedClaim.claim.claimId}`,
              claimId: signedClaim.claim.claimId,
              reasonCode: 'EvidenceDidNotSatisfyPolicy',
              evidenceContentAddress:
                signedClaim.claim.adjudicator.policyContentAddress,
              adjudicatedAt: simulatedTime + 1_000,
            }),
          }),
        )
      }
    },
  })

  return Context.make(ClaimChallengeBuilder, challengeBuilder).pipe(
    Context.add(StakeEscrow, escrow),
    Context.add(ClaimAdjudicator, adjudicator),
  )
}

/** Builds deterministic protocol services for one adjudication outcome. */
export const makeSimulatedProtocolResources = (
  adjudication: SimulatedAdjudication,
) => Layer.succeedContext(makeSimulatedProtocolContext(adjudication))

/** Builds complete deterministic wallet and protocol resources. */
export const makeSimulatedStakedAccessResources = (
  adjudication: SimulatedAdjudication,
): Layer.Layer<SimulatedStakedAccessResources> =>
  Layer.merge(
    SimulatedWalletResources,
    makeSimulatedProtocolResources(adjudication),
  )

/** Complete deterministic resources that grant access and refund the stake. */
export const SimulatedGrantStakedAccessResources =
  makeSimulatedStakedAccessResources('Grant')

/** Complete deterministic resources that reject access and forfeit the stake. */
export const SimulatedRejectStakedAccessResources =
  makeSimulatedStakedAccessResources('Reject')
