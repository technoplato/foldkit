import { Array, Option } from 'effect'

import {
  type AccessIdentity,
  accessTokenFromHeaders,
  cookieValue,
  hostedIdentitySessionPath,
  isLocalDevelopmentRequest,
} from './hostedIdentity.js'

/**
 * Where a visitor with no login goes to sign in and come back, such as
 * `/__foldkit/sign-in?next=/books/a-new-earth`. Cloudflare Access gates
 * it like any private path, so a visitor who reaches the origin there has
 * signed in, and the origin sends them on to `next`.
 */
export const hostedSignInPath = '/__foldkit/sign-in'

const nextField = 'next'

/**
 * The origin's own copy of a verified Access login, set at
 * {@link hostedSignInPath}. A path Access bypasses gets no assertion header,
 * and Cloudflare does not promise to pass its `CF_Authorization` cookie
 * there, so the origin keeps the login it already checked.
 */
export const hostedLoginCookieName = 'foldkit_access'

const loginCookieMaxAgeSeconds = 12 * 60 * 60

/**
 * A request from a visitor with no Access login, as public routes see it:
 * the path, such as `/books/a-new-earth`, and the query.
 */
export type PublicRequest = Readonly<{
  path: string
  query: URLSearchParams
}>

/** What an origin answers on a public route: a page, an image, a redirect. */
export type PublicAnswer = Readonly<{
  status: number
  headers: Readonly<Record<string, string>>
  body: string | Uint8Array
}>

/**
 * The routes an origin answers for anyone: Some with the answer for a path
 * it serves, such as a link preview for `/books/a-new-earth`, and None for
 * every other path, which the visitor then gets as 404.
 */
export type PublicRoutes = (
  request: PublicRequest,
) => Promise<Option.Option<PublicAnswer>>

const safeSegment = /^[A-Za-z0-9._~-]+$/

const isPlainSegment = (segment: string): boolean =>
  safeSegment.test(segment) && segment !== '.' && segment !== '..'

/**
 * The path of a raw request target when it is plainly one path: segments
 * of letters, digits, and `._~-`, with no percent escapes, no `.` or `..`
 * segment, and no doubled slash. A trick such as `/books/..%2F__foldkit`
 * is None, so nothing under a public prefix reaches a private path.
 *
 * @example
 * ```typescript
 * plainPathOf('/books/a-new-earth?ref=1') // Some('/books/a-new-earth')
 * plainPathOf('/books/..%2Fassets') // None
 * ```
 */
export const plainPathOf = (target: string): Option.Option<string> => {
  const path = Option.getOrElse(Array.head(target.split('?')), () => '')
  if (path === '/') {
    return Option.some(path)
  }
  const segments = path.split('/')
  const isPlain =
    path.startsWith('/') &&
    Array.every(
      Array.drop(segments, 1),
      (segment, index) =>
        isPlainSegment(segment) ||
        (segment === '' && index === segments.length - 2),
    )
  return isPlain ? Option.some(path) : Option.none()
}

const queryOf = (target: string): URLSearchParams => {
  const separator = target.indexOf('?')
  return new URLSearchParams(separator < 0 ? '' : target.slice(separator + 1))
}

const pathnameOf = (target: string): string =>
  new URL(target, 'http://127.0.0.1').pathname

const quietHeaders = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex',
}

/** The answer for any path a visitor with no login may not see. */
export const publicNotFound: PublicAnswer = {
  status: 404,
  headers: { ...quietHeaders, 'content-type': 'text/plain; charset=utf-8' },
  body: 'Not found',
}

const loginCookieOf = (token: string): string =>
  `${hostedLoginCookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=${loginCookieMaxAgeSeconds.toString()}; HttpOnly; Secure; SameSite=Lax`

const signedInRedirectTo = (
  location: string,
  maybeToken: Option.Option<string>,
): PublicAnswer => ({
  status: 302,
  headers: {
    ...quietHeaders,
    location,
    ...Option.match(maybeToken, {
      onNone: () => ({}),
      onSome: token => ({ 'set-cookie': loginCookieOf(token) }),
    }),
  },
  body: '',
})

const nextPathOf = (target: string): string =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromNullishOr(queryOf(target).get(nextField)),
      plainPathOf,
    ),
    () => '/',
  )

const verifiedTokenOf = async (
  headers: Readonly<Record<string, string>>,
  verifyAccessToken: (token: string) => Promise<Option.Option<AccessIdentity>>,
): Promise<Option.Option<string>> => {
  const candidates = Array.dedupe(
    Array.filter(
      [
        accessTokenFromHeaders(headers),
        cookieValue(headers['cookie'] ?? '', hostedLoginCookieName).trim(),
      ],
      token => token !== '',
    ),
  )
  for (const token of candidates) {
    const maybeIdentity = await verifyAccessToken(token).catch(() =>
      Option.none(),
    )
    if (Option.isSome(maybeIdentity)) {
      return Option.some(token)
    }
  }
  return Option.none()
}

