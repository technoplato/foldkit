import { Effect, Match as M } from 'effect'
import * as Command from 'foldkit/command'
import {
  WalletCrypto,
  type WalletCryptoError,
  WalletSigner,
  type WalletSignerError,
} from 'wallet-core-example'

import { AccessClaim } from './claim.js'
import {
  FailedAuthorizeAndLockStake,
  FailedForfeitStake,
  FailedRefundStake,
  FailedSignAccessClaim,
  FailedVerifyAccessClaim,
  type Message,
  SucceededAuthorizeAndLockStake,
  SucceededForfeitStake,
  SucceededRefundStake,
  SucceededSignAccessClaim,
  SucceededVerifyAccessClaim,
} from './message.js'
import {
  AuthorizingStake,
  FailedClaimSignature,
  FailedClaimVerification,
  FailedStakeAuthorization,
  FailedStakeForfeiture,
  FailedStakeRefund,
  ForfeitingStake,
  GrantedAccess,
  type Model,
  ProtocolFailure,
  type ProtocolFailureCode,
  type ProtocolOperation,
  RefundingStake,
  RejectedAccess,
  SignedClaim,
  SigningClaim,
  StakeLocked,
  VerifyingClaim,
} from './model.js'
import {
  type AccessGrant,
  ClaimAdjudicator,
  type ClaimAdjudicatorError,
  ClaimChallengeBuilder,
  type ClaimChallengeBuilderError,
  type ClaimRejection,
  SignedAccessClaim,
  StakeEscrow,
  type StakeEscrowError,
  type StakedAccessResources,
} from './protocolClient.js'

const failure = (
  operation: ProtocolOperation,
  code: ProtocolFailureCode,
): ProtocolFailure => ProtocolFailure.make({ operation, code })

const challengeFailure = (error: ClaimChallengeBuilderError) =>
  failure('BuildChallenge', error.code)

const signingFailure = (error: WalletSignerError) =>
  failure('SignClaim', error.code)

const cryptoFailure = (error: WalletCryptoError) =>
  failure('VerifySignature', error.code)

const escrowFailure = (
  operation: 'AuthorizeAndLockStake' | 'RefundStake' | 'ForfeitStake',
  error: StakeEscrowError,
) => failure(operation, error.code)

const adjudicatorFailure = (error: ClaimAdjudicatorError) =>
  failure('VerifyClaim', error.code)

/** Builds, signs, and verifies the canonical challenge for one exact claim. */
export const SignAccessClaim = Command.define(
  'SignAccessClaim',
  { claim: AccessClaim },
  SucceededSignAccessClaim,
  FailedSignAccessClaim,
)(({ claim }) =>
  Effect.gen(function* () {
    const challengeBuilder = yield* ClaimChallengeBuilder
    const signer = yield* WalletSigner
    const crypto = yield* WalletCrypto
    const challenge = yield* challengeBuilder
      .makeChallenge(claim)
      .pipe(Effect.mapError(challengeFailure))
    const proof = yield* signer
      .signChallenge(challenge)
      .pipe(Effect.mapError(signingFailure))
    const isVerified = yield* crypto
      .verifySignatureProof(challenge, proof)
      .pipe(Effect.mapError(cryptoFailure))
    if (isVerified) {
      return SucceededSignAccessClaim({
        claimId: claim.claimId,
        signedClaim: SignedAccessClaim.make({ claim, challenge, proof }),
      })
    } else {
      return yield* Effect.fail(
        failure('VerifySignature', 'VerificationFailed'),
      )
    }
  }).pipe(
    Effect.catch(protocolFailure =>
      Effect.succeed(
        FailedSignAccessClaim({
          claimId: claim.claimId,
          failure: protocolFailure,
        }),
      ),
    ),
  ),
)

