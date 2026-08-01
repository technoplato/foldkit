import { MultipleCountersProgram } from 'counters-core-example'
import { Encoding } from 'effect'

import {
  InstantV3AppSubjectDigest,
  InstantV3EntityId,
  InstantV3Identity,
  InstantV3ProgramSessionId,
  InstantV3ProgramSessionIdentity,
  InstantV3SessionEpochId,
  instantV3OriginPolicyProtocolVersion,
  printInstantV3ProgramSessionId,
} from '@foldkit/instant'
import { sha256 } from '@noble/hashes/sha2.js'
import { utf8ToBytes } from '@noble/hashes/utils.js'

const digestBytes = (
  domain: string,
  parts: ReadonlyArray<string>,
): Uint8Array => sha256(utf8ToBytes(JSON.stringify([domain, ...parts])))

const digestHex = (domain: string, parts: ReadonlyArray<string>): string =>
  Encoding.encodeHex(digestBytes(domain, parts))

const digestBase64Url = (
  domain: string,
  parts: ReadonlyArray<string>,
): string => Encoding.encodeBase64Url(digestBytes(domain, parts))

/** The first durable account session used by every Multiple Counters demo Client. */
export const multipleCountersV3SessionEpochSeed = 'first-account-session'

/** Stable account and Program identities shared by every protocol-v3 Client. */
export type MultipleCountersV3SessionIdentity = Readonly<{
  appSubjectDigest: InstantV3AppSubjectDigest
  processorRoomId: string
  sessionEpochId: InstantV3SessionEpochId
  sessionId: InstantV3ProgramSessionId
}>

/** Derives the canonical app-subject digest without exposing either input. */
export const makeMultipleCountersV3AppSubjectDigest = (
  instantAppId: string,
  subjectId: string,
): InstantV3AppSubjectDigest =>
  InstantV3AppSubjectDigest.make(
    digestHex('FoldkitInstantV3AppSubject', [instantAppId, subjectId]),
  )

/** Derives one explicit, reproducible Multiple Counters session epoch. */
export const makeMultipleCountersV3SessionIdentity = (
  input: Readonly<{
    instantAppId: string
    sessionEpochSeed: string
    subjectId: string
  }>,
): MultipleCountersV3SessionIdentity => {
  const appSubjectDigest = makeMultipleCountersV3AppSubjectDigest(
    input.instantAppId,
    input.subjectId,
  )
  const sessionEpochId = InstantV3SessionEpochId.make(
    digestBase64Url('FoldkitInstantV3SessionEpoch', [
      appSubjectDigest,
      MultipleCountersProgram.id,
      MultipleCountersProgram.version.toString(),
      input.sessionEpochSeed,
    ]),
  )
  const sessionId = printInstantV3ProgramSessionId(
    InstantV3ProgramSessionIdentity.make({
      appSubjectDigest,
      originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
      programId: MultipleCountersProgram.id,
      programVersion: MultipleCountersProgram.version,
      sessionEpochId,
    }),
  )
  return {
    appSubjectDigest,
    processorRoomId: `multiple-counters-v3-room:${digestBase64Url(
      'FoldkitInstantV3ProcessorRoom',
      [sessionId],
    )}`,
    sessionEpochId,
    sessionId,
  }
}

/** Derives one immutable origin-policy identity from its verified enrollment claim. */
export const makeMultipleCountersV3OriginPolicyId = (
  enrollmentClaimId: string,
): InstantV3Identity =>
  InstantV3Identity.make(
    `origin-policy:${digestBase64Url('FoldkitInstantV3OriginPolicy', [
      enrollmentClaimId,
    ])}`,
  )

/** Derives a UUID-v4-shaped immutable row identity from canonical logical identity. */
export const makeMultipleCountersV3EntityId = (
  entity: string,
  logicalIdentity: string,
): InstantV3EntityId => {
  const hexadecimal = digestHex('FoldkitInstantV3Entity', [
    entity,
    logicalIdentity,
  ])
  return InstantV3EntityId.make(
    `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-4${hexadecimal.slice(
      13,
      16,
    )}-8${hexadecimal.slice(17, 20)}-${hexadecimal.slice(20, 32)}`,
  )
}
