import {
  Array,
  Effect,
  Layer,
  Option,
  Schema as S,
  String as Str,
} from 'effect'

import type { InstantAuthUser } from '../auth/observe.js'

/** Same-origin path the Vite plugin serves for Access → Instant minting. */
export const hostedIdentitySessionPath = '/__foldkit/hosted-identity/session'

/** Public origin that starts the Knophy Access mobile login. */
export const knophyWhoamiOrigin = 'https://whoami.knophy.com'

/** Env names a non-web Client may use for the Access JWT. */
export const accessTokenEnvNames = [
  'CF_AUTHORIZATION',
  'CF_ACCESS_TOKEN',
  'KNOPHY_ACCESS_TOKEN',
] as const

/** Env names a non-web Client may use for the hosted mint origin. */
export const hostedIdentityOriginEnvNames = [
  'FOLDKIT_HOSTED_IDENTITY_ORIGIN',
  'EXPO_PUBLIC_HOSTED_IDENTITY_ORIGIN',
] as const

/** Client options for presenting Access to a hosted Instant mint. */
export type HostedIdentityClientOptions = Readonly<{
  accessToken?: string
  env?: Readonly<Record<string, string | undefined>>
  fetch?: typeof fetch
  sessionOrigin?: string
  sessionUrl?: string
}>

/** Access email together with the Instant refresh token minted for it. */
export const HostedInstantSession = S.Struct({
  email: S.String,
  token: S.String,
})

/** Access email together with the Instant refresh token minted for it. */
export type HostedInstantSession = typeof HostedInstantSession.Type

/** Cloudflare Access identity taken from origin headers. Never holds the JWT. */
export const AccessIdentity = S.Struct({
  email: S.String,
})

/** Cloudflare Access identity taken from origin headers. Never holds the JWT. */
export type AccessIdentity = typeof AccessIdentity.Type

/** Instant client surface required to consume a hosted Access session. */
export type HostedInstantDatabase = Readonly<{
  auth: Readonly<{
    signInWithToken: (token: string) => Promise<unknown>
  }>
  getAuth: () => Promise<InstantAuthUser | null>
}>

/** One HTTP result from the hosted-identity mint endpoint. */
export type HostedIdentityHttpResult = Readonly<{
  body: unknown
  status: number
}>

const jsonHeaders = Object.freeze({
  'cache-control': 'private, no-store',
  'content-type': 'application/json; charset=utf-8',
})

const JwtPayload = S.Struct({
  email: S.optionalKey(S.String),
  exp: S.optionalKey(S.Number),
})

const headerValue = (
  headers: Readonly<Record<string, string>>,
  name: string,
): string => {
  const exact = headers[name]
  if (exact !== undefined && exact !== '') {
    return exact
  }
  const lower = headers[name.toLowerCase()]
  if (lower !== undefined && lower !== '') {
    return lower
  } else {
    return ''
  }
}

const isUsableEmail = (value: string): boolean =>
  value !== '' && value.includes('@')

const decodeBase64UrlJson = (segment: string): Option.Option<unknown> => {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padLength = (4 - (normalized.length % 4)) % 4
    const padded = `${normalized}${'='.repeat(padLength)}`
    return Option.some(JSON.parse(atob(padded)))
  } catch {
    return Option.none()
  }
}

const processEnv = (
  env: Readonly<Record<string, string | undefined>> | undefined,
): Readonly<Record<string, string | undefined>> => {
  if (env !== undefined) {
    return env
  }
  if (typeof process === 'undefined') {
    return {}
  }
  const fromProcess = process.env
  if (fromProcess === undefined) {
    return {}
  } else {
    return fromProcess
  }
}

const firstNonEmpty = (
  env: Readonly<Record<string, string | undefined>>,
  names: ReadonlyArray<string>,
): string => {
  for (const name of names) {
    const value = env[name]
    if (value !== undefined && value.trim() !== '') {
      return value.trim()
    }
  }
  return ''
}

