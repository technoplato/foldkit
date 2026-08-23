import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { applySettings, loadSettings } from './accessApi.js'

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

const pathOf = (url: string | undefined): string => {
  if (url === undefined) {
    return '/'
  }
  return url.split('?')[0] ?? '/'
}

/** Same-origin Settings API. Token stays on this origin. */
export const settingsAccessApi = (): Plugin => ({
  name: 'settings-access-api',
  configureServer(server) {
    server.middlewares.use(attach)
  },
  configurePreviewServer(server) {
    server.middlewares.use(attach)
  },
})

const attach = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void => {
  const path = pathOf(req.url)
  if (req.method === 'GET' && path === '/api/settings') {
    void loadSettings()
      .then(payload => {
        sendJson(res, 200, payload)
      })
      .catch(() => {
        sendJson(res, 502, { _tag: 'Failed', reason: { _tag: 'Unreachable' } })
      })
    return
  }
  if (req.method === 'POST' && path === '/api/settings/apply') {
    void readBody(req)
      .then(async raw => {
        const body = JSON.parse(raw) as { host?: string; visibility?: unknown }
        if (typeof body.host !== 'string' || body.host.length === 0) {
          sendJson(res, 400, { _tag: 'Failed', reason: { _tag: 'Invalid' } })
          return
        }
        const result = await applySettings(body.host, body.visibility)
        sendJson(res, result.status, result.payload)
      })
      .catch(() => {
        sendJson(res, 502, { _tag: 'Failed', reason: { _tag: 'Unreachable' } })
      })
    return
  }
  next()
}
