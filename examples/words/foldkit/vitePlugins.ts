import { Option, Schema as S } from 'effect'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

import { init } from '@instantdb/admin'

const associationPath = '/.well-known/apple-app-site-association'
const hostedIdentitySessionPath = '/__foldkit/hosted-identity/session'

const decodeAccessClaims = S.decodeUnknownOption(
  S.fromJsonString(S.Struct({ email: S.String })),
)

const pathOf = (request: IncomingMessage): string =>
  (request.url ?? '').split('?')[0] ?? ''

const isLoopback = (request: IncomingMessage): boolean => {
  const address = request.socket.remoteAddress ?? ''
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  )
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
  const serve = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
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

const accessEmailOf = (request: IncomingMessage): string => {
  const header = request.headers['cf-access-authenticated-user-email']
  if (typeof header === 'string' && header.includes('@')) {
    return header.trim()
  }
  const assertion = request.headers['cf-access-jwt-assertion']
  if (typeof assertion !== 'string') {
    return ''
  }
  const payload = assertion.split('.')[1] ?? ''
  return Option.match(
    decodeAccessClaims(Buffer.from(payload, 'base64url').toString('utf8')),
    { onNone: () => '', onSome: claims => claims.email.trim() },
  )
}

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

/**
 * Signs the browser in as the Cloudflare Access email, like Foldkit's hosted
 * identity, but only when that Instant user already exists. The guest upgrade
 * audit (ADR 0012) found that creating the email account before the iPhone
 * upgrades its guest leaves the phone's recordings on a linked guest, where
 * route uploads and sharing fail. So the iPhone signs in first; until then the
 * web answers `ConnectIPhoneFirst` and creates nothing.
 */
export const wordsHostedIdentity = (): Plugin => {
  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    if (pathOf(request) !== hostedIdentitySessionPath) {
      next()
      return
    }
    const appId = process.env['INSTANT_APP_ID'] ?? ''
    const adminToken = process.env['INSTANT_APP_ADMIN_TOKEN'] ?? ''
    const headerEmail = accessEmailOf(request)
    const email =
      headerEmail === '' && isLoopback(request)
        ? (process.env['FOLDKIT_HOSTED_IDENTITY_LOOPBACK_EMAIL'] ?? '').trim()
        : headerEmail
    if (appId === '' || adminToken === '') {
      writeJson(response, 503, { error: 'MintUnavailable' })
      return
    }
    if (email === '') {
      writeJson(response, 401, { error: 'MissingAccessIdentity' })
      return
    }
    const database = init({ appId, adminToken })
    void database
      .query({ $users: { $: { where: { email } } } })
      .then(async result => {
        if (result.$users.length === 0) {
          writeJson(response, 409, { error: 'ConnectIPhoneFirst', email })
        } else {
          const token = await database.auth.createToken({ email })
          writeJson(response, 200, { email, token: String(token) })
        }
      })
      .catch(() => writeJson(response, 503, { error: 'MintUnavailable' }))
  }
  return {
    name: 'words-hosted-identity',
    configureServer: server => {
      server.middlewares.use(middleware)
    },
    configurePreviewServer: server => {
      server.middlewares.use(middleware)
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
    server.middlewares.use((request, response, next) => {
      if (
        pathOf(request) !== hostedIdentitySessionPath ||
        !isLoopback(request)
      ) {
        next()
        return
      }
      void database.auth.createToken({ id: userID }).then(
        token => {
          response.setHeader('content-type', 'application/json')
          response.end(
            JSON.stringify({
              email: 'dev-impersonation@words.invalid',
              token: String(token),
            }),
          )
        },
        () => {
          response.statusCode = 503
          response.end(JSON.stringify({ error: 'MintUnavailable' }))
        },
      )
    })
  },
})
