import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { init } from '@instantdb/admin'

import { countersDemoSessionPath } from './identity.js'
import { mintCountersDemoSession } from './mint.js'

const envValue = (name: string): string => {
  const value = process.env[name]
  if (value === undefined) {
    return ''
  }
  return value
}

/**
 * Serves a Vite-only Instant mint for the Multiple Counters demo email.
 * Reads INSTANT_APP_ADMIN_TOKEN from the origin process. Never prefixes it VITE_.
 */
export const countersDemoSession = (): Plugin => {
  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    if (request.url !== countersDemoSessionPath) {
      next()
      return
    }
    if ((request.method ?? 'GET').toUpperCase() !== 'GET') {
      response.statusCode = 405
      response.end()
      return
    }
    const adminToken = envValue('INSTANT_APP_ADMIN_TOKEN')
    const appId = envValue('INSTANT_APP_ID') || envValue('VITE_INSTANT_APP_ID')
    if (adminToken === '' || appId === '') {
      response.statusCode = 503
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ error: 'MintUnavailable' }))
      return
    }
    void mintCountersDemoSession(init({ adminToken, appId }))
      .then(session => {
        response.statusCode = 200
        response.setHeader('cache-control', 'private, no-store')
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify(session))
      })
      .catch(() => {
        response.statusCode = 503
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ error: 'MintUnavailable' }))
      })
  }

  return {
    name: 'counters-demo-session',
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
    configureServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
