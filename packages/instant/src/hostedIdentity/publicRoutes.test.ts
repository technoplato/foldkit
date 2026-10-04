import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { AccessIdentity, hostedIdentitySessionPath } from './hostedIdentity.js'
import {
  type PublicAnswer,
  type PublicRoutes,
  guardHostedRequest,
  hostedLoginCookieName,
  hostedSignInPath,
  linkPreviewAnswer,
  plainPathOf,
  publicNotFound,
  signInPathFor,
} from './publicRoutes.js'

const goodToken = 'good.access.token'

const verifyAccessToken = async (
  token: string,
): Promise<Option.Option<AccessIdentity>> =>
  token === goodToken
    ? Option.some(AccessIdentity.make({ email: 'owner@example.invalid' }))
    : Option.none()

const preview: PublicAnswer = {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: '<title>A New Earth</title>',
}

const seenPaths: Array<string> = []

const publicRoutes: PublicRoutes = async request => {
  seenPaths.push(request.path)
  return request.path === '/books/a-new-earth'
    ? Option.some(preview)
    : Option.none()
}

const throughCloudflare = {
  host: 'books.pisspoursoftware.xyz',
  'cf-ray': '8c0000000000-MIA',
  'x-forwarded-for': '203.0.113.9',
}

const guard = (
  url: string,
  headers: Readonly<Record<string, string>> = throughCloudflare,
  method = 'GET',
) =>
  guardHostedRequest({
    publicRoutes,
    verifyAccessToken,
    remoteAddress: '127.0.0.1',
    headers,
    method,
    url,
  })

describe('plainPathOf', () => {
  it('keeps a plain path and drops its query', () => {
    expect(plainPathOf('/books/a-new-earth/listen/1h00m00s?ref=x')).toEqual(
      Option.some('/books/a-new-earth/listen/1h00m00s'),
    )
    expect(plainPathOf('/books/')).toEqual(Option.some('/books/'))
    expect(plainPathOf('/.well-known/apple-app-site-association')).toEqual(
      Option.some('/.well-known/apple-app-site-association'),
    )
  })

  it('refuses escapes, dot segments, and doubled slashes', () => {
    expect(
      plainPathOf('/books/..%2F__foldkit/hosted-identity/session'),
    ).toEqual(Option.none())
    expect(plainPathOf('/books/%2e%2e/assets/index.js')).toEqual(Option.none())
    expect(plainPathOf('/books/../assets/index.js')).toEqual(Option.none())
    expect(plainPathOf('/books/./a-new-earth')).toEqual(Option.none())
    expect(plainPathOf('/books//a-new-earth')).toEqual(Option.none())
    expect(plainPathOf('//evil.example/books')).toEqual(Option.none())
    expect(plainPathOf('books/a-new-earth')).toEqual(Option.none())
    expect(plainPathOf('/books/a\\b')).toEqual(Option.none())
  })
})

