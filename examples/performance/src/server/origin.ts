import { Array, Option, String } from 'effect'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join } from 'node:path'

import {
  type AccessIdentity,
  accessTokenFromHeaders,
  isLocalDevelopmentRequest,
  plainPathOf,
  publicNotFound,
} from '@foldkit/instant'

import { UNDERSTANDING_MOVED_TO } from '../moved'

// CONSTANT

const DATA_PREFIX = '/data/'
const DATA_FILE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\.json$/
const ASSETS_PREFIX = '/assets/'
const INDEX_FILE = 'index.html'
const UNDERSTANDING_PATHS: ReadonlyArray<string> = [
  '/understanding',
  '/understanding/',
]

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Headers on every answer: no index, no referrer to the sites it links to,
 * no framing, and only this origin's own scripts and data.
 */
export const securityHeaders: Readonly<Record<string, string>> = {
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
}

// MODEL

/** Where the origin reads from, who it lets in, and how it checks an Access login. */
export type OriginConfig = Readonly<{
  siteDirectory: string
  dataDirectory: string
  allowedEmails: ReadonlyArray<string>
  verifyAccessToken: (token: string) => Promise<Option.Option<AccessIdentity>>
  log: (line: string) => void
}>

/** One request as the origin reads it. */
export type OriginRequest = Readonly<{
  method: string
  url: string
  headers: Readonly<Record<string, string>>
  remoteAddress: string | undefined
}>

export type OriginAnswer = Readonly<{
  status: number
  headers: Readonly<Record<string, string>>
  body: Uint8Array | string
}>

/** Who is asking: this Mac itself, his verified login, or anyone else and why. */
export type Visitor =
  | Readonly<{ _tag: 'Local' }>
  | Readonly<{ _tag: 'Allowed' }>
  | Readonly<{ _tag: 'Refused'; reason: string }>

// ORIGIN

/**
 * Who is asking. A request made on this Mac to localhost with no proxy in
 * between is Local. Anyone else needs a Cloudflare Access login whose
 * signature, issuer, expiry and audience check out, for an email on the
 * allowlist: the Access app that gates these names lets in more than one
 * Google login, and this page is his alone.
 */
export const visitorOf = async (
  config: OriginConfig,
  request: OriginRequest,
): Promise<Visitor> => {
  if (
    isLocalDevelopmentRequest({
      remoteAddress: request.remoteAddress,
      headers: request.headers,
    })
  ) {
    return { _tag: 'Local' }
  }
  const token = accessTokenFromHeaders(request.headers)
  if (token === '') {
    return { _tag: 'Refused', reason: 'no Access login' }
  }
  const maybeIdentity = await config
    .verifyAccessToken(token)
    .catch(() => Option.none<AccessIdentity>())
  if (Option.isNone(maybeIdentity)) {
    return { _tag: 'Refused', reason: 'an Access login that did not verify' }
  } else if (
    Array.contains(
      config.allowedEmails,
      String.toLowerCase(maybeIdentity.value.email),
    )
  ) {
    return { _tag: 'Allowed' }
  } else {
    return { _tag: 'Refused', reason: 'a verified login not on the allowlist' }
  }
}

const notFound: OriginAnswer = {
  status: publicNotFound.status,
  headers: { ...publicNotFound.headers, ...securityHeaders },
  body: publicNotFound.body,
}

/**
 * The understanding page's old address sends an admitted visitor to each
 * user's own page (Scribe #2002), with nothing of the page in it. A 302, not
 * a 301, so a browser keeps no record of it while the move can still be
 * undone.
 */
const understandingMoved: OriginAnswer = {
  status: 302,
  headers: {
    ...securityHeaders,
    location: UNDERSTANDING_MOVED_TO,
    'cache-control': 'no-store',
  },
  body: '',
}

const fileAnswer = async (
  path: string,
  cacheControl: string,
): Promise<OriginAnswer> => {
  const contentType =
    CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
  return readFile(path).then(
    body => ({
      status: 200,
      headers: {
        ...securityHeaders,
        'content-type': contentType,
        'cache-control': cacheControl,
      },
      body,
    }),
    () => notFound,
  )
}

/**
 * The answer to one request. Anyone not Local or Allowed gets the same Not
 * found for every path, data files included, so the page never shows that it
 * exists. Data is served from the export's own folder by a strict name; every
 * other path is a file of the built site, and a path without one is the page
 * itself, whose router reads the URL.
 */
export const answerRequest = async (
  config: OriginConfig,
  request: OriginRequest,
): Promise<OriginAnswer> => {
  const visitor = await visitorOf(config, request)
  const maybePath = plainPathOf(request.url)
  if (visitor._tag === 'Refused') {
    config.log(
      `refused ${request.method} ${Option.getOrElse(maybePath, () => '(not a plain path)')}: ${visitor.reason}`,
    )
    return notFound
  }
  const method = String.toUpperCase(request.method)
  if ((method !== 'GET' && method !== 'HEAD') || Option.isNone(maybePath)) {
    return notFound
  }
  const path = maybePath.value
  if (Array.contains(UNDERSTANDING_PATHS, path)) {
    return understandingMoved
  } else if (String.startsWith(DATA_PREFIX)(path)) {
    const name = String.slice(DATA_PREFIX.length)(path)
    if (!DATA_FILE.test(name)) {
      return notFound
    }
    return fileAnswer(join(config.dataDirectory, name), 'no-store')
  } else if (extname(path) !== '') {
    const cacheControl = String.startsWith(ASSETS_PREFIX)(path)
      ? 'public, max-age=31536000, immutable'
      : 'no-store'
    return fileAnswer(join(config.siteDirectory, path), cacheControl)
  } else {
    return fileAnswer(join(config.siteDirectory, INDEX_FILE), 'no-store')
  }
}

const headerRecord = (
  headers: IncomingMessage['headers'],
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      typeof value === 'string' && value !== ''
        ? [[name.toLowerCase(), value]]
        : [],
    ),
  )

/** The origin as a Node request listener: `createServer(makeOriginHandler(config))`. */
export const makeOriginHandler =
  (config: OriginConfig) =>
  (request: IncomingMessage, response: ServerResponse): void => {
    const method = request.method ?? 'GET'
    void answerRequest(config, {
      method,
      url: request.url ?? '/',
      headers: headerRecord(request.headers),
      remoteAddress: request.socket.remoteAddress,
    }).then(
      answer => {
        const body =
          typeof answer.body === 'string'
            ? Buffer.from(answer.body)
            : answer.body
        response.writeHead(answer.status, {
          ...answer.headers,
          'content-length': `${body.byteLength}`,
        })
        response.end(String.toUpperCase(method) === 'HEAD' ? undefined : body)
      },
      () => {
        response.writeHead(500, securityHeaders)
        response.end()
      },
    )
  }
