import { Option, Schema as S } from 'effect'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import type {
  AccessResponseBody,
  AccessSource,
  MintedSession,
  TranscriptionToken,
} from 'words-core-example'

import { init } from '@instantdb/admin'

import {
  type AccessVerifier,
  makeAccessVerifier,
} from '../../../packages/instant/src/hostedIdentity/accessVerifier'

const associationPath = '/.well-known/apple-app-site-association'
const accessIdentityPath = '/__words/access'
const hostedIdentitySessionPath = '/__foldkit/hosted-identity/session'
const transcriptionTokenPath = '/__words/transcription-token'

const MILLISECONDS_PER_SECOND = 1_000
const HTTP_OK = 200
const HTTP_UNAUTHORIZED = 401
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_CONFLICT = 409
const HTTP_UNAVAILABLE = 503

const deepgramGrantUrl = 'https://api.deepgram.com/v1/auth/grant'
const deepgramModel = 'nova-3'
const TRANSCRIPTION_TOKEN_TTL_SECONDS = 30
const UPSTREAM_TIMEOUT_MS = 5_000

/**
 * Creating a Scribe account from the Cloudflare Access email stays off until
 * the main session has reviewed the guest-into-existing-account merge proof
 * (ADR 0012). Set to `1` to let the session mint create the account.
 */
const accountCreationEnvName = 'WORDS_CREATE_SCRIBE_ACCOUNT_FROM_ACCESS'

/**
 * ADR 0014's sharing fields are live only where the schema was pushed. Set to
 * `live` for an Instant app that has them; production stays `AwaitingSchema`
 * until Michael approves the push, so the web never writes missing fields.
 */
const sharingSchemaEnvName = 'WORDS_SHARING_SCHEMA'

/** The Cloudflare Access team whose signed logins words.knophy.com accepts. */
const accessTeamDomainEnvName = 'CF_ACCESS_TEAM_DOMAIN'
const defaultAccessTeamDomain = 'chimaeramedia.cloudflareaccess.com'

/**
 * The Access application audience tags (AUD) a login must carry, comma
 * separated, like `9784de87…`. Empty accepts any application of the team.
 */
const accessAudienceEnvName = 'CF_ACCESS_AUD'

const accessAudiences = (): ReadonlyArray<string> =>
  (process.env[accessAudienceEnvName] ?? '')
    .split(',')
    .map(audience => audience.trim())
    .filter(audience => audience !== '')

const makeEnvAccessVerifier = (): AccessVerifier =>
  makeAccessVerifier({
    teamDomain:
      (process.env[accessTeamDomainEnvName] ?? '').trim() ||
      defaultAccessTeamDomain,
    audiences: accessAudiences(),
  })

const AccessClaims = S.Struct({
  email: S.optionalKey(S.String),
  exp: S.optionalKey(S.Number),
})
const decodeAccessClaims = S.decodeUnknownOption(S.fromJsonString(AccessClaims))

const DeepgramGrant = S.Struct({
  access_token: S.String,
  expires_in: S.Number,
})
const decodeDeepgramGrant = S.decodeUnknownOption(DeepgramGrant)

type RequestIdentity = Readonly<{
  email: string
  source: AccessSource
  maybeExpiresAtMs: Option.Option<number>
}>

const pathOf = (request: IncomingMessage): string =>
  (request.url ?? '').split('?')[0] ?? ''

const isLoopbackSocket = (request: IncomingMessage): boolean => {
  const address = request.socket.remoteAddress ?? ''
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  )
}

const loopbackHostnames: ReadonlyArray<string> = [
  '127.0.0.1',
  'localhost',
  '[::1]',
]

const hostnameOf = (request: IncomingMessage): string =>
  (request.headers.host ?? '').replace(/:\d+$/, '').toLowerCase()

/**
 * A request made on this Mac to the loopback address. The words tunnel also
 * connects from loopback but keeps `Host: words.knophy.com`, so it never
 * counts as a local preview and never gets the loopback identity.
 */
const isLocalPreviewRequest = (request: IncomingMessage): boolean =>
  isLoopbackSocket(request) && loopbackHostnames.includes(hostnameOf(request))

