import {
  Array,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Redacted,
  Stream,
  String,
} from 'effect'
import { describe, expect, it } from 'vitest'

import { Milliseconds } from '../ids.js'
import {
  AudibleBridge,
  AudibleBridgeError,
  type BridgeLibrary,
} from './bridge.node.js'
import { type AppliedImport, makeTestLibraryImport } from './libraryImport.js'
import {
  AudibleMembers,
  type AudibleRequest,
  type AudibleResponse,
  AudibleServerConfig,
  audibleSessions,
  handleAudibleRequest,
} from './server.node.js'
import { Asin, type ListedTitle } from './title.js'
import { memoryVault } from './vault.node.js'

const memberEmail = 'listener@example.invalid'

const memberHeader = 'x-test-member'

const verifier = 'made-up-verifier-4f2a'

const serial = 'MADEUPSERIAL9C1E'

const savedLogin = 'made-up-saved-login-77d0'

const signInCode = 'ANmadeUpSignInCode'

const landing = `https://www.amazon.com/ap/maplanding?openid.mode=id_res&openid.oa2.authorization_code=${signInCode}`

const listedOf = (asin: string, name: string): ListedTitle => ({
  asin: Asin.make(asin),
  name,
  maybeSubtitle: Option.none(),
  authors: ['Mara Linden'],
  narrators: ['Ezra Vale'],
  series: [],
  maybeCoverUrl: Option.none(),
  maybeRuntimeMs: Option.some(Milliseconds.make(36_000_000)),
})

const library: BridgeLibrary = {
  titles: [
    listedOf('B0FAKE0001', 'The Quiet Orchard'),
    listedOf('B002V0RAUU', 'A New Earth'),
    listedOf('B0FAKE0003', 'Paper Boats'),
    listedOf('B0FAKEPOD1', 'The Made-Up Hour'),
  ],
  items: [
    { asin: 'B0FAKE0001', title: 'The Quiet Orchard' },
    { asin: 'B002V0RAUU', title: 'A New Earth' },
    { asin: 'B0FAKE0003', title: 'Paper Boats' },
    { asin: 'B0FAKEPOD1', title: 'The Made-Up Hour' },
  ],
}

type BridgeCalls = {
  starts: number
  finishedWith: Array<Readonly<{ address: string; verifier: string }>>
  libraryReads: number
  detailsFor: Array<ReadonlyArray<string>>
}

const minuteMs = 60_000

