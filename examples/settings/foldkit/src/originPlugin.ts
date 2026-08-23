import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { applySettings, loadSettings } from './accessApi.js'

const send = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    req.on('data', chunk => {
      chunks.push(Buffer.from(chunk))
    })
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })

export const settingsOriginApi = (): Plugin => ({
  name: 'settings-origin-api',
  configureServer(server) {
    server.middlewares.use(handle)
  },
  configurePreviewServer(server) {
    server.middlewares.use(handle)
  },
})

const handle = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void => {
  const url = req.url ?? ''
  if (
    req.method === 'GET' &&
    (url === '/api/settings' || url.startsWith('/api/settings?'))
  ) {
    void loadSettings()
      .then(payload => {
        send(res, 200, payload)
      })
      .catch(() => {
        send(res, 502, { _tag: 'Failed', reason: { _tag: 'Unreachable' } })
      })
    return
  }
  if (req.method === 'POST' && url === '/api/settings/apply') {
    void readBody(req)
      .then(async text => {
        const body =
          text.length === 0
            ? {}
            : (JSON.parse(text) as { host?: string; visibility?: unknown })
        if (typeof body.host !== 'string') {
          send(res, 400, { _tag: 'Failed', reason: { _tag: 'Invalid' } })
          return
        }
        const result = await applySettings(body.host, body.visibility)
        send(res, result.status, result.payload)
      })
      .catch(() => {
        send(res, 502, { _tag: 'Failed', reason: { _tag: 'Unreachable' } })
      })
    return
  }
  next()
}
