import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { init } from '@instantdb/admin'

import {
  hostedIdentityResponseHeaders,
  hostedIdentitySessionPath,
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

/**
 * Serves `/__foldkit/hosted-identity/session` in Vite dev and preview.
 * Reads `INSTANT_APP_ADMIN_TOKEN` from the origin process. Never prefixes it
 * `VITE_`.
 */
export const hostedIdentity = (): Plugin => {
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
    void mintHostedInstantSession({
      createToken,
      headers: headerRecord(request.headers),
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
