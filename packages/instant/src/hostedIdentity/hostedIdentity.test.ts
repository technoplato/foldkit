import { Array, Context, Effect, Layer, Option } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import type { InstantAuthUser } from '../auth/observe.js'
import {
  AccessIdentity,
  HostedInstantSession,
  accessIdentityFromToken,
  accessRequestHeaders,
  accessTokenFromCallbackUrl,
  accessTokenFromEnv,
  accessTokenFromHeaders,
  bootHostedInstantIdentity,
  ensureHostedInstantSession,
  hostedIdentityGetAuthTimeoutMs,
  hostedIdentityLayer,
  hostedIdentityLoopbackEmail,
  hostedIdentityOriginFromEnv,
  hostedIdentitySessionPath,
  hostedIdentitySessionUrl,
  isLocalDevelopmentRequest,
  isLoopbackRemoteAddress,
  knophyAccessStartUrl,
  knophyWhoamiOrigin,
  loopbackMintEmail,
  mintHostedInstantSession,
  resolveHostedIdentityRequest,
  withHostedIdentity,
} from './hostedIdentity.js'

const encodeSegment = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

const jwtFor = (payload: Readonly<Record<string, unknown>>): string =>
  `${encodeSegment({ alg: 'none' })}.${encodeSegment(payload)}.sig`

const memberEmail = 'owner@example.invalid'
const refreshToken = 'instant-refresh-token'

const verifiedAs =
  (email: string, accepted: string) =>
  (token: string): Promise<Option.Option<AccessIdentity>> =>
    Promise.resolve(
      token === accepted
        ? Option.some(AccessIdentity.make({ email }))
        : Option.none(),
    )

const signedToken = jwtFor({ email: memberEmail })

describe('accessTokenFromHeaders', () => {
  it('reads the login from the assertion, the cookie, Bearer, and CF-Access-Token', () => {
    expect(
      accessTokenFromHeaders({ 'cf-access-jwt-assertion': signedToken }),
    ).toBe(signedToken)
    expect(
      accessTokenFromHeaders({
        cookie: `theme=dark; CF_Authorization=${signedToken}`,
      }),
    ).toBe(signedToken)
    expect(
      accessTokenFromHeaders({ authorization: `Bearer ${signedToken}` }),
    ).toBe(signedToken)
    expect(accessTokenFromHeaders({ 'cf-access-token': signedToken })).toBe(
      signedToken,
    )
  })

  it('never takes the plain email header, which any request can send', () => {
    expect(
      accessTokenFromHeaders({
        'cf-access-authenticated-user-email': memberEmail,
      }),
    ).toBe('')
  })
})

describe('local development requests', () => {
  it('recognizes loopback TCP remotes', () => {
    expect(isLoopbackRemoteAddress(undefined)).toBe(false)
    expect(isLoopbackRemoteAddress('10.0.0.2')).toBe(false)
    expect(isLoopbackRemoteAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackRemoteAddress('::1')).toBe(true)
    expect(isLoopbackRemoteAddress('::ffff:127.0.0.1')).toBe(true)
  })

  it('is local only on this machine, to localhost, with no proxy headers', () => {
    expect(
      isLocalDevelopmentRequest({
        remoteAddress: '127.0.0.1',
        headers: { host: 'localhost:5183' },
      }),
    ).toBe(true)
    expect(
      isLocalDevelopmentRequest({
        remoteAddress: '::1',
        headers: { host: '[::1]:5183' },
      }),
    ).toBe(true)
    expect(
      isLocalDevelopmentRequest({
        remoteAddress: '127.0.0.1',
        headers: { host: 'books.pisspoursoftware.xyz' },
      }),
    ).toBe(false)
    expect(
      isLocalDevelopmentRequest({
        remoteAddress: '127.0.0.1',
        headers: { host: 'localhost:5183', 'cf-ray': '8c1f' },
      }),
    ).toBe(false)
    expect(
      isLocalDevelopmentRequest({
        remoteAddress: '127.0.0.1',
        headers: { host: 'localhost:5183', 'x-forwarded-for': '203.0.113.9' },
      }),
    ).toBe(false)
    expect(
      isLocalDevelopmentRequest({
        remoteAddress: '10.0.0.2',
        headers: { host: 'localhost:5183' },
      }),
    ).toBe(false)
  })

  it('uses the default local email unless env overrides', () => {
    expect(loopbackMintEmail({})).toBe(hostedIdentityLoopbackEmail)
    expect(
      loopbackMintEmail({
        FOLDKIT_HOSTED_IDENTITY_LOOPBACK_EMAIL: 'ops@knophy.com',
      }),
    ).toBe('ops@knophy.com')
  })
})

