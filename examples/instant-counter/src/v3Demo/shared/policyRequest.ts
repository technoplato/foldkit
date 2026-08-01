import { Option, Schema as S } from 'effect'
import { Synchronization } from 'foldkit'

import {
  InstantV3AppSubjectDigest,
  InstantV3CompositeKey,
  InstantV3EntityId,
  InstantV3Identity,
  InstantV3NonNegativeInteger,
  InstantV3PositiveInteger,
  InstantV3ProgramProtocolVersion,
  InstantV3ProgramSessionId,
  InstantV3Reason,
  InstantV3SessionEpochId,
  InstantV3TimestampMs,
  type V3ProgramStoreScope,
  type V3SharedProgramActiveSession,
  instantV3OriginPolicyProtocolVersion,
  instantV3ProgramProtocolVersion,
  makeInstantV3ProgramSessionLifecyclePositionKey,
  parseInstantV3ProgramSessionId,
  stringifyInstantV3CanonicalJson,
} from '@foldkit/instant'
import { i } from '@instantdb/core'

import {
  makeMultipleCountersV3AppSubjectDigest,
  makeMultipleCountersV3EntityId,
} from './identity.js'

/** The only Program that may use this demo-specific policy request boundary. */
export const multipleCountersV3PolicyProgramId = 'multiple-counters'

/** The only Multiple Counters Program version accepted by this boundary. */
export const multipleCountersV3PolicyProgramVersion = 2

const BoundedText = S.String.check(S.isLengthBetween(1, 128))
const Forbidden = S.optionalKey(S.Never)
const MultipleCountersProgramId = S.Literal(multipleCountersV3PolicyProgramId)
const MultipleCountersProgramVersion = S.Literal(
  multipleCountersV3PolicyProgramVersion,
)

/** The indexed synchronization modes that a Client may request. */
export const MultipleCountersV3RequestedModeTag = S.Literals([
  'Mirror',
  'SharedDomain',
  'Follow',
])
/** The indexed synchronization modes that a Client may request. */
export type MultipleCountersV3RequestedModeTag =
  typeof MultipleCountersV3RequestedModeTag.Type

const PolicyScopeFields = {
  appSubjectDigest: InstantV3AppSubjectDigest,
  instantAppId: BoundedText,
  programId: MultipleCountersProgramId,
  programVersion: MultipleCountersProgramVersion,
  protocolVersion: InstantV3ProgramProtocolVersion,
  sessionEpochId: InstantV3SessionEpochId,
  sessionId: InstantV3ProgramSessionId,
  subjectId: BoundedText,
}

const PolicyRequestFields = {
  ...PolicyScopeFields,
  expectedLifecycleGeneration: InstantV3PositiveInteger,
  expectedPolicyGeneration: InstantV3NonNegativeInteger,
  id: InstantV3EntityId,
  policyRequestId: InstantV3Identity,
  policyRequestPositionKey: InstantV3CompositeKey,
  requestedAtMs: InstantV3TimestampMs,
  requestedMode: Synchronization.Mode,
  requestedModeTag: MultipleCountersV3RequestedModeTag,
  requesterId: BoundedText,
}

const policyScopeIssue = (
  scope: Readonly<{
    appSubjectDigest: string
    instantAppId: string
    programId: string
    programVersion: number
    protocolVersion: number
    requesterId: string
    sessionEpochId: string
    sessionId: string
    subjectId: string
  }>,
) => {
  const maybeSessionIdentity = parseInstantV3ProgramSessionId(scope.sessionId)
  if (
    Option.isSome(maybeSessionIdentity) &&
    maybeSessionIdentity.value.appSubjectDigest === scope.appSubjectDigest &&
    maybeSessionIdentity.value.originPolicyProtocolVersion ===
      instantV3OriginPolicyProtocolVersion &&
    maybeSessionIdentity.value.programId === scope.programId &&
    maybeSessionIdentity.value.programVersion === scope.programVersion &&
    maybeSessionIdentity.value.sessionEpochId === scope.sessionEpochId &&
    scope.protocolVersion === instantV3ProgramProtocolVersion &&
    scope.appSubjectDigest ===
      makeMultipleCountersV3AppSubjectDigest(
        scope.instantAppId,
        scope.subjectId,
      ) &&
    scope.requesterId === scope.subjectId
  ) {
    return undefined
  } else {
    return {
      path: ['sessionId'],
      issue:
        'A policy record must match its exact authenticated app-subject and canonical Multiple Counters session scope.',
    }
  }
}

