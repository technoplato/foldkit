import { Array, Context, Effect, Layer, Option } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import type { InstantAuthUser } from '../auth/observe.js'
import {
  AccessIdentity,
  HostedInstantSession,
  accessIdentityFromHeaders,
  accessIdentityFromToken,
  accessRequestHeaders,
  accessTokenFromCallbackUrl,
  accessTokenFromEnv,
  bootHostedInstantIdentity,
  ensureHostedInstantSession,
  hostedIdentityLayer,
  hostedIdentityOriginFromEnv,
  hostedIdentitySessionPath,
  hostedIdentitySessionUrl,
  knophyAccessStartUrl,
  knophyWhoamiOrigin,
  mintHostedInstantSession,
  resolveHostedIdentityRequest,
  withHostedIdentity,
} from './hostedIdentity.js'

const encodeSegment = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

const jwtFor = (payload: Readonly<Record<string, unknown>>): string =>
  `${encodeSegment({ alg: 'none' })}.${encodeSegment(payload)}.sig`

const memberEmail = 'halfjew22@gmail.com'
const refreshToken = 'instant-refresh-token'

describe('accessIdentityFromHeaders', () => {
  it('prefers the Cloudflare email header', () => {
    expect(
      accessIdentityFromHeaders({
        'cf-access-authenticated-user-email': memberEmail,
        'cf-access-jwt-assertion': jwtFor({ email: 'other@example.com' }),
      }),
    ).toEqual(Option.some(AccessIdentity.make({ email: memberEmail })))
  })

  it('reads email from the injected Access assertion', () => {
    expect(
      accessIdentityFromHeaders({
        'cf-access-jwt-assertion': jwtFor({
          email: memberEmail,
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      }),
    ).toEqual(Option.some(AccessIdentity.make({ email: memberEmail })))
  })

  it('reads email from the Access cookie', () => {
    expect(
      accessIdentityFromHeaders({
        cookie: `theme=dark; CF_Authorization=${jwtFor({ email: memberEmail })}`,
      }),
    ).toEqual(Option.some(AccessIdentity.make({ email: memberEmail })))
  })

  it('reads email from Bearer and CF-Access-Token', () => {
    expect(
      accessIdentityFromHeaders({
        authorization: `Bearer ${jwtFor({ email: memberEmail })}`,
      }),
    ).toEqual(Option.some(AccessIdentity.make({ email: memberEmail })))
    expect(
      accessIdentityFromHeaders({
        'cf-access-token': jwtFor({ email: memberEmail }),
      }),
    ).toEqual(Option.some(AccessIdentity.make({ email: memberEmail })))
  })

  it('rejects expired, malformed, and missing identity', () => {
    expect(
      accessIdentityFromHeaders({
        'cf-access-jwt-assertion': jwtFor({
          email: memberEmail,
          exp: Math.floor(Date.now() / 1000) - 10,
        }),
      }),
    ).toEqual(Option.none())
    expect(
      accessIdentityFromHeaders({
        'cf-access-jwt-assertion': 'not-a-jwt',
      }),
    ).toEqual(Option.none())
    expect(accessIdentityFromHeaders({})).toEqual(Option.none())
  })
})

describe('mintHostedInstantSession', () => {
  it('ignores other paths', async () => {
    expect(
      await mintHostedInstantSession({
        createToken: () => Promise.resolve(refreshToken),
        headers: { 'cf-access-authenticated-user-email': memberEmail },
        method: 'GET',
        url: '/api/me',
      }),
    ).toBeUndefined()
  })

  it('mints an Instant token for the Access email', async () => {
    const emails: Array<string> = []
    const result = await mintHostedInstantSession({
      createToken: email => {
        emails.push(email)
        return Promise.resolve(refreshToken)
      },
      headers: { 'cf-access-authenticated-user-email': memberEmail },
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

  it('fails closed without Access identity or when minting throws', async () => {
    expect(
      await mintHostedInstantSession({
        createToken: () => Promise.resolve(refreshToken),
        headers: {},
        method: 'GET',
        url: hostedIdentitySessionPath,
      }),
    ).toEqual({ body: { error: 'MissingAccessIdentity' }, status: 401 })
    expect(
      await mintHostedInstantSession({
        createToken: () => Promise.reject(new Error('admin down')),
        headers: { 'cf-access-authenticated-user-email': memberEmail },
        method: 'GET',
        url: hostedIdentitySessionPath,
      }),
    ).toEqual({ body: { error: 'MintUnavailable' }, status: 503 })
    const unavailable = await mintHostedInstantSession({
      createToken: () => Promise.reject(new Error('admin down')),
      headers: { 'cf-access-authenticated-user-email': memberEmail },
      method: 'GET',
      url: hostedIdentitySessionPath,
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
