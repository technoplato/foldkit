import { Array, Effect, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  OriginEnrollmentClaimSigningRecord,
  deriveOriginDeviceKeyPair,
  instantV3ProgramProtocolVersion,
  makeInstantV3OriginEnrollmentClaimPositionKey,
  makeV3InMemoryProgramStores,
  signOriginEnrollmentClaim,
} from '@foldkit/instant'

import {
  makeMultipleCountersV3MirrorSession,
  materializeMultipleCountersV3Enrollment,
} from './enrollmentMaterializer.js'

const instantAppId = 'instant-v3-demo-app'
const subjectId = 'authenticated-subject'
const authorityProcessorId = 'multiple-counters-v3-authority'
const sessionEpochSeed = 'first-account-session'
const claimedAtMs = 1_000
const authorityTime = 9_000

const makeEnrollmentClaim = Effect.gen(function* () {
  const secretKey = Uint8Array.from(
    Array.makeBy(32, index => (index === 31 ? 1 : 0)),
  )
  const keyPair = yield* deriveOriginDeviceKeyPair(secretKey)
  return yield* signOriginEnrollmentClaim(
    OriginEnrollmentClaimSigningRecord.make({
      claimedAtMs,
      enrollmentClaimId: 'enrollment-claim-1',
      enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
        instantAppId,
        subjectId,
        instantV3ProgramProtocolVersion,
        'enrollment-claim-1',
      ),
      id: '00000000-0000-4000-8000-000000000001',
      instantAppId,
      originDeviceId: keyPair.originDeviceId,
      protocolVersion: instantV3ProgramProtocolVersion,
      subjectId,
    }),
    secretKey,
  )
})

describe('protocol-v3 enrollment materialization', () => {
  it('verifies proof and creates one Active policy plus one generation-one Mirror session', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const claim = yield* makeEnrollmentClaim
        const stores = yield* makeV3InMemoryProgramStores()
        yield* stores.client.appendOriginEnrollmentClaim(claim)
        const first = yield* materializeMultipleCountersV3Enrollment(claim, {
          authorityProcessorId,
          now: () => authorityTime,
          sessionEpochSeed,
          store: stores.authority,
        })
        const second = yield* materializeMultipleCountersV3Enrollment(claim, {
          authorityProcessorId,
          now: () => authorityTime + 1,
          sessionEpochSeed,
          store: stores.authority,
        })
        const snapshot = yield* stores.readSnapshot
        return { first, second, snapshot }
      }),
    )

    expect(result.first.originPolicyDecision).toMatchObject({
      decidedAtMs: authorityTime,
      decisionState: 'Active',
      generation: 1,
    })
    expect(result.first.programSession).toMatchObject({
      createdAtMs: authorityTime,
      lifecycleGeneration: 1,
      lifecycleState: 'Active',
      sessionPolicy: {
        generation: 1,
        mode: { _tag: 'Mirror' },
      },
    })
    expect(result.second.originPolicyDisposition).toBe('Idempotent')
    expect(result.second.programSessionDisposition).toBe('Existing')
    expect(result.second.originPolicyDecision.decidedAtMs).toBe(authorityTime)
    expect(result.second.programSession.createdAtMs).toBe(authorityTime)
    expect(result.snapshot.originPolicyDecisions).toHaveLength(1)
    expect(result.snapshot.programSessions).toHaveLength(1)
  })

  it('does not write policy or session rows for a tampered signed claim', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const claim = yield* makeEnrollmentClaim
        const stores = yield* makeV3InMemoryProgramStores()
        const materialization = yield* Effect.result(
          materializeMultipleCountersV3Enrollment(
            { ...claim, claimedAtMs: claim.claimedAtMs + 1 },
            {
              authorityProcessorId,
              now: () => authorityTime,
              sessionEpochSeed,
              store: stores.authority,
            },
          ),
        )
        const snapshot = yield* stores.readSnapshot
        return { materialization, snapshot }
      }),
    )

    expect(Result.isFailure(result.materialization)).toBe(true)
    if (Result.isFailure(result.materialization)) {
      expect(result.materialization.failure).toMatchObject({
        _tag: 'MultipleCountersV3EnrollmentClaimError',
        stage: 'Verify',
      })
    }
    expect(result.snapshot.originPolicyDecisions).toHaveLength(0)
    expect(result.snapshot.programSessions).toHaveLength(0)
  })

  it('keeps signed claim time separate from authority decision time', async () => {
    const claim = await Effect.runPromise(makeEnrollmentClaim)
    const session = makeMultipleCountersV3MirrorSession(claim, {
      authorityProcessorId,
      createdAtMs: authorityTime,
      sessionEpochSeed,
    })

    expect(claim.claimedAtMs).toBe(claimedAtMs)
    expect(session.createdAtMs).toBe(authorityTime)
    expect(session.createdAtMs).not.toBe(claim.claimedAtMs)
  })
})
