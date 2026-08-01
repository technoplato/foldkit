import { Effect, Encoding, Result } from 'effect'
import { Synchronization } from 'foldkit'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'
import { p256 } from '@noble/curves/nist.js'

import {
  InstantV3ProgramSessionIdentity,
  instantV3OriginPolicyProtocolVersion,
  instantV3ProgramProtocolVersion,
  instantV3ProtocolLimits,
  makeInstantV3EffectPlacementPositionKey,
  makeInstantV3MessageProposalActorSequencePositionKey,
  makeInstantV3MessageProposalEffectIdempotencyPositionKey,
  makeInstantV3MessageProposalEffectRequestResultPositionKey,
  makeInstantV3MessageProposalMessageIdempotencyPositionKey,
  makeInstantV3MessageProposalOccurrencePositionKey,
  makeInstantV3MessageProposalPositionKey,
  makeInstantV3OriginEnrollmentClaimPositionKey,
  printInstantV3ProgramSessionId,
  stringifyInstantV3CanonicalJson,
} from '../v3Schema/index.js'
import {
  OriginClientCertificateClaims,
  OriginEffectResultProofScope,
  OriginEffectResultSigningRecord,
  OriginEnrollmentClaimProofScope,
  OriginEnrollmentClaimSigningRecord,
  OriginOrdinaryProposalProofScope,
  OriginOrdinaryProposalSigningRecord,
  OriginProcessorCertificateClaims,
  canonicalOriginClientCertificateBytes,
  canonicalOriginEffectResultBytes,
  canonicalOriginEnrollmentClaimBytes,
  canonicalOriginOrdinaryProposalBytes,
  canonicalOriginProcessorCertificateBytes,
  decodeOriginClientCertificateJson,
  decodeOriginClientId,
  decodeOriginDeviceId,
  decodeOriginProcessorCertificateJson,
  decodeOriginProcessorId,
  decodeOriginSignature,
  deriveOriginClientKeyPair,
  deriveOriginDeviceKeyPair,
  deriveOriginProcessorKeyPair,
  digestOriginOrdinaryMessageProposalProof,
  encodeOriginClientCertificateJson,
  encodeOriginProcessorCertificateJson,
  makeOriginClientCertificate,
  makeOriginProcessorCertificate,
  originEffectResultDomain,
  originEffectResultSigningFields,
  originEnrollmentClaimDomain,
  originEnrollmentClaimSigningFields,
  originOrdinaryProposalDomain,
  originOrdinaryProposalSigningFields,
  originProofFormatVersion,
  signOriginEffectResultProposal,
  signOriginEnrollmentClaim,
  signOriginOrdinaryMessageProposal,
  verifyOriginClientCertificate,
  verifyOriginEffectResultProposal,
  verifyOriginEnrollmentClaim,
  verifyOriginOrdinaryMessageProposal,
  verifyOriginProcessorCertificate,
} from './originProof.js'

const utf8 = new TextDecoder()
const makeSecretKey = (lastByte: number): Uint8Array =>
  Uint8Array.from([...new Array<number>(31).fill(0), lastByte])

const deviceSecretKey = makeSecretKey(1)
const clientSecretKey = makeSecretKey(2)
const processorSecretKey = makeSecretKey(3)
const otherSecretKey = makeSecretKey(4)
const hostileCanonicalJsonDepth = 20_000
const makeNestedArrayJson = (depth: number): string =>
  `${'['.repeat(depth)}0${']'.repeat(depth)}`
const p256Order = Uint8Array.from([
  0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xbc, 0xe6, 0xfa, 0xad, 0xa7, 0x17, 0x9e, 0x84, 0xf3, 0xb9,
  0xca, 0xc2, 0xfc, 0x63, 0x25, 0x51,
])

const expectedDeviceId = 'A2sX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKW'
const expectedClientId = 'A3zyexiNA09-ilI4AwS1GsPAiWnid_IbNaYLSPxHZpl4'
const expectedProcessorId = 'Al7L5NGmMwpEyPfvlR1L8WXmxrch762phftBZhvG5_1s'
const appSubjectDigest = 'a'.repeat(64)
const sessionEpochId = 'e'.repeat(22)
const sessionId = printInstantV3ProgramSessionId(
  InstantV3ProgramSessionIdentity.make({
    appSubjectDigest,
    originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
    programId: 'counter',
    programVersion: 7,
    sessionEpochId,
  }),
)
const audience = Synchronization.SessionAudience.make({})

const decodeBase64Url = (value: string): Uint8Array =>
  Result.getOrThrow(Encoding.decodeBase64Url(value))

const toHighSSignature = (value: string): string => {
  const signature = p256.Signature.fromBytes(decodeBase64Url(value), 'compact')
  return Encoding.encodeBase64Url(
    new p256.Signature(signature.r, p256.Point.Fn.ORDER - signature.s).toBytes(
      'compact',
    ),
  )
}

const toDerSignature = (value: string): string =>
  Encoding.encodeBase64Url(
    p256.Signature.fromBytes(decodeBase64Url(value), 'compact').toBytes('der'),
  )

