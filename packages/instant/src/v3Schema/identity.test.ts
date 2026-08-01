import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  InstantV3AdmissionClaimJson,
  InstantV3CanonicalJson,
  InstantV3CompositeKey,
  InstantV3OriginCertificateJson,
  InstantV3OriginPublicKey,
  InstantV3OriginSignature,
  InstantV3ProgramSessionId,
  InstantV3ProgramSessionIdentity,
  instantV3CanonicalJsonMaximumDepth,
  instantV3OriginPolicyProtocolVersion,
  instantV3ProtocolLimits,
  parseInstantV3ProgramSessionId,
  printInstantV3ProgramSessionId,
  stringifyInstantV3CanonicalJson,
} from './identity.js'

const appSubjectDigest = 'a'.repeat(64)
const sessionEpochId = 'e'.repeat(22)
const hostileCanonicalJsonDepth = 20_000
const makeNestedArrayJson = (depth: number): string =>
  `${'['.repeat(depth)}0${']'.repeat(depth)}`

describe('protocol-v3 session identity', () => {
  it('round trips the exact Program, protocol, app-subject, and epoch grammar', () => {
    const identity = InstantV3ProgramSessionIdentity.make({
      appSubjectDigest,
      originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
      programId: 'counter',
      programVersion: 12,
      sessionEpochId,
    })
    const sessionId = printInstantV3ProgramSessionId(identity)

    expect(sessionId).toBe(
      `counter:pv12:ip3:${appSubjectDigest}:${sessionEpochId}`,
    )
    const maybeParsed = parseInstantV3ProgramSessionId(sessionId)
    expect(Option.getOrThrow(maybeParsed)).toEqual(identity)
    expect(Option.getOrThrow(maybeParsed)).not.toHaveProperty('originPolicyId')
  })

  it('rejects noncanonical, unsafe, and differently versioned spellings at the Schema boundary', () => {
    const prefix = `counter:pv`
    const suffix = `:ip3:${appSubjectDigest}:${sessionEpochId}`
    const invalidSessionIds = [
      `${prefix}01${suffix}`,
      `${prefix}${Number.MAX_SAFE_INTEGER + 1}${suffix}`,
      `counter:pv1:ip2:${appSubjectDigest}:${sessionEpochId}`,
      `counter:pv1:ip3:${appSubjectDigest}:short`,
    ]

    for (const sessionId of invalidSessionIds) {
      expect(
        Option.isNone(
          S.decodeUnknownOption(InstantV3ProgramSessionId)(sessionId),
        ),
      ).toBe(true)
      expect(Option.isNone(parseInstantV3ProgramSessionId(sessionId))).toBe(
        true,
      )
    }
  })
})

describe('protocol-v3 canonical JSON', () => {
  it('recursively sorts object keys into one deterministic representation', () => {
    const canonical = stringifyInstantV3CanonicalJson({
      z: 1,
      a: { d: 2, b: 1 },
      rows: [{ z: 2, a: 1 }],
    })

    expect(canonical).toBe('{"a":{"b":1,"d":2},"rows":[{"a":1,"z":2}],"z":1}')
    expect(InstantV3CanonicalJson.make(canonical)).toBe(canonical)
  })

  it('rejects unsorted, non-minimal, duplicate-key, and oversized claim JSON', () => {
    const invalidJsonDocuments = [
      '{"z":1,"a":2}',
      '{ "a":1}',
      '{"a":1,"a":2}',
      '{"a":{"z":1,"b":2}}',
    ]

    for (const value of invalidJsonDocuments) {
      expect(
        Option.isNone(S.decodeUnknownOption(InstantV3CanonicalJson)(value)),
      ).toBe(true)
    }

    const oversizedClaim = JSON.stringify(
      'x'.repeat(instantV3ProtocolLimits.admissionClaimJsonLength),
    )
    expect(
      Option.isNone(
        S.decodeUnknownOption(InstantV3AdmissionClaimJson)(oversizedClaim),
      ),
    ).toBe(true)
  })

  it('bounds nesting without letting valid-size hostile JSON exhaust the stack', () => {
    const maximumDepthJson = makeNestedArrayJson(
      instantV3CanonicalJsonMaximumDepth,
    )
    expect(InstantV3CanonicalJson.make(maximumDepthJson)).toBe(maximumDepthJson)

    const overMaximumDepthJson = makeNestedArrayJson(
      instantV3CanonicalJsonMaximumDepth + 1,
    )
    const hostileJson = makeNestedArrayJson(hostileCanonicalJsonDepth)
    expect(hostileJson.length).toBeLessThan(
      instantV3ProtocolLimits.canonicalJsonLength,
    )

    for (const value of [overMaximumDepthJson, hostileJson]) {
      expect(() =>
        S.decodeUnknownOption(InstantV3CanonicalJson)(value),
      ).not.toThrow()
      expect(
        Option.isNone(S.decodeUnknownOption(InstantV3CanonicalJson)(value)),
      ).toBe(true)
    }

    let hostileValue: S.Json = 0
    for (let depth = 0; depth < hostileCanonicalJsonDepth; depth += 1) {
      hostileValue = [hostileValue]
    }
    expect(() => stringifyInstantV3CanonicalJson(hostileValue)).toThrow(
      `Expected at most ${instantV3CanonicalJsonMaximumDepth.toString()} nested JSON containers.`,
    )
  })

  it('bounds proof documents and accepts only canonical structural key material', () => {
    const compressedPublicKey = 'A2sX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKW'
    expect(InstantV3OriginPublicKey.make(compressedPublicKey)).toBe(
      compressedPublicKey,
    )
    expect(InstantV3OriginSignature.make('A'.repeat(86))).toHaveLength(86)
    expect(() => InstantV3OriginPublicKey.make('A'.repeat(44))).toThrow()
    expect(() => InstantV3OriginSignature.make(`${'A'.repeat(86)}=`)).toThrow()

    const oversizedCertificate = JSON.stringify(
      'x'.repeat(instantV3ProtocolLimits.certificateJsonLength),
    )
    expect(() =>
      InstantV3OriginCertificateJson.make(oversizedCertificate),
    ).toThrow()
  })

  it('admits only bounded canonical tagged tuples as composite keys', () => {
    const compositeKey =
      '["MessageProposal","session:with:delimiters","ActorSequence","actor:1",2]'

    expect(InstantV3CompositeKey.make(compositeKey)).toBe(compositeKey)
    expect(() => InstantV3CompositeKey.make('session:actor:1:2')).toThrow()
    expect(() => InstantV3CompositeKey.make('[1,"untagged"]')).toThrow()
    expect(() =>
      InstantV3CompositeKey.make(
        '{"entity":"MessageProposal","identity":"ProposalId"}',
      ),
    ).toThrow()
  })
})
