import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  decodeOriginClientCertificateJson,
  decodeOriginProcessorCertificateJson,
  verifyOriginEnrollmentClaim,
  verifyOriginProcessorCertificate,
} from '@foldkit/instant'

import {
  deriveMultipleCountersV3OriginIdentity,
  makeMultipleCountersV3EnrollmentClaim,
  prepareMultipleCountersV3Origin,
} from './originLifecycle.js'

const deviceSecretKey = Uint8Array.from([
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 1,
])
const clientSecretKey = Uint8Array.from([
  2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 2,
])
const processorSecretKey = Uint8Array.from([
  3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 3,
])

const secrets = { clientSecretKey, deviceSecretKey }
const scope = {
  instantAppId: 'instant-v3-demo-app',
  subjectId: 'authenticated-subject',
}

describe('Multiple Counters v3 origin lifecycle', () => {
  it('uses deterministic public Device and Client identities', async () => {
    const first = await Effect.runPromise(
      deriveMultipleCountersV3OriginIdentity(secrets),
    )
    const second = await Effect.runPromise(
      deriveMultipleCountersV3OriginIdentity(secrets),
    )

    expect(first).toEqual(second)
    expect(first.clientId).toHaveLength(44)
    expect(first.originDeviceId).toHaveLength(44)
    expect(first.clientId).not.toBe(first.originDeviceId)
  })

  it('signs one idempotent enrollment claim for the authenticated subject', async () => {
    const first = await Effect.runPromise(
      makeMultipleCountersV3EnrollmentClaim({
        claimedAtMs: 1_750_000_000_000,
        ...scope,
        secrets,
      }),
    )
    const second = await Effect.runPromise(
      makeMultipleCountersV3EnrollmentClaim({
        claimedAtMs: 1_750_000_000_000,
        ...scope,
        secrets,
      }),
    )
    const verified = await Effect.runPromise(
      verifyOriginEnrollmentClaim(first, scope),
    )

    expect(second).toEqual(first)
    expect(verified).toEqual(first)
    expect(first.enrollmentClaimId).toContain('enrollment:')
  })

  it('creates a verifiable Device to Client to Processor chain', async () => {
    const prepared = await Effect.runPromise(
      prepareMultipleCountersV3Origin({
        claimedAtMs: 1_750_000_000_000,
        ...scope,
        processor: { processorSecretKey },
        secrets,
        sessionEpochSeed: 'first-account-session',
      }),
    )
    const clientCertificate = await Effect.runPromise(
      decodeOriginClientCertificateJson(
        prepared.origin.originClientCertificateJson,
      ),
    )
    const processorCertificate = await Effect.runPromise(
      decodeOriginProcessorCertificateJson(
        prepared.origin.originProcessorCertificateJson,
      ),
    )
    const verifiedProcessor = await Effect.runPromise(
      verifyOriginProcessorCertificate(clientCertificate, processorCertificate),
    )

    expect(verifiedProcessor.originatingProcessorId).toBe(
      prepared.origin.originatingProcessorId,
    )
    expect(verifiedProcessor.clientId).toBe(prepared.identity.clientId)
    expect(verifiedProcessor.originDeviceId).toBe(
      prepared.identity.originDeviceId,
    )
    expect(prepared.origin.processorSecretKey).not.toBe(processorSecretKey)
  })
})