const makeFixture = Effect.gen(function* () {
  const deviceKeyPair = yield* deriveOriginDeviceKeyPair(deviceSecretKey)
  const clientKeyPair = yield* deriveOriginClientKeyPair(clientSecretKey)
  const processorKeyPair =
    yield* deriveOriginProcessorKeyPair(processorSecretKey)
  const clientCertificateClaims = OriginClientCertificateClaims.make({
    clientId: clientKeyPair.clientId,
    instantAppId: 'instant-app-1',
    originDeviceId: deviceKeyPair.originDeviceId,
    subjectId: 'subject-1',
  })
  const clientCertificate = yield* makeOriginClientCertificate(
    clientCertificateClaims,
    deviceSecretKey,
  )
  const processorCertificateClaims = OriginProcessorCertificateClaims.make({
    clientId: clientKeyPair.clientId,
    instantAppId: 'instant-app-1',
    originDeviceId: deviceKeyPair.originDeviceId,
    originPolicyGeneration: 2,
    originPolicyId: 'origin-policy-1',
    originatingProcessorId: processorKeyPair.originatingProcessorId,
    programId: 'counter',
    programVersion: 7,
    protocolVersion: instantV3ProgramProtocolVersion,
    sessionId,
    subjectId: 'subject-1',
  })
  const processorCertificate = yield* makeOriginProcessorCertificate(
    processorCertificateClaims,
    clientSecretKey,
  )
  const originClientCertificateJson =
    yield* encodeOriginClientCertificateJson(clientCertificate)
  const originProcessorCertificateJson =
    yield* encodeOriginProcessorCertificateJson(processorCertificate)
  const enrollmentClaimSigningRecord = OriginEnrollmentClaimSigningRecord.make({
    claimedAtMs: 1_753_825_100_100,
    enrollmentClaimId: 'enrollment-claim-1',
    enrollmentClaimPositionKey: makeInstantV3OriginEnrollmentClaimPositionKey(
      'instant-app-1',
      'subject-1',
      instantV3ProgramProtocolVersion,
      'enrollment-claim-1',
    ),
    id: '00000000-0000-4000-8000-000000000001',
    instantAppId: 'instant-app-1',
    originDeviceId: deviceKeyPair.originDeviceId,
    protocolVersion: instantV3ProgramProtocolVersion,
    subjectId: 'subject-1',
  })
  const enrollmentClaim = yield* signOriginEnrollmentClaim(
    enrollmentClaimSigningRecord,
    deviceSecretKey,
  )
  const ordinarySigningRecord = OriginOrdinaryProposalSigningRecord.make({
    actorId: 'actor-1',
    actorSequence: 42,
    actorSequencePositionKey:
      makeInstantV3MessageProposalActorSequencePositionKey(
        sessionId,
        'actor-1',
        42,
      ),
    admissionClaimJson: stringifyInstantV3CanonicalJson({
      _tag: 'ActivatedInteraction',
      destinationUri: '/counters',
    }),
    admissionOccurrenceId: 'ordinary-occurrence-1',
    appSubjectDigest,
    causationOccurrenceId: null,
    clientId: clientKeyPair.clientId,
    correlationId: 'correlation-7',
    createdAtMs: 1_753_825_100_123,
    envelopeJson: stringifyInstantV3CanonicalJson({
      eventId: 'counter.incremented',
      version: 1,
    }),
    envelopeVersion: 5,
    eventId: 'counter.incremented',
    eventVersion: 6,
    id: '00000000-0000-4000-8000-000000000002',
    instantAppId: 'instant-app-1',
    messageIdempotencyKey: 'message-key-1',
    messageIdempotencyPositionKey:
      makeInstantV3MessageProposalMessageIdempotencyPositionKey(
        sessionId,
        'message-key-1',
      ),
    occurrenceId: 'ordinary-occurrence-1',
    occurrencePositionKey: makeInstantV3MessageProposalOccurrencePositionKey(
      sessionId,
      'ordinary-occurrence-1',
    ),
    originClientCertificateJson,
    originDeviceId: deviceKeyPair.originDeviceId,
    originPolicyGeneration: 2,
    originPolicyId: 'origin-policy-1',
    originatingProcessorId: processorKeyPair.originatingProcessorId,
    originProcessorCertificateJson,
    payloadJson: stringifyInstantV3CanonicalJson({
      _tag: 'ClickedIncrement',
      value: '✓',
    }),
    programId: 'counter',
    programVersion: 7,
    proposalId: 'ordinary-proposal-1',
    proposalKind: 'OrdinaryMessage',
    proposalPositionKey: makeInstantV3MessageProposalPositionKey(
      sessionId,
      'ordinary-proposal-1',
    ),
    protocolVersion: instantV3ProgramProtocolVersion,
    sessionEpochId,
    sessionId,
    subjectId: 'subject-1',
  })
  const ordinaryProposal = yield* signOriginOrdinaryMessageProposal(
    ordinarySigningRecord,
    processorSecretKey,
  )
  const causalOriginProofDigest =
    yield* digestOriginOrdinaryMessageProposalProof(ordinaryProposal)
  const effectResultSigningRecord = OriginEffectResultSigningRecord.make({
    actorId: 'actor-1',
    actorSequence: 43,
    actorSequencePositionKey:
      makeInstantV3MessageProposalActorSequencePositionKey(
        sessionId,
        'actor-1',
        43,
      ),
    appSubjectDigest,
    causalAcceptedSequence: 1,
    causalAudience: audience,
    causalMessageCategory: Synchronization.MessageCategory.make('Domain'),
    causalOccurrenceId: ordinaryProposal.occurrenceId,
    causalOriginDeviceId: ordinaryProposal.originDeviceId,
    causalOriginPolicyGeneration: ordinaryProposal.originPolicyGeneration,
    causalOriginPolicyId: ordinaryProposal.originPolicyId,
    causalOriginProofDigest,
    causalOriginatingProcessorId: ordinaryProposal.originatingProcessorId,
    causalPolicyGeneration: 3,
    causalProposalId: ordinaryProposal.proposalId,
    causationOccurrenceId: ordinaryProposal.occurrenceId,
    clientId: clientKeyPair.clientId,
    correlationId: ordinaryProposal.correlationId,
    createdAtMs: 1_753_825_100_200,
    effectAssignmentGeneration: 1,
    effectCancellationGeneration: 0,
    effectIdempotencyKey: 'effect-result-key-1',
    effectIdempotencyPositionKey:
      makeInstantV3MessageProposalEffectIdempotencyPositionKey(
        sessionId,
        'effect-result-key-1',
      ),
    effectPlacementId: makeInstantV3EffectPlacementPositionKey(
      sessionId,
      'effect-request-1',
      1,
      0,
    ),
    effectRequestId: 'effect-request-1',
    effectRequestResultPositionKey:
      makeInstantV3MessageProposalEffectRequestResultPositionKey(
        sessionId,
        'effect-request-1',
      ),
    envelopeJson: stringifyInstantV3CanonicalJson({
      eventId: 'counter.persisted',
      version: 1,
    }),
    envelopeVersion: 1,
    eventId: 'counter.persisted',
    eventVersion: 1,
    executorClientCertificateJson: originClientCertificateJson,
    executorOriginPolicyGeneration: 2,
    executorOriginPolicyId: 'origin-policy-1',
    executorProcessorCertificateJson: originProcessorCertificateJson,
    executorProcessorId: processorKeyPair.originatingProcessorId,
    id: '00000000-0000-4000-8000-000000000003',
    instantAppId: 'instant-app-1',
    occurrenceId: 'effect-occurrence-1',
    occurrencePositionKey: makeInstantV3MessageProposalOccurrencePositionKey(
      sessionId,
      'effect-occurrence-1',
    ),
    originDeviceId: deviceKeyPair.originDeviceId,
    originatingProcessorId: processorKeyPair.originatingProcessorId,
    payloadJson: stringifyInstantV3CanonicalJson({
      _tag: 'PersistedCounter',
      revision: 1,
    }),
    programId: 'counter',
    programVersion: 7,
    proposalId: 'effect-proposal-1',
    proposalKind: 'EffectResult',
    proposalPositionKey: makeInstantV3MessageProposalPositionKey(
      sessionId,
      'effect-proposal-1',
    ),
    protocolVersion: instantV3ProgramProtocolVersion,
    sessionEpochId,
    sessionId,
    subjectId: 'subject-1',
  })
  const effectResultProposal = yield* signOriginEffectResultProposal(
    effectResultSigningRecord,
    processorSecretKey,
  )
  const enrollmentScope = OriginEnrollmentClaimProofScope.make({
    instantAppId: 'instant-app-1',
    subjectId: 'subject-1',
  })
  const ordinaryScope = OriginOrdinaryProposalProofScope.make({
    clientId: clientKeyPair.clientId,
    instantAppId: 'instant-app-1',
    originDeviceId: deviceKeyPair.originDeviceId,
    originPolicyGeneration: 2,
    originPolicyId: 'origin-policy-1',
    originatingProcessorId: processorKeyPair.originatingProcessorId,
    programId: 'counter',
    programVersion: 7,
    protocolVersion: instantV3ProgramProtocolVersion,
    sessionId,
    subjectId: 'subject-1',
  })
  const effectResultScope = OriginEffectResultProofScope.make({
    clientId: clientKeyPair.clientId,
    executorOriginPolicyGeneration: 2,
    executorOriginPolicyId: 'origin-policy-1',
    executorProcessorId: processorKeyPair.originatingProcessorId,
    instantAppId: 'instant-app-1',
    originDeviceId: deviceKeyPair.originDeviceId,
    programId: 'counter',
    programVersion: 7,
    protocolVersion: instantV3ProgramProtocolVersion,
    sessionId,
    subjectId: 'subject-1',
  })
  return {
    clientCertificate,
    clientCertificateClaims,
    clientKeyPair,
    deviceKeyPair,
    effectResultProposal,
    effectResultScope,
    effectResultSigningRecord,
    enrollmentClaim,
    enrollmentClaimSigningRecord,
    enrollmentScope,
    ordinaryProposal,
    ordinaryScope,
    ordinarySigningRecord,
    originClientCertificateJson,
    originProcessorCertificateJson,
    processorCertificate,
    processorCertificateClaims,
    processorKeyPair,
  }
})

