import { Option } from 'effect'
import { Telemetry } from 'foldkit'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { makeTelemetryMiddleware } from './vite.js'

const batchOn = (
  surface: Telemetry.TelemetrySurface,
  session: string,
): Telemetry.TelemetryBatch => ({
  app: 'books',
  surface,
  events: [
    Telemetry.SessionStarted.make({
      at: '2026-10-04T20:15:02.114Z',
      sequence: 1,
      session,
      app: 'books',
      surface,
      programId: 'sync:books',
      programVersion: 1,
    }),
    Telemetry.Rendered.make({
      at: '2026-10-04T20:15:03.410Z',
      sequence: 2,
      session,
      app: 'books',
      surface,
      painter: 'React',
      durationMs: 3.2,
    }),
  ],
})

const batch = batchOn('web-react', '9f3c2a71')

const linesIn = async (path: string): Promise<ReadonlyArray<string>> =>
  (await readFile(path, 'utf8')).split('\n').filter(line => line !== '')

const post = (origin: string, body: string): Promise<Response> =>
  fetch(`${origin}/__foldkit/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })

type Served = Readonly<{ origin: string; directory: string }>

const withServer =
  (test: (served: Served) => Promise<void>) => async (): Promise<void> => {
    const directory = await mkdtemp(
      join(tmpdir(), 'foldkit-telemetry-endpoint-'),
    )
    const telemetry = makeTelemetryMiddleware({
      directory,
      teamDomain: 'telemetry-test.invalid',
      audiences: [],
    })
    const server = createServer((request, response) => {
      telemetry.handle(request, response, () => {
        response.statusCode = 200
        response.end('the app')
      })
    })
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    const port =
      typeof address === 'object' && address !== null ? address.port : 0
    try {
      await test({ origin: `http://127.0.0.1:${port}`, directory })
    } finally {
      await new Promise<void>(resolve => {
        server.close(() => resolve())
      })
      await telemetry.close()
      await rm(directory, { recursive: true, force: true })
    }
  }

describe('foldkitTelemetry middleware', () => {
  it(
    'appends a local batch to the file for its app and surface',
    withServer(async ({ origin, directory }) => {
      const response = await post(origin, JSON.stringify(batch))
      expect(response.status).toBe(204)
      const lines = await linesIn(join(directory, 'books-web-react.ndjson'))
      expect(lines.map(Telemetry.decodeLine)).toStrictEqual(
        batch.events.map(event => Option.some(event)),
      )
      lines.forEach(line => {
        expect(line).toContain('"app":"books","surface":"web-react"')
      })
    }),
  )

  it(
    'keeps each surface in its own file, and writes nothing for a surface outside the vocabulary',
    withServer(async ({ origin, directory }) => {
      expect((await post(origin, JSON.stringify(batch))).status).toBe(204)
      expect(
        (await post(origin, JSON.stringify(batchOn('web-foldkit', '5e1f0b22'))))
          .status,
      ).toBe(204)
      expect(
        (
          await post(
            origin,
            JSON.stringify({ ...batch, surface: 'desktop', events: [] }),
          )
        ).status,
      ).toBe(400)
      expect((await readdir(directory)).sort()).toStrictEqual([
        'books-web-foldkit.ndjson',
        'books-web-react.ndjson',
      ])
      const foldkitLines = await linesIn(
        join(directory, 'books-web-foldkit.ndjson'),
      )
      expect(foldkitLines).toHaveLength(2)
      foldkitLines.forEach(line => {
        expect(line).toContain('"app":"books","surface":"web-foldkit"')
      })
    }),
  )

  it(
    'answers 404 through a proxy without a login and writes nothing',
    withServer(async ({ origin, directory }) => {
      const response = await fetch(`${origin}/__foldkit/telemetry`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-ray': '8c0000000000-MIA',
          'x-forwarded-for': '203.0.113.9',
        },
        body: JSON.stringify(batch),
      })
      expect(response.status).toBe(404)
      expect(await readdir(directory)).toStrictEqual([])
    }),
  )

  it(
    'serves every other path as the app',
    withServer(async ({ origin }) => {
      const response = await fetch(`${origin}/books/a-new-earth`)
      expect(await response.text()).toBe('the app')
    }),
  )
})
