import { Array, Option } from 'effect'
import { watch } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const SLIDE_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const ANSWERS_DIR = path.join(ROOT, 'answers')
const DECK_PATH = path.join(ROOT, 'public', 'deck.json')

type AnswerStamp = Readonly<{
  at: string
  verbatim: string
  cleaned: string
}>

type AnswerLog = Readonly<{
  slideId: string
  answers: Array<AnswerStamp>
}>

const pad2 = (n: number): string => n.toString().padStart(2, '0')

const localStamp = (date: Date): string => {
  const offsetMin = -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const hours = pad2(Math.floor(abs / 60))
  const minutes = pad2(abs % 60)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}${sign}${hours}:${minutes}`
}

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

const answerPath = (slideId: string, ext: string): string | undefined => {
  if (!SLIDE_ID.test(slideId)) {
    return undefined
  }
  const resolved = path.resolve(ANSWERS_DIR, `${slideId}${ext}`)
  if (!resolved.startsWith(path.resolve(ANSWERS_DIR))) {
    return undefined
  }
  return resolved
}

const parseLog = (slideId: string, raw: string): AnswerLog | undefined => {
  try {
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return undefined
    }
    const record = value as Readonly<{
      slideId?: unknown
      answers?: unknown
    }>
    if (record.slideId !== slideId || !Array.isArray(record.answers)) {
      return undefined
    }
    return {
      slideId,
      answers: record.answers.filter(
        (entry): entry is AnswerStamp =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as AnswerStamp).at === 'string' &&
          typeof (entry as AnswerStamp).verbatim === 'string' &&
          typeof (entry as AnswerStamp).cleaned === 'string',
      ),
    }
  } catch {
    return undefined
  }
}

const loadLog = async (slideId: string): Promise<AnswerLog> => {
  const jsonPath = answerPath(slideId, '.json')
  const mdPath = answerPath(slideId, '.md')
  if (jsonPath !== undefined) {
    try {
      const raw = await readFile(jsonPath, 'utf8')
      const parsed = parseLog(slideId, raw)
      if (parsed !== undefined) {
        return parsed
      }
    } catch {
      // fall through to markdown
    }
  }
  if (mdPath !== undefined) {
    try {
      const verbatim = await readFile(mdPath, 'utf8')
      return {
        slideId,
        answers: [
          {
            at: localStamp(new Date()),
            verbatim,
            cleaned: '',
          },
        ],
      }
    } catch {
      // no prior answer
    }
  }
  return { slideId, answers: [] }
}

const writeLog = async (log: AnswerLog): Promise<string> => {
  const jsonPath = answerPath(log.slideId, '.json')
  if (jsonPath === undefined) {
    throw new Error('Bad slide id')
  }
  await mkdir(ANSWERS_DIR, { recursive: true })
  const body = `${JSON.stringify(log, null, 2)}\n`
  await writeFile(jsonPath, body, 'utf8')
  return body
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
    const send = (kind: string) => {
      res.write(`data: ${kind}\n\n`)
    }
    const answersWatch = watch(ANSWERS_DIR, () => {
      send('answers')
    })
    const deckWatch = watch(path.dirname(DECK_PATH), (_event, filename) => {
      if (filename === 'deck.json') {
        send('deck')
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
      if (!SLIDE_ID.test(id)) {
        continue
      }
      const log = await loadLog(id)
      if (!Array.isArrayEmpty(log.answers)) {
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
  const jsonPath = answerPath(slideId, '.json')
  if (jsonPath === undefined) {
    send(res, 400, jsonHeaders, '{"error":"bad slide id"}')
    return true
  }

  if (method === 'GET') {
    const log = await loadLog(slideId)
    if (Array.isArrayEmpty(log.answers) && !(await fileExists(jsonPath))) {
      send(res, 404, jsonHeaders, '')
      return true
    }
    send(res, 200, jsonHeaders, `${JSON.stringify(log, null, 2)}\n`)
    return true
  }

  if (method === 'POST') {
    const verbatim = await readBody(req)
    const current = await loadLog(slideId)
    const stamp: AnswerStamp = {
      at: localStamp(new Date()),
      verbatim,
      cleaned: '',
    }
    const next: AnswerLog = {
      slideId,
      answers: Array.prepend(current.answers, stamp),
    }
    const body = await writeLog(next)
    send(res, 200, jsonHeaders, body)
    return true
  }

  if (method === 'PUT') {
    const body = await readBody(req)
    const parsed = parseLog(slideId, body)
    if (parsed === undefined) {
      send(res, 400, jsonHeaders, '{"error":"invalid answer log"}')
      return true
    }
    const written = await writeLog(parsed)
    send(res, 200, jsonHeaders, written)
    return true
  }

  return false
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
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