const isAbsoluteHttpUrl = (url: string): boolean =>
  url.startsWith('https://') || url.startsWith('http://')

const emailFromJwt = (token: string): Option.Option<string> => {
  const parts = token.split('.')
  const maybePayloadSegment = Array.get(parts, 1)
  if (Option.isNone(maybePayloadSegment)) {
    return Option.none()
  }
  const maybeJson = decodeBase64UrlJson(maybePayloadSegment.value)
  if (Option.isNone(maybeJson)) {
    return Option.none()
  }
  const maybePayload = S.decodeUnknownOption(JwtPayload)(maybeJson.value)
  if (Option.isNone(maybePayload)) {
    return Option.none()
  }
  const payload = maybePayload.value
  if (payload.exp !== undefined && payload.exp * 1000 <= Date.now()) {
    return Option.none()
  }
  const email = payload.email
  if (email === undefined || !isUsableEmail(email)) {
    return Option.none()
  } else {
    return Option.some(email)
  }
}

const cookieValue = (cookieHeader: string, name: string): string => {
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    const maybeSeparator = Str.indexOf('=')(trimmed)
    if (Option.isNone(maybeSeparator) || maybeSeparator.value <= 0) {
      continue
    }
    const separator = maybeSeparator.value
    const cookieName = trimmed.slice(0, separator)
    if (cookieName !== name) {
      continue
    }
    const raw = trimmed.slice(separator + 1)
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return ''
}

const accessTokenFromHeaders = (
  headers: Readonly<Record<string, string>>,
): string => {
  const assertion = headerValue(headers, 'cf-access-jwt-assertion').trim()
  if (assertion !== '') {
    return assertion
  }
  const fromCookie = cookieValue(
    headerValue(headers, 'cookie'),
    'CF_Authorization',
  ).trim()
  if (fromCookie !== '') {
    return fromCookie
  }
  const authorization = headerValue(headers, 'authorization').trim()
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim()
  }
  return headerValue(headers, 'cf-access-token').trim()
}

/** Reads Access email from Cloudflare identity headers or the Access JWT. */
export const accessIdentityFromHeaders = (
  headers: Readonly<Record<string, string>>,
): Option.Option<AccessIdentity> => {
  const fromHeader = headerValue(
    headers,
    'cf-access-authenticated-user-email',
  ).trim()
  if (isUsableEmail(fromHeader)) {
    return Option.some(AccessIdentity.make({ email: fromHeader }))
  }
  const token = accessTokenFromHeaders(headers)
  if (token === '') {
    return Option.none()
  }
  const maybeEmail = emailFromJwt(token)
  if (Option.isNone(maybeEmail)) {
    return Option.none()
  } else {
    return Option.some(AccessIdentity.make({ email: maybeEmail.value }))
  }
}

/** Reads Access email from a Client-held Access JWT. Never stores the JWT. */
export const accessIdentityFromToken = (
  token: string,
): Option.Option<AccessIdentity> =>
  Option.map(emailFromJwt(token.trim()), email =>
    AccessIdentity.make({ email }),
  )

/** Headers a non-browser Client sends with every `*.knophy.com` request. */
export const accessRequestHeaders = (
  token: string,
): Readonly<Record<string, string>> => {
  const trimmed = token.trim()
  return {
    authorization: `Bearer ${trimmed}`,
    'cf-access-token': trimmed,
    cookie: `CF_Authorization=${trimmed}`,
  }
}

/** Reads the Access JWT from a non-web process environment. */
export const accessTokenFromEnv = (
  env: Readonly<Record<string, string | undefined>> = processEnv(undefined),
): Option.Option<string> => {
  const token = firstNonEmpty(env, accessTokenEnvNames)
  if (token === '') {
    return Option.none()
  } else {
    return Option.some(token)
  }
}

