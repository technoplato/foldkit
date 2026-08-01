import { Array, Effect } from 'effect'
import { Synchronization } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  type InstantV3ProgramSessionRecord,
  OriginEnrollmentClaimSigningRecord,
  deriveOriginDeviceKeyPair,
  instantV3ProgramProtocolVersion,
  makeInstantV3OriginEnrollmentClaimPositionKey,
  signOriginEnrollmentClaim,
} from '@foldkit/instant'

import {
  MultipleCountersV3PolicyRequestRecord,
  makeMultipleCountersV3PolicyRequestPositionKey,
  multipleCountersV3PolicyProgramId,
  multipleCountersV3PolicyProgramVersion,
} from '../shared/policyRequest.js'
import { makeMultipleCountersV3MirrorSession } from './enrollmentMaterializer.js'
import { planMultipleCountersV3PolicyRequest } from './policySupervisor.js'

const instantAppId = 'instant-v3-demo-app'
const subjectId = 'authenticated-subject'
const authorityProcessorId = 'multiple-counters-v3-authority'

const makeInitialSession = Effect.gen(function* () {
  const secretKey = Uint8Array.from(
    Array.makeBy(32, index => (index === 31 ? 1 : 0)),
  )
  const keyPair = yield* deriveOriginDeviceKeyPair(secretKey)
  const claim = yield* signOriginEnrollmentClaim(
    OriginEnrollmentClaimSigningRecord.make({
      claimedAtMs: 1_000,
      enrollmentClaimId: 'policy-enrollment-1',
      enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
        instantAppId,
        subjectId,
        instantV3ProgramProtocolVersion,
        'policy-enrollment-1',
      ),
      id: '00000000-0000-4000-8000-000000000001',
      instantAppId,
      originDeviceId: keyPair.originDeviceId,
      protocolVersion: instantV3ProgramProtocolVersion,
      subjectId,
    }),
    secretKey,
  )
  return makeMultipleCountersV3MirrorSession(claim, {
    authorityProcessorId,
    createdAtMs: 2_000,
    sessionEpochSeed: 'first-account-session',
  })
})

const makeRequest = (
  session: InstantV3ProgramSessionRecord,
  mode: Synchronization.Mode,
  expectedLifecycleGeneration = session.lifecycleGeneration,
  expectedPolicyGeneration = session.sessionPolicy.generation,
) => {
  const policyRequestId = `policy-${mode._tag}-${expectedLifecycleGeneration.toString()}`
  return MultipleCountersV3PolicyRequestRecord.make({
    appSubjectDigest: session.appSubjectDigest,
    expectedLifecycleGeneration,
    expectedPolicyGeneration,
    id: '00000000-0000-4000-8000-000000000002',
    instantAppId,
    policyRequestId,
    policyRequestPositionKey: makeMultipleCountersV3PolicyRequestPositionKey(
      session.sessionId,
      policyRequestId,
    ),
    programId: multipleCountersV3PolicyProgramId,
    programVersion: multipleCountersV3PolicyProgramVersion,
    protocolVersion: instantV3ProgramProtocolVersion,
    requestedAtMs: 3_000,
    requestedMode: mode,
    requestedModeTag: mode._tag,
    requesterId: subjectId,
    sessionEpochId: session.sessionEpochId,
    sessionId: session.sessionId,
    subjectId,
  })
}

const config = {
  authorityProcessorId,
  now: () => 4_000,
}

describe('Multiple Counters v3 policy supervisor', () => {
  it('appends exactly one generation for Mirror, SharedDomain, and Follow', async () => {
    const initial = await Effect.runPromise(makeInitialSession)
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
      const plan = await Effect.runPromise(
        planMultipleCountersV3PolicyRequest(
          makeRequest(initial, mode),
          initial,
          config,
        ),
      )
      expect(plan.disposition).toBe('Accepted')
      expect(plan.session).toMatchObject({
        lifecycleGeneration: 2,
        sessionPolicy: { generation: 2, mode },
      })
      expect(plan.resolution).toMatchObject({
        resolutionState: 'Accepted',
        resolvedLifecycleGeneration: 2,
        resolvedPolicyGeneration: 2,
      })
    }
  })

  it('terminally rejects a request whose observed generation became stale', async () => {
    const initial = await Effect.runPromise(makeInitialSession)
    const firstPlan = await Effect.runPromise(
      planMultipleCountersV3PolicyRequest(
        makeRequest(initial, Synchronization.SharedDomain.make({})),
        initial,
        config,
      ),
    )
    if (firstPlan.session === null) {
      throw new Error('Expected the first policy transition to be accepted.')
    }
    const stale = await Effect.runPromise(
      planMultipleCountersV3PolicyRequest(
        makeRequest(initial, Synchronization.Mirror.make({})),
        firstPlan.session,
        config,
      ),
    )

    expect(stale).toMatchObject({
      disposition: 'Rejected',
      resolution: {
        rejectionReason: 'The expected session or policy generation is stale.',
        resolutionState: 'Rejected',
        resolvedLifecycleGeneration: 2,
        resolvedPolicyGeneration: 2,
      },
      session: null,
    })
  })
})
