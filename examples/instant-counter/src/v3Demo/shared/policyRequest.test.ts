import { Option, Schema as S } from 'effect'
import { Synchronization } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  instantV3ProgramProtocolVersion,
  makeInstantV3ProgramSessionLifecyclePositionKey,
} from '@foldkit/instant'

import { makeMultipleCountersV3SessionIdentity } from './identity.js'
import {
  MultipleCountersV3PolicyEntities,
  MultipleCountersV3PolicyRequestRecord,
  MultipleCountersV3PolicyResolutionRecord,
  makeMultipleCountersV3PolicyRequest,
  makeMultipleCountersV3PolicyRequestPositionKey,
  makeMultipleCountersV3PolicyResolutionPositionKey,
  multipleCountersV3PolicyProgramId,
  multipleCountersV3PolicyProgramVersion,
} from './policyRequest.js'

const instantAppId = 'instant-v3-demo-app'
const subjectId = 'authenticated-subject'
const sessionIdentity = makeMultipleCountersV3SessionIdentity({
  instantAppId,
  sessionEpochSeed: 'policy-request-session',
  subjectId,
})
const requestScope = {
  appSubjectDigest: sessionIdentity.appSubjectDigest,
  instantAppId,
  protocolVersion: instantV3ProgramProtocolVersion,
  requesterId: subjectId,
  sessionEpochId: sessionIdentity.sessionEpochId,
  sessionId: sessionIdentity.sessionId,
  subjectId,
}

const makePolicyRequest = (mode: Synchronization.Mode) => {
  const policyRequestId = `policy-request-${mode._tag}`
  return MultipleCountersV3PolicyRequestRecord.make({
    ...requestScope,
    expectedLifecycleGeneration: 1,
    expectedPolicyGeneration: 1,
    id: '00000000-0000-4000-8000-000000000001',
    policyRequestId,
    policyRequestPositionKey: makeMultipleCountersV3PolicyRequestPositionKey(
      sessionIdentity.sessionId,
      policyRequestId,
    ),
    programId: multipleCountersV3PolicyProgramId,
    programVersion: multipleCountersV3PolicyProgramVersion,
    requestedAtMs: 1_000,
    requestedMode: mode,
    requestedModeTag: mode._tag,
  })
}

const mirrorRequest = makePolicyRequest(Synchronization.Mirror.make({}))

const makeAcceptedResolution = () =>
  MultipleCountersV3PolicyResolutionRecord.make({
    ...mirrorRequest,
    id: '00000000-0000-4000-8000-000000000002',
    policyResolutionPositionKey:
      makeMultipleCountersV3PolicyResolutionPositionKey(
        mirrorRequest.sessionId,
        mirrorRequest.policyRequestId,
      ),
    resolvedAtMs: 2_000,
    resolvedLifecycleGeneration: 2,
    resolvedLifecyclePositionKey:
      makeInstantV3ProgramSessionLifecyclePositionKey(
        mirrorRequest.sessionId,
        2,
      ),
    resolvedPolicyGeneration: 2,
    resolvingProcessorId: 'multiple-counters-authority',
    resolutionState: 'Accepted',
  })

