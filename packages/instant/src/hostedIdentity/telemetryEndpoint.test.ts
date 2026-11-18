import { Option } from 'effect'
import { Telemetry } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import { AccessIdentity } from './hostedIdentity.js'
import { answerTelemetryRequest } from './telemetryEndpoint.js'

const goodToken = 'good.access.token'

const verifyAccessToken = async (
  token: string,
): Promise<Option.Option<AccessIdentity>> =>
  token === goodToken
    ? Option.some(AccessIdentity.make({ email: 'owner@example.invalid' }))
    : Option.none()

const rendered = Telemetry.Rendered.make({
  at: '2026-10-04T20:15:03.410Z',
  sequence: 1,
  session: '9f3c2a71',
  app: 'books',
  surface: 'web-react',
  painter: 'React',
  durationMs: 3.2,
})

const batch: Telemetry.TelemetryBatch = {
  app: 'books',
  surface: 'web-react',
  events: [rendered],
}

const throughCloudflare = {
  host: 'books.pisspoursoftware.xyz',
  'cf-ray': '8c0000000000-MIA',
  'x-forwarded-for': '203.0.113.9',
}

const onThisMachine = { host: '127.0.0.1:5183' }

const ask = (
  headers: Readonly<Record<string, string>>,
  options: Readonly<{
    method?: string
    url?: string
    body?: Option.Option<string>
  }> = {},
) => {
  const appendBatch = vi.fn(async (_batch: Telemetry.TelemetryBatch) => {})
  const answer = answerTelemetryRequest({
    verifyAccessToken,
    remoteAddress: '127.0.0.1',
    headers,
    method: options.method ?? 'POST',
    url: options.url ?? '/__foldkit/telemetry',
    readBody: async () => options.body ?? Option.some(JSON.stringify(batch)),
    appendBatch,
  })
  return { answer, appendBatch }
}

describe('answerTelemetryRequest', () => {
  it('answers 404 to a visitor with no login, as if the path did not exist', async () => {
    const posted = ask(throughCloudflare)
    expect(
      Option.map(await posted.answer, answer => answer.status),
    ).toStrictEqual(Option.some(404))
    expect(posted.appendBatch).not.toHaveBeenCalled()

    const forged = ask({
      ...throughCloudflare,
      'cf-access-jwt-assertion': 'forged.token',
    })
    expect(
      Option.map(await forged.answer, answer => answer.status),
    ).toStrictEqual(Option.some(404))
    expect(forged.appendBatch).not.toHaveBeenCalled()

    const fetched = ask(throughCloudflare, { method: 'GET' })
    expect(
      Option.map(await fetched.answer, answer => answer.status),
    ).toStrictEqual(Option.some(404))
  })

  it('appends a batch from local development', async () => {
    const posted = ask(onThisMachine)
    expect(
      Option.map(await posted.answer, answer => answer.status),
    ).toStrictEqual(Option.some(204))
    expect(posted.appendBatch).toHaveBeenCalledWith(batch)
  })

  it('appends a batch from a verified login through Cloudflare', async () => {
    const posted = ask({
      ...throughCloudflare,
      'cf-access-jwt-assertion': goodToken,
    })
    expect(
      Option.map(await posted.answer, answer => answer.status),
    ).toStrictEqual(Option.some(204))
    expect(posted.appendBatch).toHaveBeenCalledWith(batch)
  })

  it('keeps the surface the page declared', async () => {
    const foldkitBatch: Telemetry.TelemetryBatch = {
      app: 'books',
      surface: 'web-foldkit',
      events: [{ ...rendered, surface: 'web-foldkit', painter: 'Foldkit' }],
    }
    const posted = ask(onThisMachine, {
      body: Option.some(JSON.stringify(foldkitBatch)),
    })
    expect(
      Option.map(await posted.answer, answer => answer.status),
    ).toStrictEqual(Option.some(204))
    expect(posted.appendBatch).toHaveBeenCalledWith(foldkitBatch)
  })

  it('refuses a surface outside the vocabulary, and events from another origin', async () => {
    const unknownSurface = ask(onThisMachine, {
      body: Option.some('{"app":"books","surface":"desktop","events":[]}'),
    })
    const refusal = await unknownSurface.answer
    expect(Option.map(refusal, answer => answer.status)).toStrictEqual(
      Option.some(400),
    )
    expect(Option.map(refusal, answer => answer.body)).toStrictEqual(
      Option.some(
        'Not a telemetry batch: a batch is { app, surface, role, events }, and its surface is one of terminal-cli, terminal-tui, terminal-opentui, headless, web-foldkit, web-react, web-svelte, mobile-ios, mobile-android',
      ),
    )
    expect(unknownSurface.appendBatch).not.toHaveBeenCalled()

    const eventsFromElsewhere: ReadonlyArray<Telemetry.TelemetryEvent> = [
      { ...rendered, surface: 'terminal-tui' },
      { ...rendered, app: 'reminders' },
      { ...rendered, role: 'daemon' },
    ]
    for (const event of eventsFromElsewhere) {
      const mixed = ask(onThisMachine, {
        body: Option.some(
          JSON.stringify({ ...batch, events: [rendered, event] }),
        ),
      })
      const answer = await mixed.answer
      expect(Option.map(answer, refused => refused.status)).toStrictEqual(
        Option.some(400),
      )
      expect(Option.map(answer, refused => refused.body)).toStrictEqual(
        Option.some(
          'Every event in a telemetry batch carries the batch app, surface, and role',
        ),
      )
      expect(mixed.appendBatch).not.toHaveBeenCalled()
    }
  })

  it('refuses a body that is not a batch, too large, or not POSTed', async () => {
    const garbled = ask(onThisMachine, {
      body: Option.some('{"app":"books","host":"../etc","events":[]}'),
    })
    expect(
      Option.map(await garbled.answer, answer => answer.status),
    ).toStrictEqual(Option.some(400))
    expect(garbled.appendBatch).not.toHaveBeenCalled()

    const oversized = ask(onThisMachine, { body: Option.none() })
    expect(
      Option.map(await oversized.answer, answer => answer.status),
    ).toStrictEqual(Option.some(413))

    const fetched = ask(onThisMachine, { method: 'GET' })
    expect(
      Option.map(await fetched.answer, answer => answer.status),
    ).toStrictEqual(Option.some(405))
  })

  it('leaves every other path to the server', async () => {
    const other = ask(throughCloudflare, { url: '/books/a-new-earth' })
    expect(await other.answer).toStrictEqual(Option.none())
  })
})