/** Derives the immutable identity of one Client policy request. */
export const makeMultipleCountersV3PolicyRequestPositionKey = (
  sessionId: string,
  policyRequestId: string,
): InstantV3CompositeKey =>
  InstantV3CompositeKey.make(
    stringifyInstantV3CanonicalJson([
      'MultipleCountersPolicyRequest',
      sessionId,
      'PolicyRequestId',
      policyRequestId,
    ]),
  )

/** Derives the unique terminal authority resolution identity for one request. */
export const makeMultipleCountersV3PolicyResolutionPositionKey = (
  sessionId: string,
  policyRequestId: string,
): InstantV3CompositeKey =>
  InstantV3CompositeKey.make(
    stringifyInstantV3CanonicalJson([
      'MultipleCountersPolicyResolution',
      sessionId,
      'PolicyRequestId',
      policyRequestId,
    ]),
  )

/** One immutable, offline-capable request to change synchronization mode. */
export const MultipleCountersV3PolicyRequestRecord = S.Struct(
  PolicyRequestFields,
).check(
  S.makeFilter(request => {
    const scopeIssue = policyScopeIssue(request)
    if (scopeIssue !== undefined) {
      return scopeIssue
    } else if (request.requestedMode._tag !== request.requestedModeTag) {
      return {
        path: ['requestedModeTag'],
        issue: 'The indexed requested mode must match the exact mode payload.',
      }
    } else if (
      request.policyRequestPositionKey !==
      makeMultipleCountersV3PolicyRequestPositionKey(
        request.sessionId,
        request.policyRequestId,
      )
    ) {
      return {
        path: ['policyRequestPositionKey'],
        issue: 'A policy request must use its exact session-scoped identity.',
      }
    } else {
      return undefined
    }
  }),
)
/** One immutable, offline-capable request to change synchronization mode. */
export type MultipleCountersV3PolicyRequestRecord =
  typeof MultipleCountersV3PolicyRequestRecord.Type

/** Constructs one exact policy request from the Processor's active session. */
export const makeMultipleCountersV3PolicyRequest = (
  scope: V3ProgramStoreScope,
  activeSession: V3SharedProgramActiveSession,
  requestedMode: Synchronization.Mode,
  input: Readonly<{
    policyRequestId: string
    requestedAtMs: number
  }>,
): MultipleCountersV3PolicyRequestRecord => {
  if (
    scope.programId !== multipleCountersV3PolicyProgramId ||
    scope.programVersion !== multipleCountersV3PolicyProgramVersion
  ) {
    throw new Error(
      'A Multiple Counters policy request requires the exact Program scope.',
    )
  }
  const policyRequestPositionKey =
    makeMultipleCountersV3PolicyRequestPositionKey(
      scope.sessionId,
      input.policyRequestId,
    )
  return MultipleCountersV3PolicyRequestRecord.make({
    ...scope,
    expectedLifecycleGeneration: activeSession.lifecycleGeneration,
    expectedPolicyGeneration: activeSession.sessionPolicy.generation,
    id: makeMultipleCountersV3EntityId(
      'PolicyRequest',
      policyRequestPositionKey,
    ),
    policyRequestId: input.policyRequestId,
    policyRequestPositionKey,
    programId: multipleCountersV3PolicyProgramId,
    programVersion: multipleCountersV3PolicyProgramVersion,
    requestedAtMs: input.requestedAtMs,
    requestedMode,
    requestedModeTag: requestedMode._tag,
    requesterId: scope.subjectId,
  })
}

const MultipleCountersV3AcceptedPolicyResolutionRecord = S.Struct({
  ...PolicyRequestFields,
  policyResolutionPositionKey: InstantV3CompositeKey,
  rejectionReason: Forbidden,
  resolvedAtMs: InstantV3TimestampMs,
  resolvedLifecycleGeneration: InstantV3PositiveInteger,
  resolvedLifecyclePositionKey: InstantV3CompositeKey,
  resolvedPolicyGeneration: InstantV3PositiveInteger,
  resolvingProcessorId: BoundedText,
  resolutionState: S.Literal('Accepted'),
})

const MultipleCountersV3RejectedPolicyResolutionRecord = S.Struct({
  ...PolicyRequestFields,
  policyResolutionPositionKey: InstantV3CompositeKey,
  rejectionReason: InstantV3Reason,
  resolvedAtMs: InstantV3TimestampMs,
  resolvedLifecycleGeneration: InstantV3PositiveInteger,
  resolvedLifecyclePositionKey: InstantV3CompositeKey,
  resolvedPolicyGeneration: InstantV3NonNegativeInteger,
  resolvingProcessorId: BoundedText,
  resolutionState: S.Literal('Rejected'),
})