describe('origin proof identities', () => {
  it.effect('derives deterministic self-certifying key pairs', () =>
    Effect.gen(function* () {
      const device = yield* deriveOriginDeviceKeyPair(deviceSecretKey)
      const client = yield* deriveOriginClientKeyPair(clientSecretKey)
      const processor = yield* deriveOriginProcessorKeyPair(processorSecretKey)

      expect(device.originDeviceId).toBe(expectedDeviceId)
      expect(client.clientId).toBe(expectedClientId)
      expect(processor.originatingProcessorId).toBe(expectedProcessorId)
      expect(yield* decodeOriginDeviceId(device.originDeviceId)).toBe(
        device.originDeviceId,
      )
      expect(yield* decodeOriginClientId(client.clientId)).toBe(client.clientId)
      expect(
        yield* decodeOriginProcessorId(processor.originatingProcessorId),
      ).toBe(processor.originatingProcessorId)
    }),
  )

  it.effect('rejects invalid scalars and structurally fake public keys', () =>
    Effect.gen(function* () {
      expect(
        (yield* Effect.flip(deriveOriginDeviceKeyPair(new Uint8Array(31))))
          ._tag,
      ).toBe('OriginProofSecretKeyError')
      expect(
        (yield* Effect.flip(deriveOriginClientKeyPair(new Uint8Array(32))))
          ._tag,
      ).toBe('OriginProofSecretKeyError')
      expect(
        (yield* Effect.flip(deriveOriginProcessorKeyPair(p256Order)))._tag,
      ).toBe('OriginProofSecretKeyError')

      const offCurve = Encoding.encodeBase64Url(
        Uint8Array.from([2, ...new Array<number>(32).fill(255)]),
      )
      expect((yield* Effect.exit(decodeOriginDeviceId(offCurve)))._tag).toBe(
        'Failure',
      )
    }),
  )
})

