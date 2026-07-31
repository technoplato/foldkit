import { Schema as S } from 'effect'

import { InstantMessageProposalRecord } from '@foldkit/instant'

const NonEmptyString = S.String.check(S.isNonEmpty())

/** Requests one authenticated public-client proposal transaction. */
export const SubmitProposalRequest = S.TaggedStruct('SubmitProposal', {
  expectedSubjectId: NonEmptyString,
  proposal: InstantMessageProposalRecord,
})

/** Requests one authenticated public-client proposal transaction. */
export type SubmitProposalRequest = typeof SubmitProposalRequest.Type

/** Requests foreign-subject read and write isolation checks. */
export const CheckForeignIsolationRequest = S.TaggedStruct(
  'CheckForeignIsolation',
  {
    expectedSubjectId: NonEmptyString,
    foreignSessionId: NonEmptyString,
    foreignSubjectId: NonEmptyString,
    proposal: InstantMessageProposalRecord,
  },
)

/** Requests foreign-subject read and write isolation checks. */
export type CheckForeignIsolationRequest =
  typeof CheckForeignIsolationRequest.Type

/** Requests an attempted reassignment of the authenticated subject's claim. */
export const CheckClaimIsolationRequest = S.TaggedStruct(
  'CheckClaimIsolation',
  {
    claimId: NonEmptyString,
    expectedSubjectId: NonEmptyString,
    forbiddenSubjectId: NonEmptyString,
    refreshedClaimedAtMs: S.Int,
  },
)

/** Requests an attempted reassignment of the authenticated subject's claim. */
export type CheckClaimIsolationRequest = typeof CheckClaimIsolationRequest.Type

/** Every strict request accepted by the public live-acceptance browser probe. */
export const PublicClientRequest = S.Union([
  SubmitProposalRequest,
  CheckForeignIsolationRequest,
  CheckClaimIsolationRequest,
])

/** Every strict request accepted by the public live-acceptance browser probe. */
export type PublicClientRequest = typeof PublicClientRequest.Type

/** Reports a sanitized public-client proposal outcome. */
export const SubmittedProposal = S.TaggedStruct('SubmittedProposal', {
  didAuthenticateExpectedSubject: S.Boolean,
  didSubmitProposal: S.Boolean,
})

/** Reports a sanitized public-client proposal outcome. */
export type SubmittedProposal = typeof SubmittedProposal.Type

/** Reports sanitized foreign-subject isolation outcomes. */
export const CheckedForeignIsolation = S.TaggedStruct(
  'CheckedForeignIsolation',
  {
    didAuthenticateExpectedSubject: S.Boolean,
    didRejectForeignProposal: S.Boolean,
    failureStage: S.Literals([
      'None',
      'Authentication',
      'Read',
      'Mutation',
      'Unexpected',
    ]),
    foundNoForeignAcceptedOccurrences: S.Boolean,
    foundNoForeignProgramSessions: S.Boolean,
  },
)

/** Reports sanitized foreign-subject isolation outcomes. */
export type CheckedForeignIsolation = typeof CheckedForeignIsolation.Type

/** Reports a sanitized session-claim reassignment probe outcome. */
export const CheckedClaimIsolation = S.TaggedStruct('CheckedClaimIsolation', {
  didAuthenticateExpectedSubject: S.Boolean,
  didRejectClaimReassignment: S.Boolean,
  didRefreshOwnClaim: S.Boolean,
})

/** Reports a sanitized session-claim reassignment probe outcome. */
export type CheckedClaimIsolation = typeof CheckedClaimIsolation.Type

/** Every sanitized response emitted by the public live-acceptance browser probe. */
export const PublicClientResponse = S.Union([
  SubmittedProposal,
  CheckedForeignIsolation,
  CheckedClaimIsolation,
])

/** Every sanitized response emitted by the public live-acceptance browser probe. */
export type PublicClientResponse = typeof PublicClientResponse.Type