/** Reads `cf_authorization` from a Knophy Access callback URL. */
export const accessTokenFromCallbackUrl = (
  url: string,
): Option.Option<string> => {
  try {
    const parsed = new URL(url)
    const fromQuery = parsed.searchParams.get('cf_authorization')
    if (fromQuery !== null && fromQuery !== '') {
      return Option.some(fromQuery)
    }
    const hash = parsed.hash.startsWith('#')
      ? parsed.hash.slice(1)
      : parsed.hash
    const fromHash = new URLSearchParams(hash).get('cf_authorization')
    if (fromHash !== null && fromHash !== '') {
      return Option.some(fromHash)
    } else {
      return Option.none()
    }
  } catch {
    return Option.none()
  }
}

/** Builds the Knophy Access in-app login URL for one allowlisted redirect. */
export const knophyAccessStartUrl = (redirectUri: string): string => {
  const start = new URL('/mobile/start', knophyWhoamiOrigin)
  start.searchParams.set('redirect_uri', redirectUri)
  return start.toString()
}

/** Joins a hosted origin with the Instant mint path. */
export const hostedIdentitySessionUrl = (origin: string): string => {
  const trimmed = origin.trim().replace(/\/+$/, '')
  return `${trimmed}${hostedIdentitySessionPath}`
}

/** Reads the hosted Instant mint origin from a non-web process environment. */
export const hostedIdentityOriginFromEnv = (
  env: Readonly<Record<string, string | undefined>> = processEnv(undefined),
): Option.Option<string> => {
  const origin = firstNonEmpty(env, hostedIdentityOriginEnvNames)
  if (origin === '') {
    return Option.none()
  } else {
    return Option.some(origin)
  }
}

const resolvedSessionUrl = (
  options: HostedIdentityClientOptions,
  env: Readonly<Record<string, string | undefined>>,
): string => {
  const fromSessionUrl = options.sessionUrl?.trim() ?? ''
  if (fromSessionUrl !== '') {
    return fromSessionUrl
  }
  const fromOrigin = options.sessionOrigin?.trim() ?? ''
  if (fromOrigin !== '') {
    return hostedIdentitySessionUrl(fromOrigin)
  }
  const maybeOrigin = hostedIdentityOriginFromEnv(env)
  if (Option.isSome(maybeOrigin)) {
    return hostedIdentitySessionUrl(maybeOrigin.value)
  } else {
    return hostedIdentitySessionPath
  }
}

/** Resolves mint URL, Access headers, and whether a non-web Client should fetch. */
export const resolveHostedIdentityRequest = (
  options: HostedIdentityClientOptions = {},
): Readonly<{
  accessToken: string
  headers: Readonly<Record<string, string>>
  sessionUrl: string
  shouldFetch: boolean
}> => {
  const env = processEnv(options.env)
  const fromOptions = options.accessToken?.trim() ?? ''
  const accessToken =
    fromOptions === ''
      ? Option.getOrElse(accessTokenFromEnv(env), () => '')
      : fromOptions
  const sessionUrl = resolvedSessionUrl(options, env)
  if (accessToken === '') {
    return {
      accessToken,
      headers: { accept: 'application/json' },
      sessionUrl,
      shouldFetch: !isAbsoluteHttpUrl(sessionUrl),
    }
  } else {
    return {
      accessToken,
      headers: {
        ...accessRequestHeaders(accessToken),
        accept: 'application/json',
      },
      sessionUrl,
      shouldFetch: true,
    }
  }
}

const pathnameOf = (url: string): string =>
  new URL(url, 'http://127.0.0.1').pathname

const isMemberUser = (user: InstantAuthUser): boolean => {
  if (user.isGuest === true) {
    return false
  }
  const email = user.email
  return email !== undefined && email !== null && isUsableEmail(email)
}

/**
 * Mints an Instant refresh token for the Access email on the session path.
 * Returns undefined when the request is not the hosted-identity session route.
 */
