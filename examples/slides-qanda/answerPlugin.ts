import { Array, Option } from 'effect'
import { watch } from 'node:fs'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

import {
  answerPath,
  fileExists,
  isSlideId,
  loadLog,
  parseLog,
  persistPostedPaste,
  writeLog,
} from './answerPersist'
import { exploresOf } from './src/domain'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const ANSWERS_DIR = path.join(ROOT, 'answers')
const DECK_PATH = path.join(ROOT, 'public', 'deck.json')

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    req.on('data', chunk => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    })
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })

const send = (
  res: ServerResponse,
  status: number,
  headers: Readonly<Record<string, string>>,
  body: string,
): void => {
  res.statusCode = status
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value)
  }
  res.end(body)
}

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
}

const handle = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> => {
  if (req.url === undefined) {
    return false
  }
  const url = new URL(req.url, 'http://slides.local')
  const method = req.method ?? 'GET'

  if (url.pathname === '/watch' && method === 'GET') {
    res.statusCode = 200
    res.setHeader('content-type', 'text/event-stream; charset=utf-8')
    res.setHeader('cache-control', 'no-cache')
    res.setHeader('connection', 'keep-alive')
    res.write(': ok\n\n')
    const sendEvent = (kind: string) => {
      res.write(`data: ${kind}\n\n`)
    }
    const answersWatch = watch(ANSWERS_DIR, () => {
      sendEvent('answers')
    })
    const deckWatch = watch(path.dirname(DECK_PATH), (_event, filename) => {
      if (filename === 'deck.json') {
        sendEvent('deck')
      }
    })
    req.on('close', () => {
      answersWatch.close()
      deckWatch.close()
    })
    return true
  }

  if (url.pathname === '/answers' && method === 'GET') {
    await mkdir(ANSWERS_DIR, { recursive: true })
    const names = await readdir(ANSWERS_DIR)
    const ids = [
      ...new Set(
        names.flatMap(name => {
          if (name.endsWith('.json') || name.endsWith('.md')) {
            return [name.replace(/\.(json|md)$/, '')]
          }
          return []
        }),
      ),
    ]
    const logs = []
    for (const id of ids) {
      if (!isSlideId(id)) {
        continue
      }
      const log = await loadLog(ANSWERS_DIR, id)
      if (
        Option.isSome(Array.head(log.answers)) ||
        Option.isSome(Array.head(exploresOf(log)))
      ) {
        logs.push(log)
      }
    }
    send(res, 200, jsonHeaders, `${JSON.stringify({ logs }, null, 2)}\n`)
    return true
  }

  if (url.pathname === '/deck.json' && method === 'PUT') {
    const body = await readBody(req)
    try {
      JSON.parse(body)
    } catch {
      send(res, 400, jsonHeaders, '{"error":"invalid json"}')
      return true
    }
    await mkdir(path.dirname(DECK_PATH), { recursive: true })
    await writeFile(DECK_PATH, body, 'utf8')
    send(res, 200, jsonHeaders, body)
    return true
  }

  const answerMatch = /^\/answers\/([^/]+)$/.exec(url.pathname)
  if (answerMatch === null) {
    return false
  }
  const maybeId = Array.get(answerMatch, 1)
  if (Option.isNone(maybeId)) {
    return false
  }
  const slideId = maybeId.value
  const jsonPath = answerPath(ANSWERS_DIR, slideId, '.json')
  if (jsonPath === undefined) {
    send(res, 400, jsonHeaders, '{"error":"bad slide id"}')
    return true
  }

  if (method === 'GET') {
    const log = await loadLog(ANSWERS_DIR, slideId)
    if (Option.isNone(Array.head(log.answers)) && !(await fileExists(jsonPath))) {
      send(res, 404, jsonHeaders, '')
      return true
    }
    send(res, 200, jsonHeaders, `${JSON.stringify(log, null, 2)}\n`)
    return true
  }

  if (method === 'POST') {
    const raw = await readBody(req)
    const next = await persistPostedPaste(ANSWERS_DIR, slideId, raw)
    send(res, 200, jsonHeaders, `${JSON.stringify(next, null, 2)}\n`)
    return true
  }

  if (method === 'PUT') {
    const body = await readBody(req)
    const parsed = parseLog(slideId, body)
    if (parsed === undefined) {
      send(res, 400, jsonHeaders, '{"error":"invalid answer log"}')
      return true
    }
    const written = await writeLog(ANSWERS_DIR, parsed)
    send(res, 200, jsonHeaders, written)
    return true
  }

  return false
}

/** Vite middleware that writes deck JSON and per-slide answer logs on disk. */
export const slidesQandaPlugin = (): Plugin => ({
  name: 'slides-qanda-answers',
  configureServer(server) {
    void mkdir(ANSWERS_DIR, { recursive: true })
    server.middlewares.use((req, res, next) => {
      void handle(req, res).then(handled => {
        if (!handled) {
          next()
        }
      }, next)
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      void handle(req, res).then(handled => {
        if (!handled) {
          next()
        }
      }, next)
    })
  },
})
