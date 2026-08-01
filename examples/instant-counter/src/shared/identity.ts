import { Array, Schema as S } from 'effect'
import * as Synchronization from 'foldkit/synchronization'

import { instantProgramProtocolVersion } from '@foldkit/instant'

/** The stable Google OAuth client configured for the Foldkit Instant demo app. */
export const googleClientName = 'foldkit-google-web'

/** The current Instant counter Program identifier. */
export const programId = 'instant-counter'

/** The current Instant counter Program version. */
export const programVersion = 1

/** The durable Instant protocol version required by this demo. */
export const instantCounterProtocolVersion = instantProgramProtocolVersion

/** The explicit Mirror policy retained by the current single-counter demo. */
export const instantCounterSessionPolicy =
  Synchronization.legacyMirrorSessionPolicy()

const sessionPolicyEquivalence = S.toEquivalence(Synchronization.SessionPolicy)

/** Returns whether a persisted policy is the demo's exact selected policy. */
export const isInstantCounterSessionPolicy = (
  policy: Synchronization.SessionPolicy,
): boolean => sessionPolicyEquivalence(policy, instantCounterSessionPolicy)

/** The stable prefix for versioned Program session identifiers. */
export const sessionIdPrefix = `${programId}:v${programVersion}:`

/** The stable prefix for headless-generated Processor room identifiers. */
export const processorRoomIdPrefix = `${sessionIdPrefix}room:`

const toHex = (value: number): string => value.toString(16).padStart(2, '0')

/** Computes one lowercase SHA-256 digest for a UTF-8 string. */
export type Sha256HexDigest = (value: string) => Promise<string>

/** Derives one session identifier with a platform-owned SHA-256 implementation. */
export const deriveSessionIdWithDigest = async (
  subjectId: string,
  digest: Sha256HexDigest,
): Promise<string> => {
  const value = `${programId}:v${programVersion}:${subjectId}`
  const sha256Hex = await digest(value)
  if (!/^[0-9a-f]{64}$/.test(sha256Hex)) {
    throw new Error('The session identifier digest was not lowercase SHA-256.')
  }
  return `${sessionIdPrefix}${sha256Hex}`
}

const browserSha256HexDigest: Sha256HexDigest = async value => {
  const input = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', input)
  const bytes = Array.fromIterable(new Uint8Array(digest))
  return Array.join(Array.map(bytes, toHex), '')
}

/** Derives one non-secret stable session identifier for an authenticated subject. */
export const deriveSessionId = (subjectId: string): Promise<string> =>
  deriveSessionIdWithDigest(subjectId, browserSha256HexDigest)

/** Derives the stable admission sequencer Processor identifier for one session. */
export const admissionSequencerProcessorId = (sessionId: string): string =>
  `authority:${sessionId}`

/** Compatibility alias for the persisted pre-release session field name. */
export const authorityProcessorId = admissionSequencerProcessorId

/** Recognizes one high-entropy room identifier minted by the trusted headless host. */
export const isProcessorRoomId = (value: string): boolean => {
  if (!value.startsWith(processorRoomIdPrefix)) {
    return false
  }
  const roomId = value.slice(processorRoomIdPrefix.length)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    roomId,
  )
}
