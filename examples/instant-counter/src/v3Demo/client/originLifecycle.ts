import { MultipleCountersProgram } from 'counters-core-example'
import { Effect } from 'effect'

import {
  type InstantV3EntityId,
  InstantV3Identity,
  type InstantV3OriginEnrollmentClaimRecord,
  type InstantV3TimestampMs,
  OriginClientCertificateClaims,
  OriginEnrollmentClaimSigningRecord,
  OriginProcessorCertificateClaims,
  type V3SharedProgramOrigin,
  deriveOriginClientKeyPair,
  deriveOriginDeviceKeyPair,
  deriveOriginProcessorKeyPair,
  encodeOriginClientCertificateJson,
  encodeOriginProcessorCertificateJson,
  instantV3ProgramProtocolVersion,
  makeInstantV3OriginEnrollmentClaimPositionKey,
  makeOriginClientCertificate,
  makeOriginProcessorCertificate,
  signOriginEnrollmentClaim,
} from '@foldkit/instant'

import {
  makeMultipleCountersV3EntityId,
  makeMultipleCountersV3OriginPolicyId,
  makeMultipleCountersV3SessionIdentity,
} from '../shared/identity.js'

/** Persisted Device and Client secrets that never enter Program state or InstantDB. */
export type MultipleCountersV3OriginSecrets = Readonly<{
  clientSecretKey: Uint8Array
  deviceSecretKey: Uint8Array
}>

/** One fresh Processor secret whose lifetime is exactly one Processor occurrence. */
export type MultipleCountersV3ProcessorSecret = Readonly<{
  processorSecretKey: Uint8Array
}>

/** Stable public origin identities derived from host-owned secret material. */
export type MultipleCountersV3OriginIdentity = Readonly<{
  clientId: string
  originDeviceId: string
}>

/** Complete origin proof material for one authenticated Processor occurrence. */
export type MultipleCountersV3PreparedOrigin = Readonly<{
  enrollmentClaim: InstantV3OriginEnrollmentClaimRecord
  identity: MultipleCountersV3OriginIdentity
  origin: V3SharedProgramOrigin
}>

/** Derives public Device and Client identities without exposing their secrets. */
export const deriveMultipleCountersV3OriginIdentity = (
  secrets: MultipleCountersV3OriginSecrets,
): Effect.Effect<MultipleCountersV3OriginIdentity, unknown> =>
  Effect.gen(function* () {
    const device = yield* deriveOriginDeviceKeyPair(secrets.deviceSecretKey)
    const client = yield* deriveOriginClientKeyPair(secrets.clientSecretKey)
    return {
      clientId: client.clientId,
      originDeviceId: device.originDeviceId,
    }
  })

const enrollmentClaimIdForDevice = (
  originDeviceId: string,
): InstantV3Identity => InstantV3Identity.make(`enrollment:${originDeviceId}`)

/** Builds one deterministic Device-signed enrollment claim for an Instant subject. */
export const makeMultipleCountersV3EnrollmentClaim = (
  input: Readonly<{
    claimedAtMs: InstantV3TimestampMs
    instantAppId: string
    secrets: MultipleCountersV3OriginSecrets
    subjectId: string
  }>,
): Effect.Effect<InstantV3OriginEnrollmentClaimRecord, unknown> =>
  Effect.gen(function* () {
    const device = yield* deriveOriginDeviceKeyPair(
      input.secrets.deviceSecretKey,
    )
    const enrollmentClaimId = enrollmentClaimIdForDevice(device.originDeviceId)
    const enrollmentClaimPositionKey =
      makeInstantV3OriginEnrollmentClaimPositionKey(
        input.instantAppId,
        input.subjectId,
        instantV3ProgramProtocolVersion,
        enrollmentClaimId,
      )
    return yield* signOriginEnrollmentClaim(
      OriginEnrollmentClaimSigningRecord.make({
        claimedAtMs: input.claimedAtMs,
        enrollmentClaimId,
        enrollmentClaimPositionKey,
        id: makeMultipleCountersV3EntityId(
          'OriginEnrollmentClaim',
          enrollmentClaimPositionKey,
        ),
        instantAppId: input.instantAppId,
        originDeviceId: device.originDeviceId,
        protocolVersion: instantV3ProgramProtocolVersion,
        subjectId: input.subjectId,
      }),
      input.secrets.deviceSecretKey,
    )
  })