describe('Multiple Counters v3 policy request wire', () => {
  it('derives a request from the exact active Processor session', () => {
    const requestedMode = Synchronization.SharedDomain.make({})
    const request = makeMultipleCountersV3PolicyRequest(
      {
        appSubjectDigest: sessionIdentity.appSubjectDigest,
        instantAppId,
        programId: multipleCountersV3PolicyProgramId,
        programVersion: multipleCountersV3PolicyProgramVersion,
        protocolVersion: instantV3ProgramProtocolVersion,
        sessionEpochId: sessionIdentity.sessionEpochId,
        sessionId: sessionIdentity.sessionId,
        subjectId,
      },
      {
        lifecycleGeneration: 3,
        lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
          sessionIdentity.sessionId,
          3,
        ),
        lifecycleState: 'Active',
        sessionPolicy: Synchronization.SessionPolicy.make({
          generation: 2,
          mode: Synchronization.Mirror.make({}),
        }),
      },
      requestedMode,
      {
        policyRequestId: 'policy-request-derived',
        requestedAtMs: 3_000,
      },
    )

    expect(request).toMatchObject({
      expectedLifecycleGeneration: 3,
      expectedPolicyGeneration: 2,
      requesterId: subjectId,
      requestedMode,
      requestedModeTag: 'SharedDomain',
    })
    expect(
      Option.isSome(
        S.decodeUnknownOption(MultipleCountersV3PolicyRequestRecord)(request),
      ),
    ).toBe(true)
  })

  it('accepts Mirror, SharedDomain, and Follow as exact Program modes', () => {
    const modes: ReadonlyArray<Synchronization.Mode> = [
      Synchronization.Mirror.make({}),
      Synchronization.SharedDomain.make({}),
      Synchronization.Follow.make({
        followers: [
          Synchronization.Follower.make({
            control: 'RemoteControl',
            processorId: 'processor-b',
          }),
        ],
        leaderProcessorId: 'processor-a',
      }),
    ]

    for (const mode of modes) {
      const request = makePolicyRequest(mode)
      expect(
        Option.isSome(
          S.decodeUnknownOption(MultipleCountersV3PolicyRequestRecord)(request),
        ),
      ).toBe(true)
      expect(request.requestedModeTag).toBe(mode._tag)
    }

    expect(mirrorRequest.policyRequestPositionKey).toBe(
      `["MultipleCountersPolicyRequest","${sessionIdentity.sessionId}","PolicyRequestId","policy-request-Mirror"]`,
    )
    expect(
      S.encodeSync(MultipleCountersV3PolicyRequestRecord)(mirrorRequest),
    ).toStrictEqual(mirrorRequest)
  })

  it('rejects foreign scope, stale identity, invalid generations, and mismatched modes', () => {
    const invalidRequests: ReadonlyArray<unknown> = [
      { ...mirrorRequest, requesterId: 'different-subject' },
      { ...mirrorRequest, subjectId: 'different-subject' },
      { ...mirrorRequest, programId: 'other-program' },
      { ...mirrorRequest, programVersion: 3 },
      { ...mirrorRequest, protocolVersion: 2 },
      { ...mirrorRequest, expectedLifecycleGeneration: 0 },
      { ...mirrorRequest, expectedPolicyGeneration: -1 },
      { ...mirrorRequest, policyRequestPositionKey: '["Wrong"]' },
      { ...mirrorRequest, requestedModeTag: 'SharedDomain' },
      {
        ...mirrorRequest,
        requestedMode: {
          _tag: 'Follow',
          followers: [{ control: 'Observe', processorId: 'processor-a' }],
          leaderProcessorId: 'processor-a',
        },
        requestedModeTag: 'Follow',
      },
    ]

    for (const invalidRequest of invalidRequests) {
      expect(
        Option.isNone(
          S.decodeUnknownOption(MultipleCountersV3PolicyRequestRecord)(
            invalidRequest,
          ),
        ),
      ).toBe(true)
    }
  })

  it('stores one exact terminal acceptance or rejection audit', () => {
    const accepted = makeAcceptedResolution()
    const rejected = MultipleCountersV3PolicyResolutionRecord.make({
      ...mirrorRequest,
      id: '00000000-0000-4000-8000-000000000003',
      policyResolutionPositionKey:
        makeMultipleCountersV3PolicyResolutionPositionKey(
          mirrorRequest.sessionId,
          mirrorRequest.policyRequestId,
        ),
      rejectionReason: 'Expected generation was stale.',
      resolvedAtMs: 2_000,
      resolvedLifecycleGeneration: 1,
      resolvedLifecyclePositionKey:
        makeInstantV3ProgramSessionLifecyclePositionKey(
          mirrorRequest.sessionId,
          1,
        ),
      resolvedPolicyGeneration: 1,
      resolvingProcessorId: 'multiple-counters-authority',
      resolutionState: 'Rejected',
    })

    expect(accepted).toMatchObject({
      resolutionState: 'Accepted',
      resolvedLifecycleGeneration: 2,
      resolvedPolicyGeneration: 2,
    })
    expect(accepted).not.toHaveProperty('rejectionReason')
    expect(rejected).toMatchObject({
      rejectionReason: 'Expected generation was stale.',
      resolutionState: 'Rejected',
      resolvedLifecycleGeneration: 1,
      resolvedPolicyGeneration: 1,
    })
    expect(accepted.policyResolutionPositionKey).toBe(
      `["MultipleCountersPolicyResolution","${sessionIdentity.sessionId}","PolicyRequestId","policy-request-Mirror"]`,
    )
    expect(
      S.encodeSync(MultipleCountersV3PolicyResolutionRecord)(accepted),
    ).toStrictEqual(accepted)
    expect(
      S.encodeSync(MultipleCountersV3PolicyResolutionRecord)(rejected),
    ).toStrictEqual(rejected)
  })

  it('rejects non-terminal or internally inconsistent resolution audits', () => {
    const accepted = makeAcceptedResolution()
    const invalidResolutions: ReadonlyArray<unknown> = [
      { ...accepted, resolutionState: 'Pending' },
      { ...accepted, rejectionReason: 'Unexpected rejection.' },
      { ...accepted, resolvedAtMs: mirrorRequest.requestedAtMs - 1 },
      { ...accepted, resolvedLifecycleGeneration: 3 },
      { ...accepted, resolvedPolicyGeneration: 3 },
      { ...accepted, policyResolutionPositionKey: '["Wrong"]' },
      { ...accepted, resolvedLifecyclePositionKey: '["Wrong"]' },
    ]

    for (const invalidResolution of invalidResolutions) {
      expect(
        Option.isNone(
          S.decodeUnknownOption(MultipleCountersV3PolicyResolutionRecord)(
            invalidResolution,
          ),
        ),
      ).toBe(true)
    }
  })

  it('uniques request and terminal identities while preserving raw request lookup', () => {
    const requestAttrs =
      MultipleCountersV3PolicyEntities.multipleCountersV3PolicyRequests.attrs
    const resolutionAttrs =
      MultipleCountersV3PolicyEntities
        .multipleCountersV3PolicyRequestResolutions.attrs

    expect(requestAttrs.policyRequestId.config.unique).toBe(false)
    expect(requestAttrs.policyRequestPositionKey.config.unique).toBe(true)
    expect(requestAttrs.requestedMode.valueType).toBe('json')
    expect(resolutionAttrs.policyRequestPositionKey.config.unique).toBe(false)
    expect(resolutionAttrs.policyResolutionPositionKey.config.unique).toBe(true)
    expect(new Set(Object.keys(requestAttrs))).toEqual(
      new Set([
        'appSubjectDigest',
        'expectedLifecycleGeneration',
        'expectedPolicyGeneration',
        'instantAppId',
        'policyRequestId',
        'policyRequestPositionKey',
        'programId',
        'programVersion',
        'protocolVersion',
        'requestedAtMs',
        'requestedMode',
        'requestedModeTag',
        'requesterId',
        'sessionEpochId',
        'sessionId',
        'subjectId',
      ]),
    )
    expect(new Set(Object.keys(resolutionAttrs))).toEqual(
      new Set([
        'appSubjectDigest',
        'expectedLifecycleGeneration',
        'expectedPolicyGeneration',
        'instantAppId',
        'policyRequestId',
        'policyRequestPositionKey',
        'policyResolutionPositionKey',
        'programId',
        'programVersion',
        'protocolVersion',
        'rejectionReason',
        'requestedAtMs',
        'requestedMode',
        'requestedModeTag',
        'requesterId',
        'resolvedAtMs',
        'resolvedLifecycleGeneration',
        'resolvedLifecyclePositionKey',
        'resolvedPolicyGeneration',
        'resolvingProcessorId',
        'resolutionState',
        'sessionEpochId',
        'sessionId',
        'subjectId',
      ]),
    )
  })
})
