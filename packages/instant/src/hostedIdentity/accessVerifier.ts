import { Array, Option, Schema as S } from 'effect'

import { AccessIdentity } from './hostedIdentity.js'

// MODEL

const AccessJwtHeader = S.Struct({
  alg: S.Literal('RS256'),
  kid: S.String,
})

const AccessJwtPayload = S.Struct({
  email: S.String,
  exp: S.Number,
  iss: S.String,
  aud: S.Union([S.String, S.Array(S.String)]),
})
type AccessJwtPayload = typeof AccessJwtPayload.Type

const AccessSigningKey = S.Struct({
  kid: S.String,
  kty: S.Literal('RSA'),
  n: S.String,
  e: S.String,
})
type AccessSigningKey = typeof AccessSigningKey.Type

const AccessCerts = S.Struct({ keys: S.Array(AccessSigningKey) })

/**
 * Checks Cloudflare Access logins before an origin trusts the email in
 * them: the signature against the team's published keys, the issuer, the
 * expiry, and, when `audiences` is not empty, the Access application.
 */
export type AccessVerifier = Readonly<{
  verify: (token: string) => Promise<Option.Option<AccessIdentity>>
}>

/** Where an Access verifier finds its team and keys. */
export type AccessVerifierConfig = Readonly<{
  teamDomain: string
  audiences: ReadonlyArray<string>
  fetch?: (url: string) => Promise<Response>
  nowMs?: () => number
}>

const certsTtlMs = 60 * 60 * 1000

const refetchFloorMs = 60 * 1000

const signatureAlgorithm: RsaHashedImportParams = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
}

// DECODE

const bytesOfBase64Url = (
  segment: string,
): Option.Option<Uint8Array<ArrayBuffer>> => {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`
    const binary = atob(padded)
    return Option.some(
      Uint8Array.from(binary, character => character.charCodeAt(0)),
    )
  } catch {
    return Option.none()
  }
}

const jsonOfBase64Url = (segment: string): Option.Option<unknown> =>
  Option.flatMap(bytesOfBase64Url(segment), bytes => {
    try {
      return Option.some(JSON.parse(new TextDecoder().decode(bytes)))
    } catch {
      return Option.none()
    }
  })

type SplitToken = Readonly<{
  signed: string
  header: typeof AccessJwtHeader.Type
  payload: AccessJwtPayload
  signature: Uint8Array<ArrayBuffer>
}>

const splitToken = (token: string): Option.Option<SplitToken> => {
  const parts = token.trim().split('.')
  const [headerPart, payloadPart, signaturePart] = parts
  if (
    parts.length !== 3 ||
    headerPart === undefined ||
    payloadPart === undefined ||
    signaturePart === undefined
  ) {
    return Option.none()
  }
  return Option.all({
    header: Option.flatMap(
      jsonOfBase64Url(headerPart),
      S.decodeUnknownOption(AccessJwtHeader),
    ),
    payload: Option.flatMap(
      jsonOfBase64Url(payloadPart),
      S.decodeUnknownOption(AccessJwtPayload),
    ),
    signature: bytesOfBase64Url(signaturePart),
  }).pipe(
    Option.map(decoded => ({
      ...decoded,
      signed: `${headerPart}.${payloadPart}`,
    })),
  )
}

const audiencesOf = (payload: AccessJwtPayload): ReadonlyArray<string> =>
  typeof payload.aud === 'string' ? [payload.aud] : payload.aud

const isAcceptedClaims = (
  payload: AccessJwtPayload,
  config: AccessVerifierConfig,
  nowMs: number,
): boolean =>
  payload.iss === `https://${config.teamDomain}` &&
  payload.exp * 1000 > nowMs &&
  payload.email.includes('@') &&
  (Array.isReadonlyArrayEmpty(config.audiences) ||
    Array.some(audiencesOf(payload), audience =>
      Array.contains(config.audiences, audience),
    ))

// VERIFY

/**
 * An Access verifier for one team. It fetches the team's public keys from
 * `https://<team>/cdn-cgi/access/certs`, keeps them for an hour, and
 * fetches again when a login names a key it has not seen, at most once a
 * minute, so Cloudflare can rotate keys without a restart and a flood of
 * made-up keys cannot flood Cloudflare. A login that fails any check is
 * None.
 *
 * @example
 * ```typescript
 * const verifier = makeAccessVerifier({ teamDomain: 'chimaeramedia.cloudflareaccess.com', audiences: [] })
 * await verifier.verify(token) // Some({ email: 'owner@example.com' }), or None for a forged or expired login
 * ```
 */
export const makeAccessVerifier = (
  config: AccessVerifierConfig,
): AccessVerifier => {
  const fetchCerts = config.fetch ?? globalThis.fetch
  const nowMs = config.nowMs ?? Date.now
  let maybeCached: Option.Option<
    Readonly<{ fetchedAtMs: number; keys: ReadonlyArray<AccessSigningKey> }>
  > = Option.none()

  const freshKeys = async (): Promise<ReadonlyArray<AccessSigningKey>> => {
    const response = await fetchCerts(
      `https://${config.teamDomain}/cdn-cgi/access/certs`,
    )
    const keys = Option.match(
      S.decodeUnknownOption(AccessCerts)(await response.json()),
      { onNone: () => [], onSome: certs => certs.keys },
    )
    maybeCached = Option.some({ fetchedAtMs: nowMs(), keys })
    return keys
  }

  const ageOf = (fetchedAtMs: number): number => nowMs() - fetchedAtMs

  const keyFor = async (
    kid: string,
  ): Promise<Option.Option<AccessSigningKey>> => {
    const maybeFresh = Option.filter(
      maybeCached,
      cached => ageOf(cached.fetchedAtMs) < certsTtlMs,
    )
    const maybeCachedKey = Option.flatMap(maybeFresh, cached =>
      Array.findFirst(cached.keys, key => key.kid === kid),
    )
    const mayRefetch = !Option.exists(
      maybeCached,
      cached => ageOf(cached.fetchedAtMs) < refetchFloorMs,
    )
    if (Option.isSome(maybeCachedKey)) {
      return maybeCachedKey
    } else if (Option.isSome(maybeFresh) && !mayRefetch) {
      return Option.none()
    } else {
      return Array.findFirst(await freshKeys(), key => key.kid === kid)
    }
  }

  const isSignedBy = async (
    split: SplitToken,
    key: AccessSigningKey,
  ): Promise<boolean> => {
    const publicKey = await globalThis.crypto.subtle.importKey(
      'jwk',
      { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true },
      signatureAlgorithm,
      false,
      ['verify'],
    )
    return globalThis.crypto.subtle.verify(
      signatureAlgorithm,
      publicKey,
      split.signature,
      new TextEncoder().encode(split.signed),
    )
  }

  const verify = async (
    token: string,
  ): Promise<Option.Option<AccessIdentity>> => {
    const maybeSplit = Option.filter(splitToken(token), split =>
      isAcceptedClaims(split.payload, config, nowMs()),
    )
    if (Option.isNone(maybeSplit)) {
      return Option.none()
    }
    const split = maybeSplit.value
    const maybeKey = await keyFor(split.header.kid)
    if (Option.isNone(maybeKey)) {
      return Option.none()
    }
    return (await isSignedBy(split, maybeKey.value))
      ? Option.some(AccessIdentity.make({ email: split.payload.email }))
      : Option.none()
  }

  return { verify }
}