describe('mintHostedInstantSession', () => {
  it('ignores other paths', async () => {
    expect(
      await mintHostedInstantSession({
        createToken: () => Promise.resolve(refreshToken),
        verifyAccessToken: verifiedAs(memberEmail, signedToken),
        headers: { 'cf-access-jwt-assertion': signedToken },
        method: 'GET',
        url: '/api/me',
      }),
    ).toBeUndefined()
  })

  it('mints an Instant token for a verified Access login', async () => {
    const emails: Array<string> = []
    const result = await mintHostedInstantSession({
      createToken: email => {
        emails.push(email)
        return Promise.resolve(refreshToken)
      },
      verifyAccessToken: verifiedAs(memberEmail, signedToken),
      headers: { 'cf-access-jwt-assertion': signedToken },
      method: 'GET',
      url: `${hostedIdentitySessionPath}?unused=1`,
    })
    expect(emails).toEqual([memberEmail])
    expect(result).toEqual({
      body: HostedInstantSession.make({
        email: memberEmail,
        token: refreshToken,
      }),
      status: 200,
    })
  })

  it('refuses a forged login and a bare email header', async () => {
    const forged = jwtFor({ email: 'owner@example.invalid', exp: 9e9 })
    const refuse = (headers: Readonly<Record<string, string>>) =>
      mintHostedInstantSession({
        createToken: () => Promise.resolve(refreshToken),
        verifyAccessToken: verifiedAs(memberEmail, signedToken),
        headers,
        method: 'GET',
        url: hostedIdentitySessionPath,
      })
    expect(await refuse({ 'cf-access-jwt-assertion': forged })).toEqual({
      body: { error: 'MissingAccessIdentity' },
      status: 401,
    })
    expect(
      await refuse({ 'cf-access-authenticated-user-email': memberEmail }),
    ).toEqual({ body: { error: 'MissingAccessIdentity' }, status: 401 })
  })

  it('mints the local development email only when the caller passes it', async () => {
    const emails: Array<string> = []
    const result = await mintHostedInstantSession({
      createToken: email => {
        emails.push(email)
        return Promise.resolve(refreshToken)
      },
      verifyAccessToken: verifiedAs(memberEmail, signedToken),
      localDevelopmentEmail: hostedIdentityLoopbackEmail,
      headers: {},
      method: 'GET',
      url: hostedIdentitySessionPath,
    })
    expect(emails).toEqual([hostedIdentityLoopbackEmail])
    expect(result).toEqual({
      body: HostedInstantSession.make({
        email: hostedIdentityLoopbackEmail,
        token: refreshToken,
      }),
      status: 200,
    })
  })

  it('prefers a verified login over the local development email', async () => {
    const emails: Array<string> = []
    await mintHostedInstantSession({
      createToken: email => {
        emails.push(email)
        return Promise.resolve(refreshToken)
      },
      verifyAccessToken: verifiedAs(memberEmail, signedToken),
      localDevelopmentEmail: hostedIdentityLoopbackEmail,
      headers: { 'cf-access-jwt-assertion': signedToken },
      method: 'GET',
      url: hostedIdentitySessionPath,
    })
    expect(emails).toEqual([memberEmail])
  })

  it('fails closed when verifying or minting throws, without leaking why', async () => {
    expect(
      await mintHostedInstantSession({
        createToken: () => Promise.resolve(refreshToken),
        verifyAccessToken: () => Promise.reject(new Error('certs down')),
        headers: { 'cf-access-jwt-assertion': signedToken },
        method: 'GET',
        url: hostedIdentitySessionPath,
      }),
    ).toEqual({ body: { error: 'MissingAccessIdentity' }, status: 401 })
    const unavailable = await mintHostedInstantSession({
      createToken: () => Promise.reject(new Error('admin down')),
      verifyAccessToken: verifiedAs(memberEmail, signedToken),
      headers: { 'cf-access-jwt-assertion': signedToken },
      method: 'GET',
      url: hostedIdentitySessionPath,
    })
    expect(unavailable).toEqual({
      body: { error: 'MintUnavailable' },
      status: 503,
    })
    expect(JSON.stringify(unavailable)).not.toContain('admin down')
  })
})

