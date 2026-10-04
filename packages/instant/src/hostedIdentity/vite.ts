import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { init } from '@instantdb/admin'

import { makeAccessVerifier } from './accessVerifier.js'
import {
  accessAudienceEnvNames,
  accessTeamDomainEnvNames,
  hostedIdentityResponseHeaders,
  hostedIdentitySessionPath,
  isLocalDevelopmentRequest,
  knophyAccessTeamDomain,
  loopbackMintEmail,
  mintHostedInstantSession,
} from './hostedIdentity.js'

const headerRecord = (
  headers: IncomingMessage['headers'],
): Readonly<Record<string, string>> => {
  const collected: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string' && value !== '') {
      collected[name.toLowerCase()] = value
    }
  }
  return collected
}

const writeJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  const payload = JSON.stringify(body)
  response.statusCode = status
  for (const [name, value] of Object.entries(hostedIdentityResponseHeaders)) {
    response.setHeader(name, value)
  }
  response.setHeader('content-length', String(Buffer.byteLength(payload)))
  response.end(payload)
}

const envValue = (name: string): string => {
  const value = process.env[name]
  if (value === undefined) {
    return ''
  } else {
    return value
  }
}

const firstEnvValue = (names: ReadonlyArray<string>): string =>
  names
    .map(envValue)
    .find(value => value.trim() !== '')
    ?.trim() ?? ''

/** Which Access team signs the logins an origin accepts, and for which apps. */
export type HostedIdentityOptions = Readonly<{
  teamDomain?: string
  audiences?: ReadonlyArray<string>
}>

/**
 * Serves `/__foldkit/hosted-identity/session` in Vite dev and preview.
 * Reads `INSTANT_APP_ADMIN_TOKEN` from the origin process. Never prefixes it
 * `VITE_`. Mints only for an Access login whose signature checks out
 * against the team's keys: `teamDomain`, else `CF_ACCESS_TEAM_DOMAIN`,
 * else the Knophy team. `audiences`, else `CF_ACCESS_AUD` (comma
 * separated), limits it to those Access applications. A request made on
 * this machine to `localhost`, with no proxy in between, gets the local
 * development email instead.
 *
 * @example
 * ```typescript
 * plugins: [foldkit(), hostedIdentity()]
 * plugins: [foldkit(), hostedIdentity({ audiences: ['3f2a…'] })]
 * ```
 */
export const hostedIdentity = (options: HostedIdentityOptions = {}): Plugin => {
  const teamDomain =
    options.teamDomain ??
    (firstEnvValue(accessTeamDomainEnvNames) || knophyAccessTeamDomain)
  const audiences =
    options.audiences ??
    firstEnvValue(accessAudienceEnvNames)
      .split(',')
      .map(audience => audience.trim())
      .filter(audience => audience !== '')
  const verifier = makeAccessVerifier({ teamDomain, audiences })

  const createToken = async (email: string): Promise<string> => {
    const adminToken = envValue('INSTANT_APP_ADMIN_TOKEN')
    const appIdFromEnv = envValue('INSTANT_APP_ID')
    const appId =
      appIdFromEnv === '' ? envValue('VITE_INSTANT_APP_ID') : appIdFromEnv
    if (adminToken === '' || appId === '') {
      throw new Error('MintUnavailable')
    }
    const database = init({ adminToken, appId })
    const token = await database.auth.createToken({ email })
    return String(token)
  }

  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    if (request.url === undefined) {
      next()
      return
    }
    const headers = headerRecord(request.headers)
    const isLocal = isLocalDevelopmentRequest({
      remoteAddress: request.socket.remoteAddress,
      headers,
    })
    void mintHostedInstantSession({
      createToken,
      verifyAccessToken: verifier.verify,
      ...(isLocal ? { localDevelopmentEmail: loopbackMintEmail() } : {}),
      headers,
      method: request.method ?? 'GET',
      url: request.url,
    }).then(result => {
      if (result === undefined) {
        next()
        return
      }
      writeJson(response, result.status, result.body)
    })
  }

  return {
    name: 'foldkit-hosted-identity',
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
    configureServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

/** Path the plugin serves. Re-exported so Vite configs can document it. */
export { hostedIdentitySessionPath }