const makeServer = async (
  options: Readonly<{
    isLoginExpired?: boolean
  }> = {},
) => {
  const logs: Array<string> = []
  const calls: BridgeCalls = {
    starts: 0,
    finishedWith: [],
    libraryReads: 0,
    detailsFor: [],
  }
  const clock = { nowMs: 1_000_000 }
  const importer = await Effect.runPromise(
    makeTestLibraryImport({
      inLibrary: ['B002V0RAUU'],
      skipped: [{ asin: 'B0FAKEPOD1', kind: 'Podcast' }],
      marked: [{ asin: 'B0FAKE0003', mark: 'Free' }],
    }),
  )
  const bridge = Layer.succeed(AudibleBridge, {
    start: locale =>
      Effect.sync(() => {
        calls.starts += 1
        return {
          loginUrl: `https://www.amazon.com/ap/signin?openid.mode=checkid_setup&locale=${locale}`,
          codeVerifier: Redacted.make(verifier),
          serial: Redacted.make(serial),
          locale,
        }
      }),
    finish: ({ redirectUrl, signIn }) =>
      Effect.sync(() => {
        calls.finishedWith.push({
          address: Redacted.value(redirectUrl),
          verifier: Redacted.value(signIn.codeVerifier),
        })
        return Redacted.make(savedLogin)
      }),
    library: credentials =>
      Effect.suspend(() => {
        calls.libraryReads += 1
        if (Redacted.value(credentials) !== savedLogin) {
          return Effect.fail(
            new AudibleBridgeError({
              kind: 'Unexpected',
              maybeCode: Option.none(),
            }),
          )
        } else if (options.isLoginExpired === true) {
          return Effect.fail(
            new AudibleBridgeError({
              kind: 'LoginExpired',
              maybeCode: Option.none(),
            }),
          )
        } else {
          return Effect.succeed(library)
        }
      }),
    details: (_credentials, asins) => {
      calls.detailsFor.push(asins)
      return Stream.fromIterable(
        Array.map(asins, asin => ({
          asin,
          maybeDetails: Option.some({
            asin,
            chapters: [
              {
                name: 'Blossom',
                startMs: Milliseconds.make(0),
                endMs: Milliseconds.make(60_000),
              },
            ],
            maybeRuntimeMs: Option.some(Milliseconds.make(60_000)),
            maybePosition: Option.none(),
            source: { asin },
          }),
        })),
      )
    },
  })
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(AudibleMembers, {
        ownerOf: request =>
          Effect.succeed(
            request.headers[memberHeader] === 'yes'
              ? Option.some({ email: memberEmail })
              : Option.none(),
          ),
      }),
      Layer.succeed(AudibleServerConfig, {
        locale: 'us',
        nowMs: () => clock.nowMs,
        log: line => {
          logs.push(line)
        },
      }),
      audibleSessions,
      memoryVault,
      bridge,
      importer.layer,
    ),
  )
  const answers: Array<string> = []
  const ask = async (
    method: string,
    path: string,
    body = '',
    isMember = true,
  ): Promise<Option.Option<AudibleResponse>> => {
    const request: AudibleRequest = {
      method,
      path,
      headers: isMember ? { [memberHeader]: 'yes' } : {},
      remoteAddress: '203.0.113.9',
      body,
    }
    const maybeAnswer = await runtime.runPromise(handleAudibleRequest(request))
    Option.map(maybeAnswer, answer => {
      if (answer._tag === 'Json') {
        answers.push(answer.body)
      }
    })
    return maybeAnswer
  }
  const json = async (
    method: string,
    path: string,
    body = '',
    isMember = true,
  ): Promise<Readonly<{ status: number; body: unknown }>> => {
    const maybeAnswer = await ask(method, path, body, isMember)
    const answer = Option.getOrThrow(maybeAnswer)
    if (answer._tag !== 'Json') {
      throw new Error('expected a JSON answer')
    }
    return { status: answer.status, body: JSON.parse(answer.body) }
  }
  const frames = async (body: string): Promise<ReadonlyArray<unknown>> => {
    const answer = Option.getOrThrow(
      await ask('POST', '/__books/audible/import', body),
    )
    if (answer._tag !== 'Events') {
      throw new Error(`expected events, got ${answer.body}`)
    }
    const all = await runtime.runPromise(Stream.runCollect(answer.frames))
    answers.push(...all)
    return Array.map(all, frame => {
      const data = Option.getOrThrow(
        Array.findFirst(String.split(frame, '\n'), line =>
          String.startsWith('data: ')(line),
        ),
      )
      return JSON.parse(data.slice('data: '.length))
    })
  }
  const connect = async () => {
    await json('POST', '/__books/audible/start')
    return json(
      'POST',
      '/__books/audible/finish',
      JSON.stringify({ redirectUrl: landing }),
    )
  }
  return {
    ask,
    json,
    frames,
    connect,
    logs,
    calls,
    clock,
    answers,
    applied: () => Effect.runPromise(importer.applied),
    dispose: () => runtime.dispose(),
  }
}

const secretsIn = (text: string): ReadonlyArray<string> =>
  Array.filter(
    [verifier, serial, savedLogin, signInCode, memberEmail],
    secret => text.includes(secret),
  )