describe('non-web Access credentials', () => {
  it('builds the three Access request headers', () => {
    const token = jwtFor({ email: memberEmail })
    expect(accessRequestHeaders(token)).toEqual({
      authorization: `Bearer ${token}`,
      'cf-access-token': token,
      cookie: `CF_Authorization=${token}`,
    })
  })

  it('reads the Access JWT from env names in order', () => {
    expect(
      accessTokenFromEnv({
        CF_AUTHORIZATION: memberEmail,
        CF_ACCESS_TOKEN: 'ignored',
      }),
    ).toEqual(Option.some(memberEmail))
    expect(
      accessTokenFromEnv({
        CF_ACCESS_TOKEN: '  token-two  ',
        KNOPHY_ACCESS_TOKEN: 'ignored',
      }),
    ).toEqual(Option.some('token-two'))
    expect(accessTokenFromEnv({ KNOPHY_ACCESS_TOKEN: 'token-three' })).toEqual(
      Option.some('token-three'),
    )
    expect(accessTokenFromEnv({ CF_AUTHORIZATION: '   ' })).toEqual(
      Option.none(),
    )
  })

  it('reads cf_authorization from callback query or hash', () => {
    const token = jwtFor({ email: memberEmail })
    expect(
      accessTokenFromCallbackUrl(
        `knophy-ideas://callback#cf_authorization=${token}`,
      ),
    ).toEqual(Option.some(token))
    expect(
      accessTokenFromCallbackUrl(
        `https://auth.expo.io/callback?cf_authorization=${token}`,
      ),
    ).toEqual(Option.some(token))
    expect(accessTokenFromCallbackUrl('knophy-ideas://callback')).toEqual(
      Option.none(),
    )
  })

  it('builds the Knophy Access start URL and mint URL', () => {
    expect(knophyAccessStartUrl('knophy-ideas://callback')).toBe(
      `${knophyWhoamiOrigin}/mobile/start?redirect_uri=${encodeURIComponent('knophy-ideas://callback')}`,
    )
    expect(hostedIdentitySessionUrl('https://ideas.knophy.com/')).toBe(
      `https://ideas.knophy.com${hostedIdentitySessionPath}`,
    )
    expect(
      hostedIdentityOriginFromEnv({
        EXPO_PUBLIC_HOSTED_IDENTITY_ORIGIN: 'https://ideas.knophy.com',
      }),
    ).toEqual(Option.some('https://ideas.knophy.com'))
  })

  it('reads email from a Client-held Access JWT', () => {
    expect(accessIdentityFromToken(jwtFor({ email: memberEmail }))).toEqual(
      Option.some(AccessIdentity.make({ email: memberEmail })),
    )
    expect(accessIdentityFromToken('not-a-jwt')).toEqual(Option.none())
  })

  it('fetches relative mint paths without a token and skips absolute ones', () => {
    const token = jwtFor({ email: memberEmail })
    expect(resolveHostedIdentityRequest({})).toEqual({
      accessToken: '',
      headers: { accept: 'application/json' },
      sessionUrl: hostedIdentitySessionPath,
      shouldFetch: true,
    })
    expect(
      resolveHostedIdentityRequest({
        sessionOrigin: 'https://ideas.knophy.com',
      }),
    ).toMatchObject({
      sessionUrl: `https://ideas.knophy.com${hostedIdentitySessionPath}`,
      shouldFetch: false,
    })
    expect(
      resolveHostedIdentityRequest({
        accessToken: token,
        env: {
          FOLDKIT_HOSTED_IDENTITY_ORIGIN: 'https://ideas.knophy.com',
        },
      }),
    ).toMatchObject({
      accessToken: token,
      sessionUrl: `https://ideas.knophy.com${hostedIdentitySessionPath}`,
      shouldFetch: true,
    })
  })
})

