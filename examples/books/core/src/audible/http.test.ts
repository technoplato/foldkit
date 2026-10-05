import { Effect, Exit, Option, Redacted, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { httpAudibleImport } from './http.js'
import { AddressMismatch, NotSignedIn, Unavailable } from './problem.js'
import { Asin, type ImportSummary } from './title.js'

type Sent = Readonly<{
  url: string
  method: string
  body: string | undefined
  headers: Readonly<Record<string, string>>
}>

const answering = (respond: (sent: Sent) => Response) => {
  const sent: Array<Sent> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request: Sent = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      headers: Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([name, value]) => [
          name,
          String(value),
        ]),
      ),
    }
    sent.push(request)
    return respond(request)
  }
  return { sent, fetch }
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const eventStream = (chunks: ReadonlyArray<string>): Response => {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

const summary: ImportSummary = {
  added: 37,
  matched: 3,
  notAdded: [],
  marked: [{ mark: 'Free', count: 3 }],
  leftOut: ['Publisher'],
}

const frame = (event: unknown): string =>
  `event: import\ndata: ${JSON.stringify(event)}\n\n`

const landing =
  'https://www.amazon.com/ap/maplanding?openid.oa2.authorization_code=ANfakeCode'

describe('the Audible import over HTTP', () => {
  it('starts a sign-in on the same origin, with the terminal login it is given', async () => {
    const { sent, fetch } = answering(() =>
      jsonResponse(200, { loginUrl: 'https://www.amazon.com/ap/signin?x=1' }),
    )
    const audible = httpAudibleImport({
      origin: 'https://books.example.invalid',
      headers: { 'cf-access-token': 'made-up-access-token' },
      fetch,
    })
    const started = await Effect.runPromise(audible.startSignIn)
    expect(started).toEqual({
      loginUrl: 'https://www.amazon.com/ap/signin?x=1',
    })
    expect(sent).toEqual([
      expect.objectContaining({
        url: 'https://books.example.invalid/__books/audible/start',
        method: 'POST',
        headers: expect.objectContaining({
          'cf-access-token': 'made-up-access-token',
        }),
      }),
    ])
  })

  it('sends the pasted address only in the body of the request that finishes the sign-in', async () => {
    const { sent, fetch } = answering(() => jsonResponse(200, {}))
    const audible = httpAudibleImport({ origin: '', fetch })
    await Effect.runPromise(audible.finishSignIn(Redacted.make(landing)))
    expect(sent).toEqual([
      expect.objectContaining({
        url: '/__books/audible/finish',
        method: 'POST',
        body: JSON.stringify({ redirectUrl: landing }),
      }),
    ])
    expect(sent[0]?.url).not.toContain('ANfakeCode')
  })

  it('reads the problem the server answers, and says who to ask when it answers none', async () => {
    const problemOf = async (response: Response) => {
      const audible = httpAudibleImport({
        origin: '',
        fetch: async () => response,
      })
      const exit = await Effect.runPromiseExit(audible.readLibrary)
      return Exit.match(exit, {
        onSuccess: () => Option.none(),
        onFailure: cause =>
          Option.map(
            Option.fromNullishOr(
              cause.reasons.find(reason => reason._tag === 'Fail'),
            ),
            reason =>
              reason._tag === 'Fail' ? reason.error.problem : NotSignedIn(),
          ),
      })
    }
    expect(
      await problemOf(
        jsonResponse(400, { problem: { _tag: 'AddressMismatch' } }),
      ),
    ).toEqual(Option.some(AddressMismatch()))
    expect(await problemOf(new Response('', { status: 401 }))).toEqual(
      Option.some(NotSignedIn()),
    )
    expect(await problemOf(new Response('<html>', { status: 404 }))).toEqual(
      Option.some(
        Unavailable({ reason: 'this Books server has no Audible import' }),
      ),
    )
  })

  it('reads an import as it streams, through keep-alives and split frames, to the summary', async () => {
    const advanced = {
      _tag: 'ImportAdvanced',
      progress: { stage: 'ReadingChapters', done: 1, total: 2 },
    }
    const finished = { _tag: 'ImportFinished', summary }
    const whole = `: import\n\n${frame(advanced)}: keep-alive\n\n${frame(finished)}`
    const { sent, fetch } = answering(() =>
      eventStream([whole.slice(0, 40), whole.slice(40, 90), whole.slice(90)]),
    )
    const audible = httpAudibleImport({ origin: '', fetch })
    const updates = await Effect.runPromise(
      Stream.runCollect(audible.importTitles([Asin.make('B0FAKE0001')])),
    )
    expect(updates).toEqual([advanced, finished])
    expect(sent).toEqual([
      expect.objectContaining({
        url: '/__books/audible/import',
        body: JSON.stringify({ asins: ['B0FAKE0001'] }),
      }),
    ])
  })

  it('fails an import that stops before its summary, or that the server stops', async () => {
    const importOf = async (chunks: ReadonlyArray<string>) => {
      const audible = httpAudibleImport({
        origin: '',
        fetch: async () => eventStream(chunks),
      })
      return Exit.match(
        await Effect.runPromiseExit(
          Stream.runCollect(audible.importTitles([Asin.make('B0FAKE0001')])),
        ),
        {
          onSuccess: () => 'finished',
          onFailure: cause =>
            JSON.stringify(
              cause.reasons.flatMap(reason =>
                reason._tag === 'Fail' ? [reason.error.problem] : [],
              ),
            ),
        },
      )
    }
    expect(
      await importOf([
        frame({
          _tag: 'ImportAdvanced',
          progress: { stage: 'AddingBooks', done: 1, total: 8 },
        }),
      ]),
    ).toBe(
      JSON.stringify([
        Unavailable({ reason: 'the import stopped before it was done' }),
      ]),
    )
    expect(
      await importOf([
        frame({ _tag: 'ImportStopped', problem: { _tag: 'LoginExpired' } }),
      ]),
    ).toBe(JSON.stringify([{ _tag: 'LoginExpired' }]))
  })
})