describe('guardHostedRequest', () => {
  it('lets a verified login through to the app, by header or by cookie', async () => {
    expect(
      await guard('/books/a-new-earth', {
        ...throughCloudflare,
        'cf-access-jwt-assertion': goodToken,
      }),
    ).toEqual(Option.none())
    expect(
      await guard('/assets/index.js', {
        ...throughCloudflare,
        cookie: `theme=dark; CF_Authorization=${goodToken}`,
      }),
    ).toEqual(Option.none())
  })

  it('lets local development through without a login', async () => {
    expect(await guard('/assets/index.js', { host: 'localhost:5183' })).toEqual(
      Option.none(),
    )
  })

  it('leaves the session mint to check logins itself', async () => {
    expect(await guard(hostedIdentitySessionPath)).toEqual(Option.none())
  })

  it('answers a visitor with no login only from the public routes', async () => {
    expect(await guard('/books/a-new-earth?ref=imessage')).toEqual(
      Option.some(preview),
    )
    expect(
      await guard('/books/a-new-earth', throughCloudflare, 'HEAD'),
    ).toEqual(Option.some(preview))
    expect(await guard('/assets/index.js')).toEqual(Option.some(publicNotFound))
    expect(await guard('/books/12-rules-for-life')).toEqual(
      Option.some(publicNotFound),
    )
  })

  it('treats a forged or expired login as no login', async () => {
    expect(
      await guard('/assets/index.js', {
        ...throughCloudflare,
        'cf-access-jwt-assertion': 'forged.access.token',
        'cf-access-authenticated-user-email': 'owner@example.invalid',
      }),
    ).toEqual(Option.some(publicNotFound))
  })

  it('never hands an escaped or dotted path to the public routes', async () => {
    seenPaths.length = 0
    expect(
      await guard('/books/..%2F__foldkit/hosted-identity/session'),
    ).toEqual(Option.some(publicNotFound))
    expect(await guard('/books/%2e%2e/assets/index.js')).toEqual(
      Option.some(publicNotFound),
    )
    expect(seenPaths).toEqual([])
  })

  it('refuses anything but GET and HEAD without a login', async () => {
    expect(
      await guard('/books/a-new-earth', throughCloudflare, 'POST'),
    ).toEqual(Option.some(publicNotFound))
  })

  it('answers 404 when a public route fails', async () => {
    const failing: PublicRoutes = async () => {
      throw new Error('library unavailable')
    }
    expect(
      await guardHostedRequest({
        publicRoutes: failing,
        verifyAccessToken,
        remoteAddress: '127.0.0.1',
        headers: throughCloudflare,
        method: 'GET',
        url: '/books/a-new-earth',
      }),
    ).toEqual(Option.some(publicNotFound))
  })

  it('sends a signed-in visitor on from sign-in, only to a plain local path', async () => {
    const signedIn = {
      ...throughCloudflare,
      'cf-access-jwt-assertion': goodToken,
    }
    const locationOf = async (url: string) =>
      Option.map(await guard(url, signedIn), answer => [
        answer.status,
        answer.headers['location'],
      ])
    expect(
      await locationOf(`${hostedSignInPath}?next=%2Fbooks%2Fa-new-earth`),
    ).toEqual(Option.some([302, '/books/a-new-earth']))
    expect(
      await locationOf(`${hostedSignInPath}?next=%2F%2Fevil.example%2Fx`),
    ).toEqual(Option.some([302, '/']))
    expect(
      await locationOf(`${hostedSignInPath}?next=https%3A%2F%2Fevil.example`),
    ).toEqual(Option.some([302, '/']))
    expect(await guard(hostedSignInPath)).toEqual(Option.some(publicNotFound))
  })

  it('keeps the login it checked at sign-in, and accepts it later', async () => {
    const maybeSignIn = await guard(
      `${hostedSignInPath}?next=%2Fbooks%2Fa-new-earth`,
      { ...throughCloudflare, 'cf-access-jwt-assertion': goodToken },
    )
    const setCookie = Option.match(maybeSignIn, {
      onNone: () => '',
      onSome: answer => answer.headers['set-cookie'] ?? '',
    })
    expect(setCookie).toBe(
      `${hostedLoginCookieName}=${goodToken}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`,
    )
    expect(
      await guard('/books/a-new-earth', {
        ...throughCloudflare,
        cookie: `CF_Authorization=stale.access.token; ${hostedLoginCookieName}=${goodToken}`,
      }),
    ).toEqual(Option.none())
    expect(
      await guard('/assets/index.js', {
        ...throughCloudflare,
        cookie: `${hostedLoginCookieName}=forged.access.token`,
      }),
    ).toEqual(Option.some(publicNotFound))
  })

  it('sets no login cookie for local development', async () => {
    const maybeSignIn = await guard(`${hostedSignInPath}?next=%2Fbooks`, {
      host: 'localhost:5183',
    })
    expect(
      Option.map(maybeSignIn, answer => answer.headers['set-cookie']),
    ).toEqual(Option.some(undefined))
  })
})

describe('linkPreviewAnswer', () => {
  it('carries the card tags and escapes every value', () => {
    const answer = linkPreviewAnswer({
      siteName: 'Books',
      title: 'Tom & Jerry <"Live">',
      description: "by O'Brien",
      maybeImageUrl: Option.some('https://books.example/books/tom/cover'),
      url: 'https://books.example/books/tom',
      openPath: signInPathFor('/books/tom'),
    })
    expect(answer.status).toBe(200)
    expect(answer.headers['x-robots-tag']).toBe('noindex')
    expect(answer.body).toContain(
      '<meta property="og:title" content="Tom &amp; Jerry &lt;&quot;Live&quot;&gt;">',
    )
    expect(answer.body).toContain(
      '<meta property="og:description" content="by O&#39;Brien">',
    )
    expect(answer.body).toContain(
      '<meta property="og:image" content="https://books.example/books/tom/cover">',
    )
    expect(answer.body).toContain(
      'href="/__foldkit/sign-in?next=%2Fbooks%2Ftom"',
    )
    expect(answer.body).not.toContain('<"Live">')
  })
})