describe('ensureHostedInstantSession', () => {
  it('reuses an Instant member without minting', async () => {
    const member: InstantAuthUser = {
      email: memberEmail,
      id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      isGuest: false,
    }
    const tokens: Array<string> = []
    const next = await ensureHostedInstantSession(
      {
        auth: {
          signInWithToken: token => {
            tokens.push(token)
            return Promise.resolve(undefined)
          },
        },
        getAuth: () => Promise.resolve(member),
      },
      {
        fetch: () => {
          throw new Error('mint should not run')
        },
      },
    )
    expect(next).toEqual(member)
    expect(tokens).toEqual([])
  })

  it('signs Instant in with a minted Access session', async () => {
    const member: InstantAuthUser = {
      email: memberEmail,
      id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      isGuest: false,
    }
    let signedIn = false
    const tokens: Array<string> = []
    const next = await ensureHostedInstantSession(
      {
        auth: {
          signInWithToken: token => {
            tokens.push(token)
            signedIn = true
            return Promise.resolve(undefined)
          },
        },
        getAuth: () => Promise.resolve(signedIn ? member : null),
      },
      {
        fetch: async () =>
          new Response(
            JSON.stringify(
              HostedInstantSession.make({
                email: memberEmail,
                token: refreshToken,
              }),
            ),
            { status: 200 },
          ),
      },
    )
    expect(tokens).toEqual([refreshToken])
    expect(next).toEqual(member)
  })

  it('leaves Instant unsigned when Access is absent', async () => {
    await bootHostedInstantIdentity(undefined)
    const next = await ensureHostedInstantSession(
      {
        auth: {
          signInWithToken: () => Promise.reject(new Error('unused')),
        },
        getAuth: () => Promise.resolve(null),
      },
      {
        fetch: async () =>
          new Response(JSON.stringify({ error: 'MissingAccessIdentity' }), {
            status: 401,
          }),
      },
    )
    expect(next).toBeNull()
  })

  it('sends Access headers to an absolute mint URL', async () => {
    const token = jwtFor({ email: memberEmail })
    const member: InstantAuthUser = {
      email: memberEmail,
      id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      isGuest: false,
    }
    let signedIn = false
    const seen: Array<Readonly<{ headers: Headers; url: string }>> = []
    const next = await ensureHostedInstantSession(
      {
        auth: {
          signInWithToken: () => {
            signedIn = true
            return Promise.resolve(undefined)
          },
        },
        getAuth: () => Promise.resolve(signedIn ? member : null),
      },
      {
        accessToken: token,
        fetch: async (input, init) => {
          seen.push({
            headers: new Headers(init?.headers),
            url: String(input),
          })
          return new Response(
            JSON.stringify(
              HostedInstantSession.make({
                email: memberEmail,
                token: refreshToken,
              }),
            ),
            { status: 200 },
          )
        },
        sessionOrigin: 'https://ideas.knophy.com',
      },
    )
    expect(next).toEqual(member)
    if (!Array.isArrayNonEmpty(seen)) {
      throw new Error('expected a mint request')
    }
    const request = Array.headNonEmpty(seen)
    expect(request.url).toBe(
      `https://ideas.knophy.com${hostedIdentitySessionPath}`,
    )
    expect(request.headers.get('authorization')).toBe(`Bearer ${token}`)
    expect(request.headers.get('cf-access-token')).toBe(token)
    expect(request.headers.get('cookie')).toBe(`CF_Authorization=${token}`)
  })

  it('does not fetch an Access-gated origin without a JWT', async () => {
    const next = await ensureHostedInstantSession(
      {
        auth: {
          signInWithToken: () => Promise.reject(new Error('unused')),
        },
        getAuth: () => Promise.resolve(null),
      },
      {
        fetch: () => {
          throw new Error('mint should not run')
        },
        sessionOrigin: 'https://ideas.knophy.com',
      },
    )
    expect(next).toBeNull()
  })

  it('fail-opens when Instant getAuth never settles', async () => {
    const started = Date.now()
    const next = await ensureHostedInstantSession(
      {
        auth: {
          signInWithToken: () => Promise.reject(new Error('unused')),
        },
        getAuth: () => new Promise(() => undefined),
      },
      {
        fetch: async () =>
          new Response(JSON.stringify({ error: 'MissingAccessIdentity' }), {
            status: 401,
          }),
        getAuthTimeoutMs: 20,
      },
    )
    expect(next).toBeNull()
    expect(Date.now() - started).toBeLessThan(hostedIdentityGetAuthTimeoutMs)
  })

  it('fail-opens when Instant signInWithToken never settles', async () => {
    const started = Date.now()
    const next = await ensureHostedInstantSession(
      {
        auth: {
          signInWithToken: () => new Promise(() => undefined),
        },
        getAuth: () => Promise.resolve(null),
      },
      {
        fetch: async () =>
          new Response(
            JSON.stringify(
              HostedInstantSession.make({
                email: memberEmail,
                token: refreshToken,
              }),
            ),
            { status: 200 },
          ),
        getAuthTimeoutMs: 20,
      },
    )
    expect(next).toBeNull()
    expect(Date.now() - started).toBeLessThan(hostedIdentityGetAuthTimeoutMs)
  })
})

