import { Schema as S } from 'effect'
import { Currency, Network } from 'wallet-core-example'

/** A deterministic tape content address using the current UUID URI form. */
export const TapeContentAddress = S.String.check(
  S.isPattern(
    /^uuiduri:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ),
)
/** A deterministic tape content address using the current UUID URI form. */
export type TapeContentAddress = typeof TapeContentAddress.Type

/** A strictly positive exact stake quantity expressed in atomic units. */
export const StakeAtomicUnits = S.String.check(S.isPattern(/^[1-9][0-9]*$/))
/** A strictly positive exact stake quantity expressed in atomic units. */
export type StakeAtomicUnits = typeof StakeAtomicUnits.Type

/** A renderer-independent application and signing-domain binding. */
export const ApplicationBinding = S.Struct({
  applicationId: S.String,
  signingDomain: S.String,
})
/** A renderer-independent application and signing-domain binding. */
export type ApplicationBinding = typeof ApplicationBinding.Type

/** An opaque subject reference that avoids raw personally identifying data. */
export const OpaqueIdentityReference = S.Struct({
  namespace: S.String,
  subjectId: S.String,
  signingAccountId: S.String,
})
/** An opaque subject reference that avoids raw personally identifying data. */
export type OpaqueIdentityReference = typeof OpaqueIdentityReference.Type

/** A commitment to one exact replay tape and its derived state. */
export const TapeCommitment = S.Struct({
  contentAddress: TapeContentAddress,
  orderedMessageIds: S.Array(S.String),
  derivedStateHash: S.String,
})
/** A commitment to one exact replay tape and its derived state. */
export type TapeCommitment = typeof TapeCommitment.Type

/** One capability requested by an access claim. */
export const RequestedCapability = S.Struct({
  capabilityId: S.String,
  scope: S.String,
})
/** One capability requested by an access claim. */
export type RequestedCapability = typeof RequestedCapability.Type

/** Exact public stake terms signed with an access claim. */
export const StakeTerms = S.Struct({
  network: Network,
  asset: Currency,
  amountAtomicUnits: StakeAtomicUnits,
  treasury: S.String,
})
/** Exact public stake terms signed with an access claim. */
export type StakeTerms = typeof StakeTerms.Type

/** The adjudicator and policy committed to by an access claim. */
export const AdjudicatorReference = S.Struct({
  adjudicatorId: S.String,
  policyContentAddress: S.String,
})
/** The adjudicator and policy committed to by an access claim. */
export type AdjudicatorReference = typeof AdjudicatorReference.Type

/** The complete public claim whose canonical digest is signed. */
export const AccessClaim = S.Struct({
  claimId: S.String,
  protocolVersion: S.Int.check(S.isGreaterThanOrEqualTo(0)),
  application: ApplicationBinding,
  identityReference: OpaqueIdentityReference,
  tape: TapeCommitment,
  requestedCapabilities: S.Array(RequestedCapability),
  nonce: S.String,
  issuedAt: S.Number,
  expiresAt: S.Number,
  stake: StakeTerms,
  adjudicator: AdjudicatorReference,
})
/** The complete public claim whose canonical digest is signed. */
export type AccessClaim = typeof AccessClaim.Type
