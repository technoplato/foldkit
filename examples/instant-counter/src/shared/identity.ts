import { Array } from 'effect'

/** The stable Google OAuth client configured for the Foldkit Instant demo app. */
export const googleClientName = 'foldkit-google-web'

/** The current Instant counter Program identifier. */
export const programId = 'instant-counter'

/** The current Instant counter Program version. */
export const programVersion = 1

/** The stable prefix for versioned Program session identifiers. */
export const sessionIdPrefix = `${programId}:v${programVersion}:`

/** The stable prefix for headless-generated Processor room identifiers. */
export const processorRoomIdPrefix = `${sessionIdPrefix}room:`

const toHex = (value: number): string => value.toString(16).padStart(2, '0')

/** Derives one non-secret stable session identifier for an authenticated subject. */
export const deriveSessionId = async (subjectId: string): Promise<string> => {
  const input = new TextEncoder().encode(
    `${programId}:v${programVersion}:${subjectId}`,
  )
  const digest = await crypto.subtle.digest('SHA-256', input)
  const bytes = Array.fromIterable(new Uint8Array(digest))
  return `${sessionIdPrefix}${Array.join(Array.map(bytes, toHex), '')}`
}

/** Derives the stable authority Processor identifier for one Program session. */
export const authorityProcessorId = (sessionId: string): string =>
  `authority:${sessionId}`

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
