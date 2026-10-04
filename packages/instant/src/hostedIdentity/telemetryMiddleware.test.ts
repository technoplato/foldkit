import { Option } from 'effect'
import { Telemetry } from 'foldkit'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { makeTelemetryMiddleware } from './vite.js'

const batch: Telemetry.TelemetryBatch = {
  app: 'books',
  host: 'react',
  events: [
    Telemetry.SessionStarted.make({
      at: '2026-10-04T20:15:02.114Z',
      sequence: 1,
      session: '9f3c2a71',
      app: 'books',
      host: 'react',
      programId: 'sync:books',
      programVersion: 1,
    }),
    Telemetry.Rendered.make({
      at: '2026-10-04T20:15:03.410Z',
      sequence: 2,
      session: '9f3c2a71',
      painter: 'React',
      durationMs: 3.2,
    }),
  ],
}

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
    'appends a local batch to the file for its app and host',
    withServer(async ({ origin, directory }) => {
      const response = await fetch(`${origin}/__foldkit/telemetry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(batch),
      })
      expect(response.status).toBe(204)
      const text = await readFile(join(directory, 'books-react.ndjson'), 'utf8')
      expect(
        text
          .split('\n')
          .filter(line => line !== '')
          .map(Telemetry.decodeLine),
      ).toStrictEqual(batch.events.map(event => Option.some(event)))
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