describe('the Audible import server', () => {
  it('refuses a request without a verified Access login before anything else', async () => {
    const server = await makeServer()
    for (const [method, path] of [
      ['POST', '/__books/audible/start'],
      ['POST', '/__books/audible/finish'],
      ['GET', '/__books/audible/library'],
      ['POST', '/__books/audible/import'],
    ] as const) {
      expect(await server.json(method, path, '', false)).toEqual({
        status: 401,
        body: { problem: { _tag: 'NotSignedIn' } },
      })
    }
    expect(server.calls.starts).toBe(0)
    expect(server.calls.libraryReads).toBe(0)
    expect(server.logs).toContain(
      'audible: refused a request with no Access login',
    )
    await server.dispose()
  })

  it('leaves every other path to the rest of the server', async () => {
    const server = await makeServer()
    expect(await server.ask('GET', '/books/audible')).toEqual(Option.none())
    expect(await server.json('GET', '/__books/audible/start')).toEqual({
      status: 405,
      body: {
        problem: {
          _tag: 'Unavailable',
          reason: 'that is not how to ask for this',
        },
      },
    })
    expect(
      (await server.json('GET', '/__books/audible/elsewhere')).status,
    ).toBe(404)
    await server.dispose()
  })

  it('starts a sign-in and answers only its address, the same one while it is fresh', async () => {
    const server = await makeServer()
    const first = await server.json('POST', '/__books/audible/start')
    expect(first).toEqual({
      status: 200,
      body: {
        loginUrl:
          'https://www.amazon.com/ap/signin?openid.mode=checkid_setup&locale=us',
      },
    })
    server.clock.nowMs += 5 * minuteMs
    expect(await server.json('POST', '/__books/audible/start')).toEqual(first)
    expect(server.calls.starts).toBe(1)
    server.clock.nowMs += 6 * minuteMs
    await server.json('POST', '/__books/audible/start')
    expect(server.calls.starts).toBe(2)
    await server.dispose()
  })

  it('asks for the sign-in before there is a login', async () => {
    const server = await makeServer()
    expect(await server.json('GET', '/__books/audible/library')).toEqual({
      status: 409,
      body: { problem: { _tag: 'NotConnected' } },
    })
    await server.dispose()
  })

  it('refuses a pasted address that is not the landing page, and still finishes with the right one', async () => {
    const server = await makeServer()
    await server.json('POST', '/__books/audible/start')
    expect(
      await server.json(
        'POST',
        '/__books/audible/finish',
        JSON.stringify({ redirectUrl: 'https://www.amazon.com/' }),
      ),
    ).toEqual({ status: 400, body: { problem: { _tag: 'AddressMismatch' } } })
    expect(
      await server.json(
        'POST',
        '/__books/audible/finish',
        JSON.stringify({ redirectUrl: landing }),
      ),
    ).toEqual({ status: 200, body: {} })
    expect(server.calls.finishedWith).toEqual([{ address: landing, verifier }])
    await server.dispose()
  })

  it('says a sign-in expired when there is none open, or it is over 20 minutes old', async () => {
    const server = await makeServer()
    const finish = () =>
      server.json(
        'POST',
        '/__books/audible/finish',
        JSON.stringify({ redirectUrl: landing }),
      )
    expect(await finish()).toEqual({
      status: 410,
      body: { problem: { _tag: 'SignInExpired' } },
    })
    await server.json('POST', '/__books/audible/start')
    server.clock.nowMs += 21 * minuteMs
    expect(await finish()).toEqual({
      status: 410,
      body: { problem: { _tag: 'SignInExpired' } },
    })
    expect(server.calls.finishedWith).toEqual([])
    await server.dispose()
  })

  it('lists the titles the importer would bring in, marked, and counts what it skips', async () => {
    const server = await makeServer()
    await server.connect()
    const listed = await server.json('GET', '/__books/audible/library')
    expect(listed.status).toBe(200)
    expect(listed.body).toEqual({
      titles: [
        expect.objectContaining({
          asin: 'B0FAKE0001',
          match: 'New',
          marks: [],
        }),
        expect.objectContaining({
          asin: 'B002V0RAUU',
          match: 'InLibrary',
          marks: [],
        }),
        expect.objectContaining({
          asin: 'B0FAKE0003',
          match: 'New',
          marks: ['Free'],
        }),
      ],
      skipped: [{ kind: 'Podcast', count: 1 }],
    })
    await server.json('GET', '/__books/audible/library')
    expect(server.calls.libraryReads).toBe(1)
    await server.dispose()
  })

  it('says the login stopped working when Audible no longer accepts it', async () => {
    const server = await makeServer({ isLoginExpired: true })
    await server.connect()
    expect(await server.json('GET', '/__books/audible/library')).toEqual({
      status: 409,
      body: { problem: { _tag: 'LoginExpired' } },
    })
    await server.dispose()
  })

  it('imports the chosen titles with their chapters, reporting each step, then the summary', async () => {
    const server = await makeServer()
    await server.connect()
    const events = await server.frames(
      JSON.stringify({ asins: ['B0FAKE0001', 'B002V0RAUU', 'B0NOTOWNED'] }),
    )
    expect(Array.map(events, event => JSON.stringify(event))).toEqual(
      Array.map(
        [
          {
            _tag: 'ImportAdvanced',
            progress: { stage: 'ReadingChapters', done: 0, total: 2 },
          },
          {
            _tag: 'ImportAdvanced',
            progress: { stage: 'ReadingChapters', done: 1, total: 2 },
          },
          {
            _tag: 'ImportAdvanced',
            progress: { stage: 'ReadingChapters', done: 2, total: 2 },
          },
          {
            _tag: 'ImportAdvanced',
            progress: { stage: 'AddingBooks', done: 0, total: 2 },
          },
          {
            _tag: 'ImportAdvanced',
            progress: { stage: 'AddingBooks', done: 1, total: 2 },
          },
          {
            _tag: 'ImportAdvanced',
            progress: { stage: 'AddingBooks', done: 2, total: 2 },
          },
          {
            _tag: 'ImportFinished',
            summary: {
              added: 1,
              matched: 1,
              notAdded: [],
              marked: [],
              leftOut: [],
            },
          },
        ],
        event => JSON.stringify(event),
      ),
    )
    expect(server.calls.detailsFor).toEqual([['B0FAKE0001', 'B002V0RAUU']])
    const applied: ReadonlyArray<AppliedImport> = await server.applied()
    expect(
      Array.map(applied, ({ owner, asins, details }) => ({
        owner,
        asins,
        chapters: Array.map(details, result =>
          Option.match(result.maybeDetails, {
            onNone: () => 0,
            onSome: found => found.chapters.length,
          }),
        ),
      })),
    ).toEqual([
      {
        owner: { email: memberEmail },
        asins: ['B0FAKE0001', 'B002V0RAUU'],
        chapters: [1, 1],
      },
    ])
    await server.dispose()
  })

  it('refuses an import of titles that are not in the library', async () => {
    const server = await makeServer()
    await server.connect()
    expect(
      await server.json(
        'POST',
        '/__books/audible/import',
        JSON.stringify({ asins: ['B0NOTOWNED'] }),
      ),
    ).toEqual({
      status: 400,
      body: {
        problem: {
          _tag: 'Unavailable',
          reason: 'none of those titles are in your Audible library',
        },
      },
    })
    await server.dispose()
  })

  it('never answers or logs the verifier, the serial, the saved login, the pasted code, or the email', async () => {
    const server = await makeServer()
    await server.connect()
    await server.json(
      'POST',
      '/__books/audible/finish',
      JSON.stringify({ redirectUrl: 'https://www.amazon.com/' }),
    )
    await server.json('GET', '/__books/audible/library')
    await server.frames(JSON.stringify({ asins: ['B0FAKE0001'] }))
    expect(secretsIn(Array.join(server.answers, '\n'))).toEqual([])
    expect(secretsIn(Array.join(server.logs, '\n'))).toEqual([])
    expect(server.logs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^audible [0-9a-f]{8}: connected$/),
      ]),
    )
    await server.dispose()
  })
})