const expiresAtMsOf = (assertion: string): Option.Option<number> =>
  Option.flatMap(
    decodeAccessClaims(
      Buffer.from(assertion.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ),
    claims =>
      Option.map(
        Option.fromNullishOr(claims.exp),
        expiresAt => expiresAt * MILLISECONDS_PER_SECOND,
      ),
  )

const VERIFICATION_LOG_INTERVAL_MS = 60_000

const verificationLog = { hasVerified: false, lastRejectionLogAtMs: 0 }

/**
 * Logs the first verified Access login after start, and rejected ones at most
 * once a minute, without the email, so a deploy can be checked from the log.
 */
const noteVerification = (isVerified: boolean): void => {
  const nowMs = Date.now()
  if (isVerified && !verificationLog.hasVerified) {
    verificationLog.hasVerified = true
    console.log('words: verified a Cloudflare Access login')
  } else if (
    !isVerified &&
    nowMs - verificationLog.lastRejectionLogAtMs >= VERIFICATION_LOG_INTERVAL_MS
  ) {
    verificationLog.lastRejectionLogAtMs = nowMs
    console.log(
      'words: rejected a Cloudflare Access login (signature, issuer, expiry or audience)',
    )
  }
}

/**
 * The identity in the `Cf-Access-Jwt-Assertion` Cloudflare Access signs, once
 * its signature, issuer, expiry and audience check out. The bare
 * `Cf-Access-Authenticated-User-Email` header is never trusted: anything that
 * reaches the origin without passing Access can send it.
 */
const cloudflareIdentityOf = async (
  request: IncomingMessage,
  verifier: AccessVerifier,
): Promise<Option.Option<RequestIdentity>> => {
  const assertion = request.headers['cf-access-jwt-assertion']
  if (typeof assertion !== 'string' || assertion.trim() === '') {
    return Option.none()
  }
  const maybeVerified = await verifier.verify(assertion)
  noteVerification(Option.isSome(maybeVerified))
  return Option.map(maybeVerified, ({ email }) => ({
    email,
    source: 'CloudflareAccess',
    maybeExpiresAtMs: expiresAtMsOf(assertion),
  }))
}

const loopbackIdentityOf = (
  request: IncomingMessage,
): Option.Option<RequestIdentity> => {
  const email = (
    process.env['FOLDKIT_HOSTED_IDENTITY_LOOPBACK_EMAIL'] ?? ''
  ).trim()
  if (isLocalPreviewRequest(request) && email.includes('@')) {
    return Option.some({
      email,
      source: 'Loopback',
      maybeExpiresAtMs: Option.none(),
    })
  } else {
    return Option.none()
  }
}

/**
 * Who the request comes from: the identity Cloudflare Access signs on
 * words.knophy.com, or, for a preview opened on this Mac at 127.0.0.1, the
 * configured loopback email.
 */
const requestIdentityOf = async (
  request: IncomingMessage,
  verifier: AccessVerifier,
): Promise<Option.Option<RequestIdentity>> =>
  Option.orElse(await cloudflareIdentityOf(request, verifier), () =>
    loopbackIdentityOf(request),
  )

const writeJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

type AdminDatabase = ReturnType<typeof init>

type AdminAccess = Readonly<{
  database: () => Option.Option<AdminDatabase>
}>

const makeAdminAccess = (): AdminAccess => {
  const databases = new Map<string, AdminDatabase>()
  return {
    database: () => {
      const appId = process.env['INSTANT_APP_ID'] ?? ''
      const adminToken = process.env['INSTANT_APP_ADMIN_TOKEN'] ?? ''
      if (appId === '' || adminToken === '') {
        return Option.none()
      } else {
        const existing = databases.get(appId)
        if (existing !== undefined) {
          return Option.some(existing)
        } else {
          const database = init({ appId, adminToken })
          databases.set(appId, database)
          return Option.some(database)
        }
      }
    },
  }
}

const hasScribeUser = async (
  database: AdminDatabase,
  email: string,
): Promise<boolean> => {
  const result = await database.query({ $users: { $: { where: { email } } } })
  return result.$users.length > 0
}

const isAccountCreationEnabled = (): boolean =>
  process.env[accountCreationEnvName] === '1'

const sharingMode = (): 'Enabled' | 'AwaitingSchema' =>
  process.env[sharingSchemaEnvName] === 'live' ? 'Enabled' : 'AwaitingSchema'

const accessResponseOf = (
  identity: RequestIdentity,
  isExisting: boolean,
): AccessResponseBody => ({
  email: identity.email,
  source: identity.source,
  ...Option.match(identity.maybeExpiresAtMs, {
    onNone: () => ({}),
    onSome: expiresAtMs => ({ expiresAtMs }),
  }),
  scribeAccount: isExisting ? 'Exists' : 'Missing',
  accountCreation: isAccountCreationEnabled() ? 'Enabled' : 'Disabled',
  sharing: sharingMode(),
})

const answerAccess = async (
  request: IncomingMessage,
  response: ServerResponse,
  admin: AdminAccess,
  verifier: AccessVerifier,
): Promise<void> => {
  const maybeIdentity = await requestIdentityOf(request, verifier)
  const maybeDatabase = admin.database()
  if (Option.isNone(maybeIdentity)) {
    writeJson(response, HTTP_UNAUTHORIZED, { error: 'MissingAccessIdentity' })
  } else if (Option.isNone(maybeDatabase)) {
    writeJson(response, HTTP_UNAVAILABLE, { error: 'CheckUnavailable' })
  } else {
    const identity = maybeIdentity.value
    const isExisting = await hasScribeUser(maybeDatabase.value, identity.email)
    writeJson(response, HTTP_OK, accessResponseOf(identity, isExisting))
  }
}

const answerSession = async (
  request: IncomingMessage,
  response: ServerResponse,
  admin: AdminAccess,
  verifier: AccessVerifier,
): Promise<void> => {
  const maybeIdentity = await requestIdentityOf(request, verifier)
  const maybeDatabase = admin.database()
  if (Option.isNone(maybeIdentity)) {
    writeJson(response, HTTP_UNAUTHORIZED, { error: 'MissingAccessIdentity' })
  } else if (Option.isNone(maybeDatabase)) {
    writeJson(response, HTTP_UNAVAILABLE, { error: 'MintUnavailable' })
  } else {
    const database = maybeDatabase.value
    const { email } = maybeIdentity.value
    const isExisting = await hasScribeUser(database, email)
    if (isExisting || isAccountCreationEnabled()) {
      const token = await database.auth.createToken({ email })
      if (!isExisting) {
        console.log(
          `words: created the Scribe account for ${email} from Cloudflare Access (${accountCreationEnvName}=1)`,
        )
      }
      const session: MintedSession = { email, token: String(token) }
      writeJson(response, HTTP_OK, session)
    } else {
      writeJson(response, HTTP_CONFLICT, { error: 'ConnectIPhoneFirst', email })
    }
  }
}

const deepgramKey = (): string =>
  (
    process.env['DEEPGRAM_API_KEY'] ??
    process.env['deepgram_api_key'] ??
    ''
  ).trim()

const answerTranscriptionToken = async (
  request: IncomingMessage,
  response: ServerResponse,
  verifier: AccessVerifier,
): Promise<void> => {
  const key = deepgramKey()
  if (request.method !== 'POST') {
    writeJson(response, HTTP_METHOD_NOT_ALLOWED, { error: 'MethodNotAllowed' })
  } else if (Option.isNone(await requestIdentityOf(request, verifier))) {
    writeJson(response, HTTP_UNAUTHORIZED, { error: 'MissingAccessIdentity' })
  } else if (key === '') {
    writeJson(response, HTTP_UNAVAILABLE, { error: 'TranscriptionUnavailable' })
  } else {
    const grant = await fetch(deepgramGrantUrl, {
      method: 'POST',
      headers: {
        authorization: `Token ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: TRANSCRIPTION_TOKEN_TTL_SECONDS }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    const maybeGrant = grant.ok
      ? decodeDeepgramGrant(await grant.json())
      : Option.none()
    Option.match(maybeGrant, {
      onNone: () =>
        writeJson(response, HTTP_UNAVAILABLE, {
          error: 'TranscriptionUnavailable',
        }),
      onSome: ({ access_token, expires_in }) => {
        const token: TranscriptionToken = {
          provider: 'Deepgram',
          accessToken: access_token,
          expiresInSeconds: expires_in,
          model: deepgramModel,
        }
        writeJson(response, HTTP_OK, token)
      },
    })
  }
}

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void

const unavailableOnFailure =
  (error: string) =>
  (response: ServerResponse) =>
  (cause: unknown): void => {
    console.error(`words: ${error}: ${String(cause)}`)
    if (!response.headersSent) {
      writeJson(response, HTTP_UNAVAILABLE, { error })
    }
  }

/**
 * Cloudflare Access lets `/.well-known/apple-app-site-association` and every
 * path under it through without login. Only the file itself is served there;
 * anything longer, like `…/apple-app-site-association/..%2F..%2Findex.html`,
 * is refused, so a path the origin decodes differently than Access cannot
 * reach the app without login.
 */
const isUnderAssociationBypass = (requestPath: string): boolean =>
  requestPath.startsWith(associationPath) && requestPath !== associationPath

/**
 * The identity endpoints. `verifier` checks Cloudflare Access logins; the
 * preview builds one from `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`.
 */
export const makeIdentityMiddleware = (
  verifier: AccessVerifier = makeEnvAccessVerifier(),
  admin: AdminAccess = makeAdminAccess(),
): Middleware => {
  return (request, response, next) => {
    const requestPath = pathOf(request)
    if (isUnderAssociationBypass(requestPath)) {
      writeJson(response, HTTP_NOT_FOUND, { error: 'NotFound' })
    } else if (requestPath === accessIdentityPath) {
      void answerAccess(request, response, admin, verifier).catch(
        unavailableOnFailure('CheckUnavailable')(response),
      )
    } else if (requestPath === hostedIdentitySessionPath) {
      void answerSession(request, response, admin, verifier).catch(
        unavailableOnFailure('MintUnavailable')(response),
      )
    } else if (requestPath === transcriptionTokenPath) {
      void answerTranscriptionToken(request, response, verifier).catch(
        unavailableOnFailure('TranscriptionUnavailable')(response),
      )
    } else {
      next()
    }
  }
}

/**
 * Serves the universal links file as JSON, which Apple's CDN requires, in dev
 * and preview. Cloudflare Access lets only this path through without login.
 */
export const appleAppSiteAssociation = (): Plugin => {
  const body = readFileSync(
    path.resolve(__dirname, 'public/.well-known/apple-app-site-association'),
    'utf8',
  )
  const serve: Middleware = (request, response, next) => {
    if (pathOf(request) === associationPath) {
      response.setHeader('content-type', 'application/json')
      response.setHeader('cache-control', 'public, max-age=300')
      response.end(body)
    } else {
      next()
    }
  }
  return {
    name: 'words-apple-app-site-association',
    configureServer: server => {
      server.middlewares.use(serve)
    },
    configurePreviewServer: server => {
      server.middlewares.use(serve)
    },
  }
}

/**
 * Web Scribe's identity endpoints, all behind Cloudflare Access:
 *
 * - `GET /__words/access` says who Access says the listener is and whether
 *   Scribe's Instant app has that account, without creating anything.
 * - `GET /__foldkit/hosted-identity/session` mints an Instant session for the
 *   Access email, like Foldkit's hosted identity, but only when that account
 *   already exists. The guest upgrade audit (ADR 0012) found that creating the
 *   email account before the iPhone upgrades its guest strands the phone's
 *   recordings on a linked guest, so until the iPhone signs in it answers 409
 *   `ConnectIPhoneFirst`. `WORDS_CREATE_SCRIBE_ACCOUNT_FROM_ACCESS=1` lifts
 *   that rule once the existing-account merge is proven.
 * - `POST /__words/transcription-token` mints a 30 second Deepgram token that
 *   opens one live transcription stream; the API key never leaves the origin.
 *
 * Identity comes only from a `Cf-Access-Jwt-Assertion` whose signature,
 * issuer, expiry and audience (`CF_ACCESS_AUD`) check out. A request opened on
 * this Mac at 127.0.0.1 without Access headers counts as
 * `FOLDKIT_HOSTED_IDENTITY_LOOPBACK_EMAIL`.
 */
export const wordsHostedIdentity = (): Plugin => {
  const announce = () =>
    console.log(
      `words: creating Scribe accounts from Cloudflare Access is ${isAccountCreationEnabled() ? 'ON' : 'OFF'}; sharing is ${sharingMode()}; live transcription is ${deepgramKey() === '' ? 'not configured' : 'Deepgram'}; Access logins are verified (${accessAudiences().length} audience${accessAudiences().length === 1 ? '' : 's'} required)`,
    )
  return {
    name: 'words-hosted-identity',
    configureServer: server => {
      announce()
      server.middlewares.use(makeIdentityMiddleware())
    },
    configurePreviewServer: server => {
      announce()
      server.middlewares.use(makeIdentityMiddleware())
    },
  }
}

/**
 * Local development only: when `WORDS_DEV_IMPERSONATE_USER_ID` is set, `vite
 * dev` signs the local browser in as that Instant user, for example the
 * iPhone's guest account, so the web can be checked against real recordings.
 * `vite preview`, which serves words.knophy.com, never loads this.
 */
export const devImpersonation = (): Plugin => ({
  name: 'words-dev-impersonation',
  apply: 'serve',
  configureServer: server => {
    const userID = process.env['WORDS_DEV_IMPERSONATE_USER_ID'] ?? ''
    const appId = process.env['INSTANT_APP_ID'] ?? ''
    const adminToken = process.env['INSTANT_APP_ADMIN_TOKEN'] ?? ''
    if (userID === '' || appId === '' || adminToken === '') {
      return
    }
    const database = init({ appId, adminToken })
    const impersonatedEmail = 'dev-impersonation@words.invalid'
    server.middlewares.use((request, response, next) => {
      const requestPath = pathOf(request)
      if (!isLocalPreviewRequest(request)) {
        next()
      } else if (requestPath === accessIdentityPath) {
        const body: AccessResponseBody = {
          email: impersonatedEmail,
          source: 'Loopback',
          scribeAccount: 'Exists',
          sharing: sharingMode(),
        }
        writeJson(response, HTTP_OK, body)
      } else if (requestPath === hostedIdentitySessionPath) {
        void database.auth.createToken({ id: userID }).then(
          token => {
            const session: MintedSession = {
              email: impersonatedEmail,
              token: String(token),
            }
            writeJson(response, HTTP_OK, session)
          },
          () =>
            writeJson(response, HTTP_UNAVAILABLE, { error: 'MintUnavailable' }),
        )
      } else {
        next()
      }
    })
  },
})
