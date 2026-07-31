import { Array, Match as M, Option, Schema as S } from 'effect'

import { makeInstantMessageProposalTransaction } from '@foldkit/instant'
import { InstantAPIError } from '@instantdb/core'

import { makeBrowserDatabase } from '../client/database.js'
import {
  type CheckClaimIsolationRequest,
  type CheckForeignIsolationRequest,
  CheckedClaimIsolation,
  CheckedForeignIsolation,
  PublicClientRequest,
  type PublicClientRequest as PublicClientRequestType,
  PublicClientResponse,
  type PublicClientResponse as PublicClientResponseType,
  type SubmitProposalRequest,
  SubmittedProposal,
} from './protocol.js'

const isPermissionDenied = (error: unknown): boolean =>
  (error instanceof InstantAPIError &&
    error.body?.type === 'permission-denied') ||
  (typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'permission-denied') ||
  (typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'InstantError' &&
    'hint' in error &&
    typeof error.hint === 'object' &&
    error.hint !== null &&
    'input' in error.hint &&
    'expected' in error.hint &&
    typeof error.hint.expected === 'string')

const submitProposal = async (
  request: SubmitProposalRequest,
): Promise<PublicClientResponseType> => {
  const database = makeBrowserDatabase()
  const currentUser = await database.getAuth()
  const didAuthenticateExpectedSubject =
    currentUser?.id === request.expectedSubjectId
  if (!didAuthenticateExpectedSubject) {
    return SubmittedProposal.make({
      didAuthenticateExpectedSubject,
      didSubmitProposal: false,
    })
  }
  if (
    request.proposal.actorId !== request.expectedSubjectId ||
    request.proposal.subjectId !== request.expectedSubjectId
  ) {
    throw new Error('The proposal does not target the authenticated subject.')
  }

  const didSubmitProposal = await database
    .transact(
      makeInstantMessageProposalTransaction(database.tx, request.proposal),
    )
    .then(
      () => true,
      () => false,
    )
  return SubmittedProposal.make({
    didAuthenticateExpectedSubject,
    didSubmitProposal,
  })
}

const checkForeignIsolation = async (
  request: CheckForeignIsolationRequest,
): Promise<PublicClientResponseType> => {
  const database = makeBrowserDatabase()
  const currentUser = await database.getAuth()
  const didAuthenticateExpectedSubject =
    currentUser?.id === request.expectedSubjectId
  if (!didAuthenticateExpectedSubject) {
    return CheckedForeignIsolation.make({
      didAuthenticateExpectedSubject,
      didRejectForeignProposal: false,
      failureStage: 'Authentication',
      foundNoForeignAcceptedOccurrences: false,
      foundNoForeignProgramSessions: false,
    })
  }
  if (
    request.expectedSubjectId === request.foreignSubjectId ||
    request.proposal.actorId !== request.expectedSubjectId ||
    request.proposal.sessionId !== request.foreignSessionId ||
    request.proposal.subjectId !== request.foreignSubjectId
  ) {
    throw new Error('The isolation probe does not target a foreign subject.')
  }

  const maybeVisibility = await database
    .queryOnce({
      foldkitAcceptedMessageOccurrences: {
        $: {
          where: {
            and: [
              { sessionId: request.foreignSessionId },
              { subjectId: request.foreignSubjectId },
            ],
          },
        },
      },
      foldkitProgramSessions: {
        $: {
          where: {
            and: [
              { sessionId: request.foreignSessionId },
              { subjectId: request.foreignSubjectId },
            ],
          },
        },
      },
    })
    .then(
      result =>
        Option.some({
          foundNoForeignAcceptedOccurrences: Array.isReadonlyArrayEmpty(
            result.data.foldkitAcceptedMessageOccurrences,
          ),
          foundNoForeignProgramSessions: Array.isReadonlyArrayEmpty(
            result.data.foldkitProgramSessions,
          ),
        }),
      error => {
        if (isPermissionDenied(error)) {
          return Option.some({
            foundNoForeignAcceptedOccurrences: true,
            foundNoForeignProgramSessions: true,
          })
        }
        return Option.none()
      },
    )
  if (Option.isNone(maybeVisibility)) {
    return CheckedForeignIsolation.make({
      didAuthenticateExpectedSubject,
      didRejectForeignProposal: false,
      failureStage: 'Read',
      foundNoForeignAcceptedOccurrences: false,
      foundNoForeignProgramSessions: false,
    })
  }
  const didRejectForeignProposal = await database
    .transact(
      makeInstantMessageProposalTransaction(database.tx, request.proposal),
    )
    .then(
      () => false,
      error => isPermissionDenied(error),
    )
  if (!didRejectForeignProposal) {
    return CheckedForeignIsolation.make({
      didAuthenticateExpectedSubject,
      didRejectForeignProposal,
      failureStage: 'Mutation',
      foundNoForeignAcceptedOccurrences:
        maybeVisibility.value.foundNoForeignAcceptedOccurrences,
      foundNoForeignProgramSessions:
        maybeVisibility.value.foundNoForeignProgramSessions,
    })
  }

  return CheckedForeignIsolation.make({
    didAuthenticateExpectedSubject,
    didRejectForeignProposal,
    failureStage: 'None',
    foundNoForeignAcceptedOccurrences:
      maybeVisibility.value.foundNoForeignAcceptedOccurrences,
    foundNoForeignProgramSessions:
      maybeVisibility.value.foundNoForeignProgramSessions,
  })
}