/**
 * How an origin with public routes answers one request. None lets it
 * through to the app: a signed-in visitor, with a verified Access login in
 * the header, the `CF_Authorization` cookie, or {@link hostedLoginCookieName},
 * or local development, plus the session mint, which checks logins itself.
 * A signed-in visitor at {@link hostedSignInPath} gets the origin's login
 * cookie and is sent on to `next`. Everyone else gets only
 * what `publicRoutes` answers for a plain GET or HEAD path, and 404 for
 * anything else. So a Cloudflare Access bypass on `/books` shows anonymous
 * visitors the link previews and never the app or its data.
 *
 * @example
 * ```typescript
 * await guardHostedRequest({ publicRoutes, verifyAccessToken: verifier.verify, remoteAddress, headers, method: 'GET', url: '/books/a-new-earth' })
 * // None for Michael's browser, Some(preview page) for a link unfurler, Some(404) for '/assets/index.js' without a login
 * ```
 */
export const guardHostedRequest = async (
  input: Readonly<{
    publicRoutes: PublicRoutes
    verifyAccessToken: (token: string) => Promise<Option.Option<AccessIdentity>>
    remoteAddress: string | undefined
    headers: Readonly<Record<string, string>>
    method: string
    url: string
  }>,
): Promise<Option.Option<PublicAnswer>> => {
  if (pathnameOf(input.url) === hostedIdentitySessionPath) {
    return Option.none()
  }
  const isLocal = isLocalDevelopmentRequest({
    remoteAddress: input.remoteAddress,
    headers: input.headers,
  })
  const maybeToken = await verifiedTokenOf(
    input.headers,
    input.verifyAccessToken,
  )
  const method = input.method.toUpperCase()
  const maybePath = plainPathOf(input.url)
  const isSignIn = Option.exists(maybePath, path => path === hostedSignInPath)
  if (isLocal || Option.isSome(maybeToken)) {
    return isSignIn
      ? Option.some(signedInRedirectTo(nextPathOf(input.url), maybeToken))
      : Option.none()
  } else if (
    (method === 'GET' || method === 'HEAD') &&
    Option.isSome(maybePath)
  ) {
    const maybeAnswer = await input
      .publicRoutes({ path: maybePath.value, query: queryOf(input.url) })
      .catch(() => Option.none<PublicAnswer>())
    return Option.some(Option.getOrElse(maybeAnswer, () => publicNotFound))
  } else {
    return Option.some(publicNotFound)
  }
}

/**
 * What a link to a page shows wherever it is posted: the title, one line
 * under it, an image, and where the link opens. Only what the owner chose
 * to make public belongs here, such as a book's title, author, and cover.
 */
export type LinkPreview = Readonly<{
  siteName: string
  title: string
  description: string
  maybeImageUrl: Option.Option<string>
  url: string
  openPath: string
}>

const htmlEscapes: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, character => htmlEscapes[character] ?? character)

const previewStyle = [
  'body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;color:#111827}',
  'main{box-sizing:border-box;max-width:420px;margin:0 auto;padding:48px 24px;text-align:center}',
  'img{width:220px;max-width:70vw;border-radius:8px;box-shadow:0 10px 30px -12px rgb(15 23 42/.5)}',
  'h1{margin:24px 0 8px;font-size:26px;line-height:1.2}',
  'p{margin:0 0 28px;color:#6b7280}',
  'a{display:inline-block;padding:12px 22px;border-radius:999px;background:#111827;color:#fff;text-decoration:none;font-weight:600}',
].join('')

/**
 * A small page carrying a link's Open Graph and Twitter card tags, with a
 * visible card for a person who opens it without a login, and a button to
 * sign in and open the real page. Search engines are asked not to index it.
 *
 * @example
 * ```typescript
 * linkPreviewAnswer({ siteName: 'Books', title: 'A New Earth', description: 'by Eckhart Tolle', maybeImageUrl: Option.some('https://books.pisspoursoftware.xyz/books/a-new-earth/cover'), url: 'https://books.pisspoursoftware.xyz/books/a-new-earth', openPath: '/__foldkit/sign-in?next=/books/a-new-earth' })
 * // { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', … }, body: '<!doctype html>…<meta property="og:title" content="A New Earth">…' }
 * ```
 */
export const linkPreviewAnswer = (preview: LinkPreview): PublicAnswer => {
  const siteName = escapeHtml(preview.siteName)
  const title = escapeHtml(preview.title)
  const description = escapeHtml(preview.description)
  const maybeImageUrl = Option.map(preview.maybeImageUrl, escapeHtml)
  const url = escapeHtml(preview.url)
  const openPath = escapeHtml(preview.openPath)
  const imageTags = Option.match(maybeImageUrl, {
    onNone: () => ['<meta name="twitter:card" content="summary">'],
    onSome: imageUrl => [
      `<meta property="og:image" content="${imageUrl}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:image" content="${imageUrl}">`,
    ],
  })
  const imageCard = Option.match(maybeImageUrl, {
    onNone: () => [],
    onSome: imageUrl => [`<img src="${imageUrl}" alt="">`],
  })
  const body = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    `<title>${title} | ${siteName}</title>`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:site_name" content="${siteName}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    ...imageTags,
    `<style>${previewStyle}</style>`,
    '</head><body><main>',
    ...imageCard,
    `<h1>${title}</h1>`,
    `<p>${description}</p>`,
    `<a href="${openPath}">Open in ${siteName}</a>`,
    '</main></body></html>',
  ].join('')
  return {
    status: 200,
    headers: { ...quietHeaders, 'content-type': 'text/html; charset=utf-8' },
    body,
  }
}

/** Where a preview's button opens `path`, signing the visitor in first. */
export const signInPathFor = (path: string): string =>
  `${hostedSignInPath}?${new URLSearchParams({ [nextField]: path }).toString()}`
