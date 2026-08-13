import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import {
  agentIndex,
  agentMarkdown,
  catalogDocument,
  chatDocument,
  definitionsSh,
  emptyModel,
  foldkitSnapDocument,
  runIndex,
  toolById,
} from 'orbit-core-example'

const originFrom = (req: IncomingMessage): string => {
  const host = req.headers.host ?? 'orbit.knophy.com'
  if (host.startsWith('127.0.0.1') || host.startsWith('localhost')) {
    return `http://${host}`
  }
  return `https://${host}`
}

const sendJson = (res: ServerResponse, body: unknown) => {
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(`${JSON.stringify(body)}\n`)
}

const sendText = (res: ServerResponse, body: string, type: string) => {
  res.statusCode = 200
  res.setHeader('content-type', type)
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

const handle = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => {
  const url = (req.url ?? '').split('?')[0] ?? ''
  const origin = originFrom(req)
  if (url === '/agent.md') {
    sendText(res, agentMarkdown(), 'text/markdown; charset=utf-8')
    return
  }
  if (url === '/definitions.sh') {
    sendText(res, definitionsSh(origin), 'text/x-shellscript; charset=utf-8')
    return
  }
  if (url === '/api/agent') {
    sendJson(res, agentIndex())
    return
  }
  if (url === '/api/catalog') {
    sendJson(res, catalogDocument(origin))
    return
  }
  if (url === '/api/chat') {
    sendJson(res, chatDocument(origin))
    return
  }
  if (url === '/api/state') {
    const { model, receipt } = runIndex(emptyModel())
    sendJson(res, foldkitSnapDocument(origin, { model, receipt }))
    return
  }
  const toolMatch = /^\/api\/tools\/([^/]+)$/.exec(url)
  if (toolMatch !== null && toolMatch[1] !== undefined) {
    const tool = toolById(toolMatch[1])
    if (tool === undefined) {
      res.statusCode = 404
      res.end('not found\n')
      return
    }
    sendJson(res, {
      ...tool,
      href: `${origin}/#${tool.id}`,
      api: `${origin}/api/tools/${tool.id}`,
    })
    return
  }
  next()
}

/** Serves the agent index HTTP surface from core exports. */
export const orbitAgentPlugin = (): Plugin => ({
  name: 'orbit-agent-index',
  configureServer(server: ViteDevServer) {
    server.middlewares.use((req, res, next) => {
      handle(req, res, next)
    })
  },
  configurePreviewServer(server: PreviewServer) {
    server.middlewares.use((req, res, next) => {
      handle(req, res, next)
    })
  },
})