/** Authorizes and locks the exact stake committed to by a signed claim. */
export const AuthorizeAndLockStake = Command.define(
  'AuthorizeAndLockStake',
  { signedClaim: SignedAccessClaim },
  SucceededAuthorizeAndLockStake,
  FailedAuthorizeAndLockStake,
)(({ signedClaim }) =>
  Effect.flatMap(StakeEscrow, escrow =>
    escrow.authorizeAndLock(signedClaim).pipe(
      Effect.map(lock =>
        SucceededAuthorizeAndLockStake({
          claimId: signedClaim.claim.claimId,
          lock,
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          FailedAuthorizeAndLockStake({
            claimId: signedClaim.claim.claimId,
            failure: escrowFailure('AuthorizeAndLockStake', error),
          }),
        ),
      ),
    ),
  ),
)

/** Verifies one signed claim after its exact stake has been locked. */
export const VerifyAccessClaim = Command.define(
  'VerifyAccessClaim',
  { signedClaim: SignedAccessClaim, lock: StakeLocked.fields.lock },
  SucceededVerifyAccessClaim,
  FailedVerifyAccessClaim,
)(({ signedClaim, lock }) =>
  Effect.flatMap(ClaimAdjudicator, adjudicator =>
    adjudicator.verify(signedClaim, lock).pipe(
      Effect.map(decision =>
        SucceededVerifyAccessClaim({ escrowId: lock.escrowId, decision }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          FailedVerifyAccessClaim({
            escrowId: lock.escrowId,
            failure: adjudicatorFailure(error),
          }),
        ),
      ),
    ),
  ),
)

/** Refunds the exact locked stake after access approval. */
export const RefundStake = Command.define(
  'RefundStake',
  {
    lock: RefundingStake.fields.lock,
    grant: RefundingStake.fields.grant,
  },
  SucceededRefundStake,
  FailedRefundStake,
)(({ lock, grant }) =>
  Effect.flatMap(StakeEscrow, escrow =>
    escrow.refund(lock, grant).pipe(
      Effect.map(receipt =>
        SucceededRefundStake({ escrowId: lock.escrowId, grant, receipt }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          FailedRefundStake({
            escrowId: lock.escrowId,
            grant,
            failure: escrowFailure('RefundStake', error),
          }),
        ),
      ),
    ),
  ),
)

/** Forfeits the exact locked stake after claim rejection. */
export const ForfeitStake = Command.define(
  'ForfeitStake',
  {
    lock: ForfeitingStake.fields.lock,
    rejection: ForfeitingStake.fields.rejection,
  },
  SucceededForfeitStake,
  FailedForfeitStake,
)(({ lock, rejection }) =>
  Effect.flatMap(StakeEscrow, escrow =>
    escrow.forfeit(lock, rejection).pipe(
      Effect.map(receipt =>
        SucceededForfeitStake({
          escrowId: lock.escrowId,
          rejection,
          receipt,
        }),
      ),
      Effect.catch(error =>
        Effect.succeed(
          FailedForfeitStake({
            escrowId: lock.escrowId,
            rejection,
            failure: escrowFailure('ForfeitStake', error),
          }),
        ),
      ),
    ),
  ),
)

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, StakedAccessResources>>,
]

const samePublicValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const isSignedClaimBound = (
  claimId: string,
  signedClaim: SignedAccessClaim,
): boolean =>
  signedClaim.claim.claimId === claimId &&
  signedClaim.challenge.challengeId === claimId &&
  signedClaim.proof.challengeId === claimId

const requestSignature = (model: Model): UpdateReturn => {
  if (model._tag === 'DraftClaim') {
    const nextModel = SigningClaim.make({ claim: model.claim })
    return [nextModel, [SignAccessClaim({ claim: model.claim })]]
  } else if (model._tag === 'FailedClaimSignature') {
    const nextModel = SigningClaim.make({ claim: model.claim })
    return [nextModel, [SignAccessClaim({ claim: model.claim })]]
  } else {
    return [model, []]
  }
}

const finishSignature = (
  model: Model,
  claimId: string,
  signedClaim: SignedAccessClaim,
): UpdateReturn => {
  if (
    model._tag === 'SigningClaim' &&
    model.claim.claimId === claimId &&
    isSignedClaimBound(claimId, signedClaim) &&
    samePublicValue(model.claim, signedClaim.claim)
  ) {
    return [SignedClaim.make({ signedClaim }), []]
  } else {
    return [model, []]
  }
}

const failSignature = (
  model: Model,
  claimId: string,
  protocolFailure: ProtocolFailure,
): UpdateReturn => {
  if (model._tag === 'SigningClaim' && model.claim.claimId === claimId) {
    return [
      FailedClaimSignature.make({
        claim: model.claim,
        failure: protocolFailure,
      }),
      [],
    ]
  } else {
    return [model, []]
  }
}

const requestStakeAuthorization = (model: Model): UpdateReturn => {
  if (model._tag === 'SignedClaim') {
    const nextModel = AuthorizingStake.make({
      signedClaim: model.signedClaim,
    })
    return [
      nextModel,
      [AuthorizeAndLockStake({ signedClaim: model.signedClaim })],
    ]
  } else if (model._tag === 'FailedStakeAuthorization') {
    const nextModel = AuthorizingStake.make({
      signedClaim: model.signedClaim,
    })
    return [
      nextModel,
      [AuthorizeAndLockStake({ signedClaim: model.signedClaim })],
    ]
  } else {
    return [model, []]
  }
}

const finishStakeAuthorization = (
  model: Model,
  claimId: string,
  lock: typeof StakeLocked.fields.lock.Type,
): UpdateReturn => {
  if (
    model._tag === 'AuthorizingStake' &&
    model.signedClaim.claim.claimId === claimId &&
    lock.claimId === claimId &&
    samePublicValue(lock.terms, model.signedClaim.claim.stake)
  ) {
    return [StakeLocked.make({ signedClaim: model.signedClaim, lock }), []]
  } else {
    return [model, []]
  }
}

