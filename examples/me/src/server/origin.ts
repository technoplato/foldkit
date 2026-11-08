import { Array, Option, String, pipe } from 'effect'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join } from 'node:path'

import {
  type AccessIdentity,
  accessTokenFromHeaders,
  isLocalDevelopmentRequest,
  plainPathOf,
  publicNotFound,
} from '@foldkit/instant'

// CONSTANT

const SOURCE_PATH = '/source'
const SOURCE_HEADER = /<header data-site-source[^>]*>[\s\S]*?<\/header>/
const DATA_PREFIX = '/data/'
const DATA_FILE = /^[a-z0-9][a-z0-9-]*\.json$/
const ME_FILE = 'me.json'
const JSON_EXTENSION = '.json'
const ME_SCHEMA_VERSION = 1
const ASSETS_PREFIX = '/assets/'
const INDEX_FILE = 'index.html'
const PER_USER = 'private, no-store'

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

/** Where the origin reads from, and how it checks an Access login. */
export type OriginConfig = Readonly<{
  siteDirectory: string
  usersDirectory: string
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

/** Who is asking: a user, by the email of the Access login that verified, or anyone else and why. */
export type Visitor =
  | Readonly<{ _tag: 'SignedIn'; email: string }>
  | Readonly<{ _tag: 'Refused'; reason: string }>

// USER

/**
 * The name of a user's folder: the SHA-256, in hex, of their email trimmed
 * and lowercased. The exporter in the Scribe repository names each folder
 * the same way, so a folder holds no email and a request can never name one.
 *
 * @example
 * ```typescript
 * userFolderName('Owner@Example.com') // 'c8cd3c64…c351', the same as for 'owner@example.com'
 * ```
 */
export const userFolderName = (email: string): string =>
  createHash('sha256')
    .update(String.toLowerCase(String.trim(email)))
    .digest('hex')

// ORIGIN

/**
 * Who is asking, from the Cloudflare Access login alone: its signature,
 * issuer, expiry and audience must check out. A request with no login, one
 * that does not verify, a verifier that fails, and a request made on this
 * Mac are all refused: no one is a user here without a verified login, and
 * nothing the browser sends besides that login (an email header, a cookie,
 * a query) says who it is.
 */
export const visitorOf = async (
  config: OriginConfig,
  request: OriginRequest,
): Promise<Visitor> => {
  const token = accessTokenFromHeaders(request.headers)
  if (token === '') {
    return { _tag: 'Refused', reason: 'no Access login' }
  }
  const maybeIdentity = await config
    .verifyAccessToken(token)
    .catch(() => Option.none<AccessIdentity>())
  if (Option.isNone(maybeIdentity)) {
    return { _tag: 'Refused', reason: 'an Access login that did not verify' }
  } else {
    return {
      _tag: 'SignedIn',
      email: String.toLowerCase(String.trim(maybeIdentity.value.email)),
    }
  }
}

const notFound: OriginAnswer = {
  status: publicNotFound.status,
  headers: { ...publicNotFound.headers, ...securityHeaders },
  body: publicNotFound.body,
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

const filesIn = async (folder: string): Promise<ReadonlyArray<string>> =>
  readdir(folder).then(
    names =>
      pipe(
        names,
        Array.filter(name => name !== ME_FILE && DATA_FILE.test(name)),
        Array.map(name => String.slice(0, -JSON_EXTENSION.length)(name)),
        Array.sort(String.Order),
      ),
    () => [],
  )

/**
 * Where the page's code lives, for Scribe's header sweep (#1547): the built
 * page's source header alone, with nothing of a user in it. The sweep
 * carries no login and asks on this Mac, so this is its one answer without
 * one, as the private stream's `/source` is (#1565).
 */
const sourceAnswer = async (siteDirectory: string): Promise<OriginAnswer> =>
  readFile(join(siteDirectory, INDEX_FILE), 'utf8').then(
    html =>
      Option.match(Option.fromNullishOr(SOURCE_HEADER.exec(html)), {
        onNone: () => notFound,
        onSome: ([header]) => ({
          status: 200,
          headers: {
            ...securityHeaders,
            'content-type': CONTENT_TYPES['.html'] ?? 'text/html',
            'cache-control': 'no-store',
          },
          body: header,
        }),
      }),
    () => notFound,
  )

const meAnswer = async (
  email: string,
  folder: string,
): Promise<OriginAnswer> => ({
  status: 200,
  headers: {
    ...securityHeaders,
    'content-type': CONTENT_TYPES['.json'] ?? 'application/json',
    'cache-control': PER_USER,
  },
  body: JSON.stringify({
    schemaVersion: ME_SCHEMA_VERSION,
    email,
    files: await filesIn(folder),
  }),
})

/**
 * The answer to one request. Anyone not signed in gets the same Not found
 * for every path, so the page never shows that it exists; the one
 * exception is `/source` asked on this Mac, the page's source header for
 * the header sweep, which holds nothing of a user. A signed-in
 * user's data comes only from their own folder: `/data/me.json` is the
 * origin's own answer (who the login says they are, and what their folder
 * holds), and `/data/<name>.json` is that file of their folder, by a strict
 * name. Every other path is a file of the built site, and a path without
 * one is the page itself, whose router reads the URL.
 */
export const answerRequest = async (
  config: OriginConfig,
  request: OriginRequest,
): Promise<OriginAnswer> => {
  const maybePath = plainPathOf(request.url)
  if (
    Option.contains(maybePath, SOURCE_PATH) &&
    String.toUpperCase(request.method) === 'GET' &&
    isLocalDevelopmentRequest({
      remoteAddress: request.remoteAddress,
      headers: request.headers,
    })
  ) {
    return sourceAnswer(config.siteDirectory)
  }
  const visitor = await visitorOf(config, request)
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
  const folder = join(config.usersDirectory, userFolderName(visitor.email))
  if (String.startsWith(DATA_PREFIX)(path)) {
    const name = String.slice(DATA_PREFIX.length)(path)
    if (name === ME_FILE) {
      return meAnswer(visitor.email, folder)
    } else if (DATA_FILE.test(name)) {
      return fileAnswer(join(folder, name), PER_USER)
    } else {
      return notFound
    }
  } else if (extname(path) !== '') {
    const cacheControl = String.startsWith(ASSETS_PREFIX)(path)
      ? 'public, max-age=31536000, immutable'
      : PER_USER
    return fileAnswer(join(config.siteDirectory, path), cacheControl)
  } else {
    return fileAnswer(join(config.siteDirectory, INDEX_FILE), PER_USER)
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