describe('protocol-v3 origin proof tuples', () => {
  it.effect(
    'uses separate fixed domains and complete ordered field lists',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        expect(originEnrollmentClaimDomain).toBe(
          'foldkit.instant.v3.origin-enrollment-claim',
        )
        expect(originOrdinaryProposalDomain).toBe(
          'foldkit.instant.v3.ordinary-message-proposal',
        )
        expect(originEffectResultDomain).toBe(
          'foldkit.instant.v3.effect-result-proposal',
        )
        expect(originProofFormatVersion).toBe(1)
        expect(new Set(originOrdinaryProposalSigningFields).size).toBe(
          originOrdinaryProposalSigningFields.length,
        )
        expect(new Set(originEffectResultSigningFields).size).toBe(
          originEffectResultSigningFields.length,
        )
        expect(new Set(originEnrollmentClaimSigningFields).size).toBe(
          originEnrollmentClaimSigningFields.length,
        )
        expect([...originEnrollmentClaimSigningFields].sort()).toStrictEqual(
          Object.keys(fixture.enrollmentClaim)
            .filter(field => field !== 'claimSignature')
            .sort(),
        )
        expect([...originOrdinaryProposalSigningFields].sort()).toStrictEqual(
          Object.keys(fixture.ordinaryProposal)
            .filter(field => field !== 'originProposalSignature')
            .sort(),
        )
        expect([...originEffectResultSigningFields].sort()).toStrictEqual(
          Object.keys(fixture.effectResultProposal)
            .filter(field => field !== 'executorResultSignature')
            .sort(),
        )
        expect(originEnrollmentClaimSigningFields).toContain(
          'enrollmentClaimPositionKey',
        )
        expect(originOrdinaryProposalSigningFields).toContain(
          'admissionClaimJson',
        )
        expect(originOrdinaryProposalSigningFields).toEqual(
          expect.arrayContaining([
            'actorSequencePositionKey',
            'messageIdempotencyPositionKey',
            'occurrencePositionKey',
            'proposalPositionKey',
          ]),
        )
        expect(originOrdinaryProposalSigningFields).not.toContain(
          'originProposalSignature',
        )
        expect(originEffectResultSigningFields).toContain(
          'executorClientCertificateJson',
        )
        expect(originEffectResultSigningFields).toContain(
          'causalOriginProofDigest',
        )
        expect(originEffectResultSigningFields).toEqual(
          expect.arrayContaining([
            'actorSequencePositionKey',
            'effectIdempotencyPositionKey',
            'effectRequestResultPositionKey',
            'occurrencePositionKey',
            'proposalPositionKey',
          ]),
        )
        expect(originEffectResultSigningFields).not.toContain(
          'executorResultSignature',
        )

        const enrollmentBytes = utf8.decode(
          yield* canonicalOriginEnrollmentClaimBytes(fixture.enrollmentClaim),
        )
        expect(enrollmentBytes).toContain(originEnrollmentClaimDomain)
        expect(enrollmentBytes).toContain(
          JSON.stringify(fixture.enrollmentClaim.enrollmentClaimPositionKey),
        )

        const ordinaryBytes = utf8.decode(
          yield* canonicalOriginOrdinaryProposalBytes(fixture.ordinaryProposal),
        )
        expect(ordinaryBytes).toContain(
          JSON.stringify(fixture.ordinaryProposal.admissionClaimJson),
        )
        for (const positionKey of [
          fixture.ordinaryProposal.actorSequencePositionKey,
          fixture.ordinaryProposal.messageIdempotencyPositionKey,
          fixture.ordinaryProposal.occurrencePositionKey,
          fixture.ordinaryProposal.proposalPositionKey,
        ]) {
          expect(ordinaryBytes).toContain(JSON.stringify(positionKey))
        }

        const effectResultBytes = utf8.decode(
          yield* canonicalOriginEffectResultBytes(fixture.effectResultProposal),
        )
        expect(effectResultBytes).toContain(
          fixture.effectResultProposal.causalOriginProofDigest,
        )
        for (const positionKey of [
          fixture.effectResultProposal.actorSequencePositionKey,
          fixture.effectResultProposal.effectIdempotencyPositionKey,
          fixture.effectResultProposal.effectRequestResultPositionKey,
          fixture.effectResultProposal.occurrencePositionKey,
          fixture.effectResultProposal.proposalPositionKey,
        ]) {
          expect(effectResultBytes).toContain(JSON.stringify(positionKey))
        }
      }),
  )

  it.effect('covers scoped proposal identity in the causal proof digest', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const otherSigningRecord = OriginOrdinaryProposalSigningRecord.make({
        ...fixture.ordinarySigningRecord,
        proposalId: 'ordinary-proposal-2',
        proposalPositionKey: makeInstantV3MessageProposalPositionKey(
          sessionId,
          'ordinary-proposal-2',
        ),
      })
      const otherProposal = yield* signOriginOrdinaryMessageProposal(
        otherSigningRecord,
        processorSecretKey,
      )

      expect(
        yield* digestOriginOrdinaryMessageProposalProof(otherProposal),
      ).not.toBe(
        yield* digestOriginOrdinaryMessageProposalProof(
          fixture.ordinaryProposal,
        ),
      )
    }),
  )

  it.effect('locks policy generation into Processor certificate bytes', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const clientBytes = yield* canonicalOriginClientCertificateBytes(
        fixture.clientCertificate,
      )
      const processorBytes = yield* canonicalOriginProcessorCertificateBytes(
        fixture.processorCertificate,
      )

      expect(utf8.decode(clientBytes)).toContain(expectedDeviceId)
      expect(utf8.decode(clientBytes)).toContain(expectedClientId)
      expect(utf8.decode(processorBytes)).toContain('"origin-policy-1",2')
      expect(utf8.decode(processorBytes)).toContain(sessionId)
    }),
  )
})

