import { counterDemoEmail } from 'counter-core-example'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { init } from '@instantdb/admin'

import { counterDemoSessionPath } from './demoSessionPath.js'

const envValue = (name: string): string => {
  const value = process.env[name]
  if (value === undefined) {
    return ''
  }
  return value
}

/**
 * Serves a Vite-only Instant mint for the Counter demo email.
 * Reads INSTANT_APP_ADMIN_TOKEN from the origin process. Never prefixes it VITE_.
 */
export const counterDemoSession = (): Plugin => {
  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    if (request.url !== counterDemoSessionPath) {
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
    void init({ adminToken, appId })
      .auth.createToken({ email: counterDemoEmail })
      .then(token => {
        response.statusCode = 200
        response.setHeader('cache-control', 'private, no-store')
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({ email: counterDemoEmail, token: String(token) }),
        )
      })
      .catch(() => {
        response.statusCode = 503
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ error: 'MintUnavailable' }))
      })
  }

  return {
    name: 'counter-demo-session',
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
    configureServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