const failStakeAuthorization = (
  model: Model,
  claimId: string,
  protocolFailure: ProtocolFailure,
): UpdateReturn => {
  if (
    model._tag === 'AuthorizingStake' &&
    model.signedClaim.claim.claimId === claimId
  ) {
    return [
      FailedStakeAuthorization.make({
        signedClaim: model.signedClaim,
        failure: protocolFailure,
      }),
      [],
    ]
  } else {
    return [model, []]
  }
}

const requestClaimVerification = (model: Model): UpdateReturn => {
  if (model._tag === 'StakeLocked') {
    const nextModel = VerifyingClaim.make({
      signedClaim: model.signedClaim,
      lock: model.lock,
    })
    return [
      nextModel,
      [VerifyAccessClaim({ signedClaim: model.signedClaim, lock: model.lock })],
    ]
  } else if (model._tag === 'FailedClaimVerification') {
    const nextModel = VerifyingClaim.make({
      signedClaim: model.signedClaim,
      lock: model.lock,
    })
    return [
      nextModel,
      [VerifyAccessClaim({ signedClaim: model.signedClaim, lock: model.lock })],
    ]
  } else {
    return [model, []]
  }
}

const beginSettlement = (
  model: Model,
  escrowId: string,
  decision: typeof SucceededVerifyAccessClaim.fields.decision.Type,
): UpdateReturn => {
  if (model._tag !== 'VerifyingClaim' || model.lock.escrowId !== escrowId) {
    return [model, []]
  }

  return M.value(decision).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      VerifiedClaim: ({ grant }) => {
        const isValidGrant =
          grant.claimId === model.signedClaim.claim.claimId &&
          samePublicValue(
            grant.capabilities,
            model.signedClaim.claim.requestedCapabilities,
          )
        if (isValidGrant) {
          const nextModel = RefundingStake.make({
            signedClaim: model.signedClaim,
            lock: model.lock,
            grant,
          })
          return [nextModel, [RefundStake({ lock: model.lock, grant })]]
        } else {
          return [
            FailedClaimVerification.make({
              signedClaim: model.signedClaim,
              lock: model.lock,
              failure: failure('VerifyClaim', 'InvalidEvidence'),
            }),
            [],
          ]
        }
      },
      RejectedClaim: ({ rejection }) => {
        if (rejection.claimId === model.signedClaim.claim.claimId) {
          const nextModel = ForfeitingStake.make({
            signedClaim: model.signedClaim,
            lock: model.lock,
            rejection,
          })
          return [nextModel, [ForfeitStake({ lock: model.lock, rejection })]]
        } else {
          return [
            FailedClaimVerification.make({
              signedClaim: model.signedClaim,
              lock: model.lock,
              failure: failure('VerifyClaim', 'InvalidEvidence'),
            }),
            [],
          ]
        }
      },
    }),
  )
}

const failClaimVerification = (
  model: Model,
  escrowId: string,
  protocolFailure: ProtocolFailure,
): UpdateReturn => {
  if (model._tag === 'VerifyingClaim' && model.lock.escrowId === escrowId) {
    return [
      FailedClaimVerification.make({
        signedClaim: model.signedClaim,
        lock: model.lock,
        failure: protocolFailure,
      }),
      [],
    ]
  } else {
    return [model, []]
  }
}

const requestStakeSettlement = (model: Model): UpdateReturn => {
  if (model._tag === 'FailedStakeRefund') {
    const nextModel = RefundingStake.make({
      signedClaim: model.signedClaim,
      lock: model.lock,
      grant: model.grant,
    })
    return [nextModel, [RefundStake({ lock: model.lock, grant: model.grant })]]
  } else if (model._tag === 'FailedStakeForfeiture') {
    const nextModel = ForfeitingStake.make({
      signedClaim: model.signedClaim,
      lock: model.lock,
      rejection: model.rejection,
    })
    return [
      nextModel,
      [ForfeitStake({ lock: model.lock, rejection: model.rejection })],
    ]
  } else {
    return [model, []]
  }
}

const finishRefund = (
  model: Model,
  escrowId: string,
  grant: AccessGrant,
  receipt: typeof SucceededRefundStake.fields.receipt.Type,
): UpdateReturn => {
  if (
    model._tag === 'RefundingStake' &&
    model.lock.escrowId === escrowId &&
    receipt.escrowId === escrowId &&
    samePublicValue(model.grant, grant)
  ) {
    return [
      GrantedAccess.make({
        signedClaim: model.signedClaim,
        lock: model.lock,
        grant,
        receipt,
      }),
      [],
    ]
  } else {
    return [model, []]
  }
}