describe('protocol-v3 origin proof verification', () => {
  it.effect(
    'verifies enrollment, certificate chains, and both proposal kinds',
    () =>
      Effect.gen(function* () {
        const first = yield* makeFixture
        const second = yield* makeFixture

        expect(first.enrollmentClaim.claimSignature).toBe(
          second.enrollmentClaim.claimSignature,
        )
        expect(first.ordinaryProposal.originProposalSignature).toBe(
          second.ordinaryProposal.originProposalSignature,
        )
        expect(first.effectResultProposal.executorResultSignature).toBe(
          second.effectResultProposal.executorResultSignature,
        )
        expect(first.ordinaryProposal.originProposalSignature).not.toBe(
          first.effectResultProposal.executorResultSignature,
        )
        expect(
          yield* digestOriginOrdinaryMessageProposalProof(
            first.ordinaryProposal,
          ),
        ).toBe(first.effectResultProposal.causalOriginProofDigest)
        expect(first.effectResultProposal.causalOriginProofDigest).toHaveLength(
          64,
        )

        expect(
          yield* verifyOriginClientCertificate(first.clientCertificate),
        ).toStrictEqual(first.clientCertificate)
        expect(
          yield* verifyOriginProcessorCertificate(
            first.clientCertificate,
            first.processorCertificate,
          ),
        ).toStrictEqual(first.processorCertificate)
        expect(
          yield* verifyOriginEnrollmentClaim(
            first.enrollmentClaim,
            first.enrollmentScope,
          ),
        ).toStrictEqual(first.enrollmentClaim)
        expect(
          yield* verifyOriginOrdinaryMessageProposal(
            first.ordinaryProposal,
            first.ordinaryScope,
          ),
        ).toStrictEqual(first.ordinaryProposal)
        expect(
          yield* verifyOriginEffectResultProposal(
            first.effectResultProposal,
            first.effectResultScope,
          ),
        ).toStrictEqual(first.effectResultProposal)
      }),
  )

  it.effect(
    'rejects Processor certificate claims outside their session Program scope',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        const contradictoryClaims = [
          {
            ...fixture.processorCertificateClaims,
            programId: 'other-program',
          },
          {
            ...fixture.processorCertificateClaims,
            programVersion: 8,
          },
        ]

        for (const claims of contradictoryClaims) {
          const result = yield* Effect.result(
            makeOriginProcessorCertificate(claims, clientSecretKey),
          )
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) {
            expect(result.failure).toMatchObject({
              _tag: 'OriginProofDecodeError',
              target: 'ProcessorCertificateClaims',
            })
          }
        }
      }),
  )

  it.effect(
    'rejects a validly signed Processor certificate outside its session Program scope',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        const contradictoryClaims = {
          ...fixture.processorCertificateClaims,
          programVersion: 8,
        }
        const bytes =
          yield* canonicalOriginProcessorCertificateBytes(contradictoryClaims)
        const signature = Encoding.encodeBase64Url(
          p256.sign(bytes, clientSecretKey, {
            extraEntropy: false,
            format: 'compact',
            lowS: true,
            prehash: true,
          }),
        )
        expect(
          p256.verify(
            decodeBase64Url(signature),
            bytes,
            decodeBase64Url(fixture.clientCertificate.clientId),
            {
              format: 'compact',
              lowS: true,
              prehash: true,
            },
          ),
        ).toBe(true)

        const result = yield* Effect.result(
          verifyOriginProcessorCertificate(fixture.clientCertificate, {
            ...fixture.processorCertificate,
            programVersion: contradictoryClaims.programVersion,
            signature,
          }),
        )
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({
            _tag: 'OriginProofDecodeError',
            target: 'ProcessorCertificate',
          })
        }
      }),
  )

  it.effect('strictly decodes the canonical embedded certificate JSON', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      expect(
        yield* decodeOriginClientCertificateJson(
          fixture.originClientCertificateJson,
        ),
      ).toStrictEqual(fixture.clientCertificate)
      expect(
        yield* decodeOriginProcessorCertificateJson(
          fixture.originProcessorCertificateJson,
        ),
      ).toStrictEqual(fixture.processorCertificate)
    }),
  )

  it.effect('rejects stale or foreign ordinary origin-policy scope', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const wrongGeneration = OriginOrdinaryProposalProofScope.make({
        ...fixture.ordinaryScope,
        originPolicyGeneration: 3,
      })
      const wrongPolicy = OriginOrdinaryProposalProofScope.make({
        ...fixture.ordinaryScope,
        originPolicyId: 'origin-policy-other',
      })

      for (const scope of [wrongGeneration, wrongPolicy]) {
        const error = yield* Effect.flip(
          verifyOriginOrdinaryMessageProposal(fixture.ordinaryProposal, scope),
        )
        expect(error._tag).toBe('OriginProofScopeMismatch')
      }
    }),
  )

  it.effect('rejects stale or foreign effect-executor policy scope', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const wrongScope = OriginEffectResultProofScope.make({
        ...fixture.effectResultScope,
        executorOriginPolicyGeneration: 3,
      })
      const error = yield* Effect.flip(
        verifyOriginEffectResultProposal(
          fixture.effectResultProposal,
          wrongScope,
        ),
      )
      expect(error._tag).toBe('OriginProofScopeMismatch')
    }),
  )

  it.effect(
    'keeps ordinary and effect-result signatures non-interchangeable',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        const tamperedEffectResult = {
          ...fixture.effectResultProposal,
          executorResultSignature:
            fixture.ordinaryProposal.originProposalSignature,
        }
        const error = yield* Effect.flip(
          verifyOriginEffectResultProposal(
            tamperedEffectResult,
            fixture.effectResultScope,
          ),
        )
        expect(error).toMatchObject({
          _tag: 'OriginProofSignatureInvalid',
          signer: 'ExecutorProcessor',
        })
      }),
  )

  it.effect(
    'rejects payload, causal, executor, and composite identity tampering',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        const ordinaryTampering: ReadonlyArray<unknown> = [
          {
            ...fixture.ordinaryProposal,
            admissionClaimJson: stringifyInstantV3CanonicalJson({
              _tag: 'ActivatedInteraction',
              destinationUri: '/counters/other',
            }),
          },
          {
            ...fixture.ordinaryProposal,
            payloadJson: stringifyInstantV3CanonicalJson({ _tag: 'Tampered' }),
          },
          {
            ...fixture.ordinaryProposal,
            actorSequence: 43,
            actorSequencePositionKey:
              makeInstantV3MessageProposalActorSequencePositionKey(
                sessionId,
                fixture.ordinaryProposal.actorId,
                43,
              ),
          },
          {
            ...fixture.ordinaryProposal,
            actorSequencePositionKey:
              makeInstantV3MessageProposalActorSequencePositionKey(
                sessionId,
                fixture.ordinaryProposal.actorId,
                43,
              ),
          },
          {
            ...fixture.ordinaryProposal,
            messageIdempotencyKey: 'message-key-2',
            messageIdempotencyPositionKey:
              makeInstantV3MessageProposalMessageIdempotencyPositionKey(
                sessionId,
                'message-key-2',
              ),
          },
          {
            ...fixture.ordinaryProposal,
            messageIdempotencyPositionKey:
              makeInstantV3MessageProposalMessageIdempotencyPositionKey(
                sessionId,
                'message-key-2',
              ),
          },
          {
            ...fixture.ordinaryProposal,
            admissionOccurrenceId: 'ordinary-occurrence-2',
            occurrenceId: 'ordinary-occurrence-2',
            occurrencePositionKey:
              makeInstantV3MessageProposalOccurrencePositionKey(
                sessionId,
                'ordinary-occurrence-2',
              ),
          },
          {
            ...fixture.ordinaryProposal,
            occurrencePositionKey:
              makeInstantV3MessageProposalOccurrencePositionKey(
                sessionId,
                'ordinary-occurrence-2',
              ),
          },
          {
            ...fixture.ordinaryProposal,
            proposalId: 'ordinary-proposal-2',
            proposalPositionKey: makeInstantV3MessageProposalPositionKey(
              sessionId,
              'ordinary-proposal-2',
            ),
          },
          {
            ...fixture.ordinaryProposal,
            proposalPositionKey: makeInstantV3MessageProposalPositionKey(
              sessionId,
              'ordinary-proposal-2',
            ),
          },
        ]
        for (const proposal of ordinaryTampering) {
          expect(
            (yield* Effect.exit(
              verifyOriginOrdinaryMessageProposal(
                proposal,
                fixture.ordinaryScope,
              ),
            ))._tag,
          ).toBe('Failure')
        }

        const effectTampering: ReadonlyArray<unknown> = [
          {
            ...fixture.effectResultProposal,
            causalAcceptedSequence: 2,
          },
          {
            ...fixture.effectResultProposal,
            causalOriginProofDigest: 'c'.repeat(64),
          },
          {
            ...fixture.effectResultProposal,
            effectAssignmentGeneration: 2,
            effectPlacementId: makeInstantV3EffectPlacementPositionKey(
              sessionId,
              fixture.effectResultProposal.effectRequestId,
              2,
              fixture.effectResultProposal.effectCancellationGeneration,
            ),
          },
          {
            ...fixture.effectResultProposal,
            actorSequence: 44,
            actorSequencePositionKey:
              makeInstantV3MessageProposalActorSequencePositionKey(
                sessionId,
                fixture.effectResultProposal.actorId,
                44,
              ),
          },
          {
            ...fixture.effectResultProposal,
            actorSequencePositionKey:
              makeInstantV3MessageProposalActorSequencePositionKey(
                sessionId,
                fixture.effectResultProposal.actorId,
                44,
              ),
          },
          {
            ...fixture.effectResultProposal,
            effectIdempotencyKey: 'effect-result-key-2',
            effectIdempotencyPositionKey:
              makeInstantV3MessageProposalEffectIdempotencyPositionKey(
                sessionId,
                'effect-result-key-2',
              ),
          },
          {
            ...fixture.effectResultProposal,
            effectIdempotencyPositionKey:
              makeInstantV3MessageProposalEffectIdempotencyPositionKey(
                sessionId,
                'effect-result-key-2',
              ),
          },
          {
            ...fixture.effectResultProposal,
            effectPlacementId: makeInstantV3EffectPlacementPositionKey(
              sessionId,
              'effect-request-2',
              fixture.effectResultProposal.effectAssignmentGeneration,
              fixture.effectResultProposal.effectCancellationGeneration,
            ),
            effectRequestId: 'effect-request-2',
            effectRequestResultPositionKey:
              makeInstantV3MessageProposalEffectRequestResultPositionKey(
                sessionId,
                'effect-request-2',
              ),
          },
          {
            ...fixture.effectResultProposal,
            effectRequestResultPositionKey:
              makeInstantV3MessageProposalEffectRequestResultPositionKey(
                sessionId,
                'effect-request-2',
              ),
          },
          {
            ...fixture.effectResultProposal,
            occurrenceId: 'effect-occurrence-2',
            occurrencePositionKey:
              makeInstantV3MessageProposalOccurrencePositionKey(
                sessionId,
                'effect-occurrence-2',
              ),
          },
          {
            ...fixture.effectResultProposal,
            occurrencePositionKey:
              makeInstantV3MessageProposalOccurrencePositionKey(
                sessionId,
                'effect-occurrence-2',
              ),
          },
          {
            ...fixture.effectResultProposal,
            proposalId: 'effect-proposal-2',
            proposalPositionKey: makeInstantV3MessageProposalPositionKey(
              sessionId,
              'effect-proposal-2',
            ),
          },
          {
            ...fixture.effectResultProposal,
            proposalPositionKey: makeInstantV3MessageProposalPositionKey(
              sessionId,
              'effect-proposal-2',
            ),
          },
        ]
        for (const proposal of effectTampering) {
          expect(
            (yield* Effect.exit(
              verifyOriginEffectResultProposal(
                proposal,
                fixture.effectResultScope,
              ),
            ))._tag,
          ).toBe('Failure')
        }
      }),
  )

  it.effect(
    'separates invalid composite identities from signed recomputation attacks',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture

        const invalidEnrollmentKey = {
          ...fixture.enrollmentClaim,
          enrollmentClaimPositionKey:
            makeInstantV3OriginEnrollmentClaimPositionKey(
              fixture.enrollmentClaim.instantAppId,
              fixture.enrollmentClaim.subjectId,
              fixture.enrollmentClaim.protocolVersion,
              'other-claim',
            ),
        }
        expect(
          (yield* Effect.flip(
            verifyOriginEnrollmentClaim(
              invalidEnrollmentKey,
              fixture.enrollmentScope,
            ),
          ))._tag,
        ).toBe('OriginProofDecodeError')

        const recomputedEnrollmentKey = {
          ...invalidEnrollmentKey,
          enrollmentClaimId: 'other-claim',
        }
        expect(
          yield* Effect.flip(
            verifyOriginEnrollmentClaim(
              recomputedEnrollmentKey,
              fixture.enrollmentScope,
            ),
          ),
        ).toMatchObject({
          _tag: 'OriginProofSignatureInvalid',
          signer: 'Device',
        })

        const invalidOrdinaryKey = {
          ...fixture.ordinaryProposal,
          proposalPositionKey: makeInstantV3MessageProposalPositionKey(
            sessionId,
            'ordinary-proposal-2',
          ),
        }
        expect(
          (yield* Effect.flip(
            verifyOriginOrdinaryMessageProposal(
              invalidOrdinaryKey,
              fixture.ordinaryScope,
            ),
          ))._tag,
        ).toBe('OriginProofDecodeError')

        const recomputedOrdinaryKey = {
          ...invalidOrdinaryKey,
          proposalId: 'ordinary-proposal-2',
        }
        expect(
          yield* Effect.flip(
            verifyOriginOrdinaryMessageProposal(
              recomputedOrdinaryKey,
              fixture.ordinaryScope,
            ),
          ),
        ).toMatchObject({
          _tag: 'OriginProofSignatureInvalid',
          signer: 'Processor',
        })

        const invalidEffectKey = {
          ...fixture.effectResultProposal,
          effectRequestResultPositionKey:
            makeInstantV3MessageProposalEffectRequestResultPositionKey(
              sessionId,
              'effect-request-2',
            ),
        }
        expect(
          (yield* Effect.flip(
            verifyOriginEffectResultProposal(
              invalidEffectKey,
              fixture.effectResultScope,
            ),
          ))._tag,
        ).toBe('OriginProofDecodeError')

        const recomputedEffectKey = {
          ...invalidEffectKey,
          effectPlacementId: makeInstantV3EffectPlacementPositionKey(
            sessionId,
            'effect-request-2',
            fixture.effectResultProposal.effectAssignmentGeneration,
            fixture.effectResultProposal.effectCancellationGeneration,
          ),
          effectRequestId: 'effect-request-2',
        }
        expect(
          yield* Effect.flip(
            verifyOriginEffectResultProposal(
              recomputedEffectKey,
              fixture.effectResultScope,
            ),
          ),
        ).toMatchObject({
          _tag: 'OriginProofSignatureInvalid',
          signer: 'ExecutorProcessor',
        })
      }),
  )

  it.effect('rejects enrollment identity, app, and subject tampering', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const claims: ReadonlyArray<unknown> = [
        { ...fixture.enrollmentClaim, enrollmentClaimId: 'other-claim' },
        {
          ...fixture.enrollmentClaim,
          enrollmentClaimId: 'other-claim',
          enrollmentClaimPositionKey:
            makeInstantV3OriginEnrollmentClaimPositionKey(
              fixture.enrollmentClaim.instantAppId,
              fixture.enrollmentClaim.subjectId,
              fixture.enrollmentClaim.protocolVersion,
              'other-claim',
            ),
        },
        {
          ...fixture.enrollmentClaim,
          enrollmentClaimPositionKey:
            makeInstantV3OriginEnrollmentClaimPositionKey(
              fixture.enrollmentClaim.instantAppId,
              fixture.enrollmentClaim.subjectId,
              fixture.enrollmentClaim.protocolVersion,
              'other-claim',
            ),
        },
        { ...fixture.enrollmentClaim, instantAppId: 'instant-app-2' },
        { ...fixture.enrollmentClaim, subjectId: 'subject-2' },
      ]
      for (const claim of claims) {
        expect(
          (yield* Effect.exit(
            verifyOriginEnrollmentClaim(claim, fixture.enrollmentScope),
          ))._tag,
        ).toBe('Failure')
      }
    }),
  )

  it.effect('rejects key mismatches at every signing level', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      expect(
        (yield* Effect.flip(
          makeOriginClientCertificate(
            fixture.clientCertificateClaims,
            clientSecretKey,
          ),
        ))._tag,
      ).toBe('OriginProofKeyMismatch')
      expect(
        (yield* Effect.flip(
          makeOriginProcessorCertificate(
            fixture.processorCertificateClaims,
            processorSecretKey,
          ),
        ))._tag,
      ).toBe('OriginProofKeyMismatch')
      expect(
        (yield* Effect.flip(
          signOriginOrdinaryMessageProposal(
            fixture.ordinarySigningRecord,
            clientSecretKey,
          ),
        ))._tag,
      ).toBe('OriginProofKeyMismatch')
      expect(
        (yield* Effect.flip(
          signOriginEffectResultProposal(
            fixture.effectResultSigningRecord,
            clientSecretKey,
          ),
        ))._tag,
      ).toBe('OriginProofKeyMismatch')
    }),
  )

  it.effect('rejects a certificate chain from another Device', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const otherDevice = yield* deriveOriginDeviceKeyPair(otherSecretKey)
      const swappedClientCertificate = yield* makeOriginClientCertificate(
        OriginClientCertificateClaims.make({
          ...fixture.clientCertificateClaims,
          originDeviceId: otherDevice.originDeviceId,
        }),
        otherSecretKey,
      )
      const swappedClientCertificateJson =
        yield* encodeOriginClientCertificateJson(swappedClientCertificate)
      const tampered = {
        ...fixture.ordinaryProposal,
        originClientCertificateJson: swappedClientCertificateJson,
      }

      expect(
        (yield* Effect.exit(
          verifyOriginOrdinaryMessageProposal(tampered, fixture.ordinaryScope),
        ))._tag,
      ).toBe('Failure')
    }),
  )

  it.effect('rejects high-S, DER, padded, and wrong-length signatures', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const signature = fixture.ordinaryProposal.originProposalSignature
      const invalidSignatures = [
        toHighSSignature(signature),
        toDerSignature(signature),
        `${signature}==`,
        Encoding.encodeBase64Url(new Uint8Array(63)),
        Encoding.encodeBase64Url(new Uint8Array(64)),
      ]

      for (const invalidSignature of invalidSignatures) {
        expect(
          (yield* Effect.exit(decodeOriginSignature(invalidSignature)))._tag,
        ).toBe('Failure')
        expect(
          (yield* Effect.exit(
            verifyOriginOrdinaryMessageProposal(
              {
                ...fixture.ordinaryProposal,
                originProposalSignature: invalidSignature,
              },
              fixture.ordinaryScope,
            ),
          ))._tag,
        ).toBe('Failure')
      }
    }),
  )

  it.effect('never lets hostile proof material escape as a defect', () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture
      const hostileValues: ReadonlyArray<unknown> = [
        null,
        {},
        [],
        { ...fixture.ordinaryProposal, ignored: true },
        { ...fixture.ordinaryProposal, originProposalSignature: 42 },
        { ...fixture.ordinaryProposal, proposalPositionKey: 'not-json' },
        {
          ...fixture.ordinaryProposal,
          actorSequencePositionKey: { injected: true },
        },
        {
          ...fixture.ordinaryProposal,
          originProcessorCertificateJson: stringifyInstantV3CanonicalJson({
            unexpected: true,
          }),
        },
      ]

      for (const proposal of hostileValues) {
        const result = yield* Effect.result(
          verifyOriginOrdinaryMessageProposal(proposal, fixture.ordinaryScope),
        )
        expect(Result.isFailure(result)).toBe(true)
      }
    }),
  )

  it.effect(
    'returns typed failures for deeply nested valid-size proposal JSON',
    () =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        const hostileJson = makeNestedArrayJson(hostileCanonicalJsonDepth)
        expect(hostileJson.length).toBeLessThan(
          instantV3ProtocolLimits.canonicalJsonLength,
        )

        const ordinaryResult = yield* Effect.result(
          verifyOriginOrdinaryMessageProposal(
            { ...fixture.ordinaryProposal, payloadJson: hostileJson },
            fixture.ordinaryScope,
          ),
        )
        expect(Result.isFailure(ordinaryResult)).toBe(true)
        if (Result.isFailure(ordinaryResult)) {
          expect(ordinaryResult.failure._tag).toBe('OriginProofDecodeError')
        }

        const effectResult = yield* Effect.result(
          verifyOriginEffectResultProposal(
            { ...fixture.effectResultProposal, payloadJson: hostileJson },
            fixture.effectResultScope,
          ),
        )
        expect(Result.isFailure(effectResult)).toBe(true)
        if (Result.isFailure(effectResult)) {
          expect(effectResult.failure._tag).toBe('OriginProofDecodeError')
        }
      }),
  )
})
