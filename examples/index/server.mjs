#!/opt/homebrew/bin/node

/**
 * Serves https://pisspoursoftware.xyz from 127.0.0.1:8789: the built Foldkit page
 * in dist/ and the site list it loads from /api/sites.json (derived in sites.mjs).
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import { routingFilesKey } from './sites.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOST = process.env.SITE_INDEX_HOST || '127.0.0.1'
const PORT = Number(process.env.SITE_INDEX_PORT || 8789)
const DIST_DIR =
  process.env.SITE_INDEX_DIST_DIR || path.resolve(__dirname, 'dist')

const ROUTING_FILES_POLL_MS = 5 * 1000
const MAX_LIST_AGE_MS = 60 * 1000
const REBUILD_DEADLINE_MS = 60 * 1000

// NOTE: a rebuild is one to two seconds of blocking work, and far longer on a
// busy Mac, so it runs on a worker thread. The server listens before the first
// list exists. A request made before then waits for that list; every later
// request gets the newest finished list at once.
const list = {
  sitesJson: null,
  builtKey: '',
  builtAt: 0,
  isRebuilding: false,
  waitingForFirst: [],
}

function answerWaitingForFirst() {
  for (const respond of list.waitingForFirst) {
    respond()
  }
  list.waitingForFirst = []
}

function rebuildSites() {
  if (list.isRebuilding) {
    return
  }
  list.isRebuilding = true

  const key = routingFilesKey()
  const worker = new Worker(new URL('./rebuild-worker.mjs', import.meta.url))
  const deadline = setTimeout(() => {
    process.stderr.write(
      `site list rebuild passed ${REBUILD_DEADLINE_MS} ms and was stopped\n`,
    )
    void worker.terminate()
  }, REBUILD_DEADLINE_MS)

  worker.once('message', nextSitesJson => {
    list.sitesJson = nextSitesJson
    list.builtKey = key
  })
  worker.once('error', error => {
    process.stderr.write(`site list rebuild failed: ${error.message}\n`)
  })
  worker.once('exit', () => {
    clearTimeout(deadline)
    list.builtAt = Date.now()
    list.isRebuilding = false
    answerWaitingForFirst()
  })
}

rebuildSites()

setInterval(() => {
  if (
    routingFilesKey() !== list.builtKey ||
    Date.now() - list.builtAt >= MAX_LIST_AGE_MS
  ) {
    rebuildSites()
  }
}, ROUTING_FILES_POLL_MS)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function readFileOrNull(filePath) {
  try {
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(text)
}

function serveStaticFile(req, res, pathname) {
  const distRoot = path.resolve(DIST_DIR)
  const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const resolved = path.resolve(distRoot, relPath)
  if (!resolved.startsWith(distRoot + path.sep)) {
    sendText(res, 403, 'Forbidden')
    return true
  }

  const body = readFileOrNull(resolved)
  if (body === null) {
    return false
  }

  const ext = path.extname(resolved).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control':
      ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  res.end(req.method === 'HEAD' ? '' : body)
  return true
}

function serveSiteList(req, res) {
  const respond = () => {
    if (list.sitesJson === null) {
      sendText(res, 503, 'The site list could not be built')
      return
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(req.method === 'HEAD' ? '' : list.sitesJson)
  }

  if (list.sitesJson === null && list.isRebuilding) {
    list.waitingForFirst.push(respond)
  } else {
    respond()
  }
}

function handleRequest(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed')
    return
  }

  if (!URL.canParse(req.url || '/', `http://${HOST}:${PORT}`)) {
    sendText(res, 400, 'Bad Request')
    return
  }
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)

  if (url.pathname === '/api/sites.json') {
    serveSiteList(req, res)
    return
  }

  if (!serveStaticFile(req, res, url.pathname)) {
    sendText(res, 404, 'Not Found')
  }
}

const server = http.createServer((req, res) => {
  try {
    handleRequest(req, res)
  } catch (error) {
    process.stderr.write(`request ${req.url} failed: ${error.message}\n`)
    if (!res.headersSent) {
      sendText(res, 500, 'Internal Server Error')
    } else {
      res.end()
    }
  }
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`site index listening on http://${HOST}:${PORT}\n`)
})