const failRefund = (
  model: Model,
  escrowId: string,
  grant: AccessGrant,
  protocolFailure: ProtocolFailure,
): UpdateReturn => {
  if (
    model._tag === 'RefundingStake' &&
    model.lock.escrowId === escrowId &&
    samePublicValue(model.grant, grant)
  ) {
    return [
      FailedStakeRefund.make({
        signedClaim: model.signedClaim,
        lock: model.lock,
        grant,
        failure: protocolFailure,
      }),
      [],
    ]
  } else {
    return [model, []]
  }
}

const finishForfeiture = (
  model: Model,
  escrowId: string,
  rejection: ClaimRejection,
  receipt: typeof SucceededForfeitStake.fields.receipt.Type,
): UpdateReturn => {
  if (
    model._tag === 'ForfeitingStake' &&
    model.lock.escrowId === escrowId &&
    receipt.escrowId === escrowId &&
    samePublicValue(model.rejection, rejection)
  ) {
    return [
      RejectedAccess.make({
        signedClaim: model.signedClaim,
        lock: model.lock,
        rejection,
        receipt,
      }),
      [],
    ]
  } else {
    return [model, []]
  }
}

const failForfeiture = (
  model: Model,
  escrowId: string,
  rejection: ClaimRejection,
  protocolFailure: ProtocolFailure,
): UpdateReturn => {
  if (
    model._tag === 'ForfeitingStake' &&
    model.lock.escrowId === escrowId &&
    samePublicValue(model.rejection, rejection)
  ) {
    return [
      FailedStakeForfeiture.make({
        signedClaim: model.signedClaim,
        lock: model.lock,
        rejection,
        failure: protocolFailure,
      }),
      [],
    ]
  } else {
    return [model, []]
  }
}

/** Restores only idempotent in-flight protocol work from a persisted Model. */
export const restore = (model: Model): UpdateReturn =>
  M.value(model).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      DraftClaim: () => [model, []],
      SigningClaim: ({ claim }) => [model, [SignAccessClaim({ claim })]],
      FailedClaimSignature: () => [model, []],
      SignedClaim: () => [model, []],
      AuthorizingStake: ({ signedClaim }) => [
        model,
        [AuthorizeAndLockStake({ signedClaim })],
      ],
      FailedStakeAuthorization: () => [model, []],
      StakeLocked: () => [model, []],
      VerifyingClaim: ({ signedClaim, lock }) => [
        model,
        [VerifyAccessClaim({ signedClaim, lock })],
      ],
      FailedClaimVerification: () => [model, []],
      RefundingStake: ({ lock, grant }) => [
        model,
        [RefundStake({ lock, grant })],
      ],
      FailedStakeRefund: () => [model, []],
      ForfeitingStake: ({ lock, rejection }) => [
        model,
        [ForfeitStake({ lock, rejection })],
      ],
      FailedStakeForfeiture: () => [model, []],
      GrantedAccess: () => [model, []],
      RejectedAccess: () => [model, []],
    }),
  )

// UPDATE

/** Applies one Staked Access Message and returns its finite Commands. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      RequestedClaimSignature: () => requestSignature(model),
      SucceededSignAccessClaim: ({ claimId, signedClaim }) =>
        finishSignature(model, claimId, signedClaim),
      FailedSignAccessClaim: ({ claimId, failure: protocolFailure }) =>
        failSignature(model, claimId, protocolFailure),
      RequestedStakeAuthorization: () => requestStakeAuthorization(model),
      SucceededAuthorizeAndLockStake: ({ claimId, lock }) =>
        finishStakeAuthorization(model, claimId, lock),
      FailedAuthorizeAndLockStake: ({ claimId, failure: protocolFailure }) =>
        failStakeAuthorization(model, claimId, protocolFailure),
      RequestedClaimVerification: () => requestClaimVerification(model),
      SucceededVerifyAccessClaim: ({ escrowId, decision }) =>
        beginSettlement(model, escrowId, decision),
      FailedVerifyAccessClaim: ({ escrowId, failure: protocolFailure }) =>
        failClaimVerification(model, escrowId, protocolFailure),
      RequestedStakeSettlement: () => requestStakeSettlement(model),
      SucceededRefundStake: ({ escrowId, grant, receipt }) =>
        finishRefund(model, escrowId, grant, receipt),
      FailedRefundStake: ({ escrowId, grant, failure: protocolFailure }) =>
        failRefund(model, escrowId, grant, protocolFailure),
      SucceededForfeitStake: ({ escrowId, rejection, receipt }) =>
        finishForfeiture(model, escrowId, rejection, receipt),
      FailedForfeitStake: ({ escrowId, rejection, failure: protocolFailure }) =>
        failForfeiture(model, escrowId, rejection, protocolFailure),
    }),
  )