/** Builds the verified certificate chain used by one optimistic Processor. */
export const prepareMultipleCountersV3Origin = (
  input: Readonly<{
    claimedAtMs: InstantV3TimestampMs
    instantAppId: string
    processor: MultipleCountersV3ProcessorSecret
    secrets: MultipleCountersV3OriginSecrets
    sessionEpochSeed: string
    subjectId: string
  }>,
): Effect.Effect<MultipleCountersV3PreparedOrigin, unknown> =>
  Effect.gen(function* () {
    const device = yield* deriveOriginDeviceKeyPair(
      input.secrets.deviceSecretKey,
    )
    const client = yield* deriveOriginClientKeyPair(
      input.secrets.clientSecretKey,
    )
    const processor = yield* deriveOriginProcessorKeyPair(
      input.processor.processorSecretKey,
    )
    const enrollmentClaim = yield* makeMultipleCountersV3EnrollmentClaim({
      claimedAtMs: input.claimedAtMs,
      instantAppId: input.instantAppId,
      secrets: input.secrets,
      subjectId: input.subjectId,
    })
    const originPolicyId = makeMultipleCountersV3OriginPolicyId(
      enrollmentClaim.enrollmentClaimId,
    )
    const session = makeMultipleCountersV3SessionIdentity({
      instantAppId: input.instantAppId,
      sessionEpochSeed: input.sessionEpochSeed,
      subjectId: input.subjectId,
    })
    const clientCertificate = yield* makeOriginClientCertificate(
      OriginClientCertificateClaims.make({
        clientId: client.clientId,
        instantAppId: input.instantAppId,
        originDeviceId: device.originDeviceId,
        subjectId: input.subjectId,
      }),
      input.secrets.deviceSecretKey,
    )
    const processorCertificate = yield* makeOriginProcessorCertificate(
      OriginProcessorCertificateClaims.make({
        clientId: client.clientId,
        instantAppId: input.instantAppId,
        originDeviceId: device.originDeviceId,
        originPolicyGeneration: 1,
        originPolicyId,
        originatingProcessorId: processor.originatingProcessorId,
        programId: MultipleCountersProgram.id,
        programVersion: MultipleCountersProgram.version,
        protocolVersion: instantV3ProgramProtocolVersion,
        sessionId: session.sessionId,
        subjectId: input.subjectId,
      }),
      input.secrets.clientSecretKey,
    )
    const originClientCertificateJson =
      yield* encodeOriginClientCertificateJson(clientCertificate)
    const originProcessorCertificateJson =
      yield* encodeOriginProcessorCertificateJson(processorCertificate)
    return {
      enrollmentClaim,
      identity: {
        clientId: client.clientId,
        originDeviceId: device.originDeviceId,
      },
      origin: {
        actorId: input.subjectId,
        clientId: client.clientId,
        originClientCertificateJson,
        originDeviceId: device.originDeviceId,
        originPolicyGeneration: 1,
        originPolicyId,
        originProcessorCertificateJson,
        originatingProcessorId: processor.originatingProcessorId,
        processorSecretKey: Uint8Array.from(input.processor.processorSecretKey),
      },
    }
  })

/** Produces an Instant-compatible UUID row identity from a caller-owned source. */
export const makeMultipleCountersV3RandomEntityId = (
  randomUuid: () => string,
): InstantV3EntityId =>
  makeMultipleCountersV3EntityId('RandomEntity', randomUuid())
