import { Array, Effect, Result } from 'effect'
import { Synchronization } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  InstantV3ProgramSessionRecord,
  OriginEnrollmentClaimSigningRecord,
  deriveOriginDeviceKeyPair,
  instantV3ProgramProtocolVersion,
  makeInstantV3OriginEnrollmentClaimPositionKey,
  makeInstantV3ProgramSessionLifecyclePositionKey,
  signOriginEnrollmentClaim,
} from '@foldkit/instant'

import {
  type MultipleCountersV3AcceptanceSupervisorConfig,
  selectActiveMultipleCountersV3Sessions,
} from './acceptanceSupervisor.js'
import { makeMultipleCountersV3MirrorSession } from './enrollmentMaterializer.js'
import {
  transitionMultipleCountersV3ToFollow,
  transitionMultipleCountersV3ToSharedDomain,
} from './sessionLifecycle.js'

const authorityProcessorId = 'multiple-counters-v3-authority'
const sessionEpochSeed = 'first-account-session'

const makeInitialSession = Effect.gen(function* () {
  const secretKey = Uint8Array.from(
    Array.makeBy(32, index => (index === 31 ? 1 : 0)),
  )
  const keyPair = yield* deriveOriginDeviceKeyPair(secretKey)
  const claim = yield* signOriginEnrollmentClaim(
    OriginEnrollmentClaimSigningRecord.make({
      claimedAtMs: 1_000,
      enrollmentClaimId: 'enrollment-claim-1',
      enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
        'instant-v3-demo-app',
        'authenticated-subject',
        instantV3ProgramProtocolVersion,
        'enrollment-claim-1',
      ),
      id: '00000000-0000-4000-8000-000000000001',
      instantAppId: 'instant-v3-demo-app',
      originDeviceId: keyPair.originDeviceId,
      protocolVersion: instantV3ProgramProtocolVersion,
      subjectId: 'authenticated-subject',
    }),
    secretKey,
  )
  return makeMultipleCountersV3MirrorSession(claim, {
    authorityProcessorId,
    createdAtMs: 2_000,
    sessionEpochSeed,
  })
})

const supervisorConfig: MultipleCountersV3AcceptanceSupervisorConfig = {
  authorityProcessorId,
  makeEntityId: () => '00000000-0000-4000-8000-000000000099',
  now: () => 3_000,
  sessionEpochSeed,
}

describe('protocol-v3 session lifecycle', () => {
  it('increments lifecycle and policy generations for typed mode transitions', async () => {
    const initial = await Effect.runPromise(makeInitialSession)
    const shared = await Effect.runPromise(
      transitionMultipleCountersV3ToSharedDomain(initial, {
        createdAtMs: 3_000,
        id: '00000000-0000-4000-8000-000000000002',
      }),
    )
    const follow = await Effect.runPromise(
      transitionMultipleCountersV3ToFollow(
        shared,
        {
          followers: [
            Synchronization.Follower.make({
              control: 'RemoteControl',
              processorId: 'processor-b',
            }),
          ],
          leaderProcessorId: 'processor-a',
        },
        {
          createdAtMs: 4_000,
          id: '00000000-0000-4000-8000-000000000003',
        },
      ),
    )

    expect(shared).toMatchObject({
      lifecycleGeneration: 2,
      previousLifecyclePositionKey: initial.lifecyclePositionKey,
      sessionPolicy: { generation: 2, mode: { _tag: 'SharedDomain' } },
    })
    expect(follow).toMatchObject({
      lifecycleGeneration: 3,
      previousLifecyclePositionKey: shared.lifecyclePositionKey,
      sessionPolicy: {
        generation: 3,
        mode: {
          _tag: 'Follow',
          leaderProcessorId: 'processor-a',
        },
      },
    })
  })

  it('does not resurrect an older Active generation after revocation', async () => {
    const initial = await Effect.runPromise(makeInitialSession)
    const shared = await Effect.runPromise(
      transitionMultipleCountersV3ToSharedDomain(initial, {
        createdAtMs: 3_000,
        id: '00000000-0000-4000-8000-000000000002',
      }),
    )
    const lifecycleGeneration = 3
    const revoked = InstantV3ProgramSessionRecord.make({
      ...shared,
      createdAtMs: 4_000,
      id: '00000000-0000-4000-8000-000000000003',
      lifecycleGeneration,
      lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
        shared.sessionId,
        lifecycleGeneration,
      ),
      lifecycleState: 'Revoked',
      previousLifecyclePositionKey: shared.lifecyclePositionKey,
    })

    expect(
      selectActiveMultipleCountersV3Sessions(
        [initial, shared, revoked],
        supervisorConfig,
      ),
    ).toEqual([])
  })

  it('quarantines lifecycle gaps and duplicate generations', async () => {
    const initial = await Effect.runPromise(makeInitialSession)
    const lifecycleGeneration = 3
    const gap = InstantV3ProgramSessionRecord.make({
      ...initial,
      createdAtMs: 4_000,
      id: '00000000-0000-4000-8000-000000000003',
      lifecycleGeneration,
      lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
        initial.sessionId,
        lifecycleGeneration,
      ),
      previousLifecyclePositionKey:
        makeInstantV3ProgramSessionLifecyclePositionKey(initial.sessionId, 2),
      sessionPolicy: Synchronization.SessionPolicy.make({
        generation: 3,
        mode: Synchronization.Mirror.make({}),
      }),
    })
    const duplicate = InstantV3ProgramSessionRecord.make({
      ...initial,
      id: '00000000-0000-4000-8000-000000000004',
    })

    expect(
      selectActiveMultipleCountersV3Sessions([initial, gap], supervisorConfig),
    ).toEqual([])
    expect(
      selectActiveMultipleCountersV3Sessions(
        [initial, duplicate],
        supervisorConfig,
      ),
    ).toEqual([])
  })

  it('rejects invalid Follow topology and transitions from revoked sessions', async () => {
    const initial = await Effect.runPromise(makeInitialSession)
    const invalidFollow = await Effect.runPromise(
      Effect.result(
        transitionMultipleCountersV3ToFollow(
          initial,
          {
            followers: [
              Synchronization.Follower.make({
                control: 'Observe',
                processorId: 'processor-a',
              }),
            ],
            leaderProcessorId: 'processor-a',
          },
          {
            createdAtMs: 3_000,
            id: '00000000-0000-4000-8000-000000000002',
          },
        ),
      ),
    )
    expect(Result.isFailure(invalidFollow)).toBe(true)

    const revoked = InstantV3ProgramSessionRecord.make({
      ...initial,
      createdAtMs: 3_000,
      id: '00000000-0000-4000-8000-000000000003',
      lifecycleGeneration: 2,
      lifecyclePositionKey: makeInstantV3ProgramSessionLifecyclePositionKey(
        initial.sessionId,
        2,
      ),
      lifecycleState: 'Revoked',
      previousLifecyclePositionKey: initial.lifecyclePositionKey,
    })
    const revokedTransition = await Effect.runPromise(
      Effect.result(
        transitionMultipleCountersV3ToSharedDomain(revoked, {
          createdAtMs: 4_000,
          id: '00000000-0000-4000-8000-000000000004',
        }),
      ),
    )
    expect(Result.isFailure(revokedTransition)).toBe(true)
    if (Result.isFailure(revokedTransition)) {
      expect(revokedTransition.failure).toMatchObject({
        reason: 'RevokedSession',
      })
    }
  })
})