class TestStore extends Context.Service<
  TestStore,
  Readonly<{ ready: boolean }>
>()('HostedIdentity/TestStore') {}

const mintingDatabase = () => {
  const member: InstantAuthUser = {
    email: memberEmail,
    id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    isGuest: false,
  }
  let signedIn = false
  return {
    isSignedIn: () => signedIn,
    member,
    database: {
      auth: {
        signInWithToken: () => {
          signedIn = true
          return Promise.resolve(undefined)
        },
      },
      getAuth: () => Promise.resolve(signedIn ? member : null),
    },
  }
}

const mintResponse = async () =>
  new Response(
    JSON.stringify(
      HostedInstantSession.make({
        email: memberEmail,
        token: refreshToken,
      }),
    ),
    { status: 200 },
  )

describe('hostedIdentityLayer', () => {
  it('signs Instant in when the Layer is built', async () => {
    const session = mintingDatabase()
    await Effect.runPromise(
      Effect.scoped(
        Layer.build(
          hostedIdentityLayer(session.database, {
            accessToken: jwtFor({ email: memberEmail }),
            fetch: mintResponse,
            sessionOrigin: 'https://ideas.knophy.com',
          }),
        ),
      ),
    )
    expect(session.isSignedIn()).toBe(true)
  })

  it('does not fetch an Access-gated origin without a JWT', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Layer.build(
          hostedIdentityLayer(
            {
              auth: {
                signInWithToken: () => Promise.reject(new Error('unused')),
              },
              getAuth: () => Promise.resolve(null),
            },
            {
              fetch: () => {
                throw new Error('mint should not run')
              },
              sessionOrigin: 'https://ideas.knophy.com',
            },
          ),
        ),
      ),
    )
  })

  it('is a no-op when Instant is not configured', async () => {
    await Effect.runPromise(
      Effect.scoped(Layer.build(hostedIdentityLayer(undefined))),
    )
  })

  it('builds when Instant getAuth never settles', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Layer.build(
          hostedIdentityLayer(
            {
              auth: {
                signInWithToken: () => Promise.reject(new Error('unused')),
              },
              getAuth: () => new Promise(() => undefined),
            },
            {
              fetch: async () =>
                new Response(
                  JSON.stringify({ error: 'MissingAccessIdentity' }),
                  { status: 401 },
                ),
              getAuthTimeoutMs: 20,
            },
          ),
        ),
      ),
    )
  })

  it('builds when Instant signInWithToken never settles', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Layer.build(
          hostedIdentityLayer(
            {
              auth: {
                signInWithToken: () => new Promise(() => undefined),
              },
              getAuth: () => Promise.resolve(null),
            },
            {
              fetch: async () =>
                new Response(
                  JSON.stringify(
                    HostedInstantSession.make({
                      email: memberEmail,
                      token: refreshToken,
                    }),
                  ),
                  { status: 200 },
                ),
              getAuthTimeoutMs: 20,
            },
          ),
        ),
      ),
    )
  })
})

describe('withHostedIdentity', () => {
  it('provides the resource service after minting', async () => {
    const session = mintingDatabase()
    const resources = withHostedIdentity(
      Layer.succeed(TestStore, { ready: true }),
      session.database,
      {
        accessToken: jwtFor({ email: memberEmail }),
        fetch: mintResponse,
        sessionOrigin: 'https://ideas.knophy.com',
      },
    )
    const context = await Effect.runPromise(
      Effect.scoped(Layer.build(resources)),
    )
    expect(session.isSignedIn()).toBe(true)
    expect(Context.get(context, TestStore).ready).toBe(true)
  })
})