const checkClaimIsolation = async (
  request: CheckClaimIsolationRequest,
): Promise<PublicClientResponseType> => {
  const database = makeBrowserDatabase()
  const currentUser = await database.getAuth()
  const didAuthenticateExpectedSubject =
    currentUser?.id === request.expectedSubjectId
  if (!didAuthenticateExpectedSubject) {
    return CheckedClaimIsolation.make({
      didAuthenticateExpectedSubject,
      didRejectClaimReassignment: false,
      didRefreshOwnClaim: false,
    })
  }
  if (request.expectedSubjectId === request.forbiddenSubjectId) {
    throw new Error('The claim isolation probe did not change the subject.')
  }
  const claimEntity = database.tx.instantCounterSessionClaims[request.claimId]
  if (claimEntity === undefined) {
    throw new Error('The claim isolation probe did not resolve its claim.')
  }

  const didRefreshOwnClaim = await database
    .transact(claimEntity.update({ claimedAtMs: request.refreshedClaimedAtMs }))
    .then(
      () => true,
      () => false,
    )
  if (!didRefreshOwnClaim) {
    return CheckedClaimIsolation.make({
      didAuthenticateExpectedSubject,
      didRejectClaimReassignment: false,
      didRefreshOwnClaim,
    })
  }

  const didRejectClaimReassignment = await database
    .transact(
      claimEntity.update({
        claimedAtMs: Date.now(),
        subjectId: request.forbiddenSubjectId,
      }),
    )
    .then(
      () => false,
      error => isPermissionDenied(error),
    )
  return CheckedClaimIsolation.make({
    didAuthenticateExpectedSubject,
    didRejectClaimReassignment,
    didRefreshOwnClaim,
  })
}

const makeFailedResponse = (
  request: PublicClientRequestType,
): PublicClientResponseType =>
  M.value(request).pipe(
    M.tagsExhaustive({
      CheckClaimIsolation: () =>
        CheckedClaimIsolation.make({
          didAuthenticateExpectedSubject: false,
          didRejectClaimReassignment: false,
          didRefreshOwnClaim: false,
        }),
      CheckForeignIsolation: () =>
        CheckedForeignIsolation.make({
          didAuthenticateExpectedSubject: false,
          didRejectForeignProposal: false,
          failureStage: 'Unexpected',
          foundNoForeignAcceptedOccurrences: false,
          foundNoForeignProgramSessions: false,
        }),
      SubmitProposal: () =>
        SubmittedProposal.make({
          didAuthenticateExpectedSubject: false,
          didSubmitProposal: false,
        }),
    }),
  )

/** Runs one token-free acceptance probe through the authenticated browser SDK. */
export const runBrowserProbe = async (
  input: unknown,
): Promise<PublicClientResponseType> => {
  const maybeRequest = S.decodeUnknownOption(PublicClientRequest, {
    onExcessProperty: 'error',
  })(input)
  if (Option.isNone(maybeRequest)) {
    throw new Error('The browser acceptance probe received an invalid request.')
  }
  const request = maybeRequest.value
  const response = await M.value(request)
    .pipe(
      M.tagsExhaustive({
        CheckClaimIsolation: request => checkClaimIsolation(request),
        CheckForeignIsolation: request => checkForeignIsolation(request),
        SubmitProposal: request => submitProposal(request),
      }),
    )
    .catch(() => makeFailedResponse(request))
  return S.encodeSync(PublicClientResponse)(response)
}