/** The exact terminal authority outcome and audit snapshot for a policy request. */
export const MultipleCountersV3PolicyResolutionRecord = S.Union([
  MultipleCountersV3AcceptedPolicyResolutionRecord,
  MultipleCountersV3RejectedPolicyResolutionRecord,
]).check(
  S.makeFilter(resolution => {
    const scopeIssue = policyScopeIssue(resolution)
    if (scopeIssue !== undefined) {
      return scopeIssue
    } else if (resolution.requestedMode._tag !== resolution.requestedModeTag) {
      return {
        path: ['requestedModeTag'],
        issue: 'The indexed requested mode must match the exact mode payload.',
      }
    } else if (
      resolution.policyRequestPositionKey !==
        makeMultipleCountersV3PolicyRequestPositionKey(
          resolution.sessionId,
          resolution.policyRequestId,
        ) ||
      resolution.policyResolutionPositionKey !==
        makeMultipleCountersV3PolicyResolutionPositionKey(
          resolution.sessionId,
          resolution.policyRequestId,
        )
    ) {
      return {
        path: ['policyResolutionPositionKey'],
        issue:
          'A policy resolution must use the exact request and terminal identities.',
      }
    } else if (resolution.resolvedAtMs < resolution.requestedAtMs) {
      return {
        path: ['resolvedAtMs'],
        issue: 'A policy resolution cannot predate its request.',
      }
    } else if (
      resolution.resolvedLifecyclePositionKey !==
      makeInstantV3ProgramSessionLifecyclePositionKey(
        resolution.sessionId,
        resolution.resolvedLifecycleGeneration,
      )
    ) {
      return {
        path: ['resolvedLifecyclePositionKey'],
        issue:
          'A policy resolution must identify the exact observed session generation.',
      }
    } else if (
      resolution.resolutionState === 'Accepted' &&
      (resolution.resolvedLifecycleGeneration !==
        resolution.expectedLifecycleGeneration + 1 ||
        resolution.resolvedPolicyGeneration !==
          resolution.expectedPolicyGeneration + 1)
    ) {
      return {
        path: ['resolutionState'],
        issue:
          'An accepted policy request must append exactly the next lifecycle and policy generations.',
      }
    } else {
      return undefined
    }
  }),
)
/** The exact terminal authority outcome and audit snapshot for a policy request. */
export type MultipleCountersV3PolicyResolutionRecord =
  typeof MultipleCountersV3PolicyResolutionRecord.Type

/** Demo-specific InstantDB entities for policy requests and authority outcomes. */
export const MultipleCountersV3PolicyEntities = {
  multipleCountersV3PolicyRequestResolutions: i.entity({
    appSubjectDigest: i.string().indexed(),
    expectedLifecycleGeneration: i.number().indexed(),
    expectedPolicyGeneration: i.number().indexed(),
    instantAppId: i.string().indexed(),
    policyRequestId: i.string().indexed(),
    policyRequestPositionKey: i.string().indexed(),
    policyResolutionPositionKey: i.string().unique().indexed(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    protocolVersion: i.number().indexed(),
    rejectionReason: i.string().indexed().optional(),
    requestedAtMs: i.number().indexed(),
    requestedMode: i.json(),
    requestedModeTag: i.string().indexed(),
    requesterId: i.string().indexed(),
    resolvedAtMs: i.number().indexed(),
    resolvedLifecycleGeneration: i.number().indexed(),
    resolvedLifecyclePositionKey: i.string().indexed(),
    resolvedPolicyGeneration: i.number().indexed(),
    resolvingProcessorId: i.string().indexed(),
    resolutionState: i.string().indexed(),
    sessionEpochId: i.string().indexed(),
    sessionId: i.string().indexed(),
    subjectId: i.string().indexed(),
  }),
  multipleCountersV3PolicyRequests: i.entity({
    appSubjectDigest: i.string().indexed(),
    expectedLifecycleGeneration: i.number().indexed(),
    expectedPolicyGeneration: i.number().indexed(),
    instantAppId: i.string().indexed(),
    policyRequestId: i.string().indexed(),
    policyRequestPositionKey: i.string().unique().indexed(),
    programId: i.string().indexed(),
    programVersion: i.number(),
    protocolVersion: i.number().indexed(),
    requestedAtMs: i.number().indexed(),
    requestedMode: i.json(),
    requestedModeTag: i.string().indexed(),
    requesterId: i.string().indexed(),
    sessionEpochId: i.string().indexed(),
    sessionId: i.string().indexed(),
    subjectId: i.string().indexed(),
  }),
}
