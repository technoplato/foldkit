const http = require('node:http')

const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const demoSessionPath = '/__foldkit/counters-demo-session'
const demoSessionOrigin = 'http://127.0.0.1:5213'

const nodeOnlyModules = new Set([
  '@instantdb/admin',
  'crypto',
  'fs',
  'fs/promises',
  'node:crypto',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:os',
  'node:path',
  'node:url',
  'path',
])

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (nodeOnlyModules.has(moduleName)) {
    return { type: 'empty' }
  }
  return context.resolveRequest(context, moduleName, platform)
}

config.server.enhanceMiddleware = middleware => (request, response, next) => {
  const path = request.url === undefined ? '' : request.url.split('?')[0]
  if (path !== demoSessionPath) {
    return middleware(request, response, next)
  }
  http
    .get(`${demoSessionOrigin}${demoSessionPath}`, upstream => {
      response.writeHead(upstream.statusCode ?? 503, upstream.headers)
      upstream.pipe(response)
    })
    .on('error', () => {
      response.statusCode = 503
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ error: 'MintUnavailable' }))
    })
}

module.exports = config