export const mintHostedInstantSession = async (
  input: Readonly<{
    createToken: (email: string) => Promise<string>
    headers: Readonly<Record<string, string>>
    method: string
    url: string
  }>,
): Promise<HostedIdentityHttpResult | undefined> => {
  if (pathnameOf(input.url) !== hostedIdentitySessionPath) {
    return undefined
  }
  const method = input.method.toUpperCase()
  if (method === 'OPTIONS') {
    return { body: {}, status: 204 }
  }
  if (method !== 'GET' && method !== 'HEAD') {
    return { body: { error: 'MethodNotAllowed' }, status: 405 }
  }
  const maybeIdentity = accessIdentityFromHeaders(input.headers)
  if (Option.isNone(maybeIdentity)) {
    return { body: { error: 'MissingAccessIdentity' }, status: 401 }
  }
  try {
    const token = await input.createToken(maybeIdentity.value.email)
    if (token === '') {
      return { body: { error: 'MintUnavailable' }, status: 503 }
    }
    return {
      body: HostedInstantSession.make({
        email: maybeIdentity.value.email,
        token,
      }),
      status: 200,
    }
  } catch {
    return { body: { error: 'MintUnavailable' }, status: 503 }
  }
}

/** Headers written with every hosted-identity mint response. */
export const hostedIdentityResponseHeaders = jsonHeaders

const memberFromAuth = (
  user: InstantAuthUser | null,
): InstantAuthUser | null => {
  if (user === null || !isMemberUser(user)) {
    return null
  } else {
    return user
  }
}

/**
 * Signs Instant in as the Access email when the origin mints a session.
 * Existing Instant members are reused. Missing Access identity is not an error.
 */
export const ensureHostedInstantSession = async (
  database: HostedInstantDatabase,
  options: HostedIdentityClientOptions = {},
): Promise<InstantAuthUser | null> => {
  const existing = memberFromAuth(await database.getAuth())
  if (existing !== null) {
    return existing
  }
  const request = resolveHostedIdentityRequest(options)
  if (!request.shouldFetch) {
    return memberFromAuth(await database.getAuth())
  }
  const runFetch = options.fetch ?? fetch
  try {
    const response = await runFetch(request.sessionUrl, {
      credentials: 'include',
      headers: request.headers,
    })
    if (!response.ok) {
      return memberFromAuth(await database.getAuth())
    }
    const maybeSession = S.decodeUnknownOption(HostedInstantSession)(
      await response.json(),
    )
    if (Option.isNone(maybeSession)) {
      return memberFromAuth(await database.getAuth())
    }
    await database.auth.signInWithToken(maybeSession.value.token)
    return memberFromAuth(await database.getAuth())
  } catch {
    return memberFromAuth(await database.getAuth())
  }
}

/** Signs Instant in as Access when a database is configured. */
export const bootHostedInstantIdentity = (
  database: HostedInstantDatabase | undefined,
  options: HostedIdentityClientOptions = {},
): Promise<void> => {
  if (database === undefined) {
    return Promise.resolve()
  }
  return ensureHostedInstantSession(database, options).then(() => undefined)
}

/**
 * Acquires Access-backed Instant identity while providing no services.
 * Runtime and React build this Layer before subscriptions start.
 */
export const hostedIdentityLayer = (
  database: HostedInstantDatabase | undefined,
  options: HostedIdentityClientOptions = {},
): Layer.Layer<never> =>
  Layer.effectDiscard(
    Effect.promise(() => bootHostedInstantIdentity(database, options)),
  )

/**
 * Merges hosted Instant identity into a Client resources Layer.
 * Product cores keep taking an already-opened Instant client.
 */
export const withHostedIdentity = <A, E = never, R = never>(
  resources: Layer.Layer<A, E, R>,
  database: HostedInstantDatabase | undefined,
  options: HostedIdentityClientOptions = {},
): Layer.Layer<A, E, R> =>
  Layer.merge(resources, hostedIdentityLayer(database, options))
