import { Effect } from 'effect'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { makeCounterPortalServer } from './portalServer.js'

const STATE_FILE_ENVIRONMENT_VARIABLE = 'FOLDKIT_COUNTER_STATE_FILE'
const temporaryDirectories = new Array<string>()

const makeStateFilePath = (): string => {
  const directoryPath = mkdtempSync(join(tmpdir(), 'foldkit-counter-portal-'))
  temporaryDirectories.push(directoryPath)
  return join(directoryPath, 'state', 'counter.json')
}

const readJson = (url: string) =>
  fetch(url).then(response => {
    expect(response.ok).toBe(true)
    return response.json()
  })

const postCommand = (url: string, input: string) =>
  fetch(`${url}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  }).then(response => {
    expect(response.ok).toBe(true)
    return response.json()
  })

const readText = (url: string) =>
  fetch(url).then(response => {
    expect(response.ok).toBe(true)
    return response.text()
  })

const openPendingCommandRequest = (url: string) => {
  const parsedUrl = new URL(url)
  const request = httpRequest(
    {
      hostname: parsedUrl.hostname,
      method: 'POST',
      path: '/commands',
      port: parsedUrl.port,
      headers: { 'content-type': 'application/json' },
    },
    response => {
      response.resume()
    },
  )
  request.on('error', () => {})
  request.write('{"input":"increment"')
  return request
}

const waitForRequestToReachServer = () =>
  new Promise(resolve => {
    setTimeout(resolve, 20)
  })

afterEach(() => {
  temporaryDirectories.forEach(directoryPath => {
    rmSync(directoryPath, { recursive: true, force: true })
  })
  temporaryDirectories.splice(0)
})

describe('Counter terminal portal', () => {
  it('drives one running GUI runtime through HTTP terminal commands', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))

    try {
      const initialModel = await readJson(`${server.localUrl}/model`)
      expect(initialModel).toMatchObject({
        count: '0',
        mode: 'Ready',
        portableUri: '/?mode=Ready&count=0',
        uri: '/counter.terminal?mode=Ready&count=0',
      })

      const incremented = await postCommand(server.localUrl, 'increment')
      expect(incremented).toMatchObject({
        command: 'Increment',
        snapshot: {
          count: '1',
          mode: 'Ready',
          portableUri: '/?mode=Ready&count=1',
          uri: '/counter.terminal?mode=Ready&count=1',
        },
      })

      const decremented = await postCommand(server.localUrl, '-')
      expect(decremented).toMatchObject({
        command: 'Decrement',
        snapshot: {
          count: '0',
          mode: 'Ready',
          portableUri: '/?mode=Ready&count=0',
          uri: '/counter.terminal?mode=Ready&count=0',
        },
      })

      expect(existsSync(stateFilePath)).toBe(true)
    } finally {
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })

  it('rejects overlapping terminal command requests', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))
    const pendingRequest = openPendingCommandRequest(server.localUrl)

    try {
      await waitForRequestToReachServer()
      const response = await fetch(`${server.localUrl}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: 'increment' }),
      })
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.reason).toBe(
        'Terminal is busy. Wait for the current command to settle.',
      )
    } finally {
      pendingRequest.destroy()
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })

  it('runs a command from a carrier GET request against restored state', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))

    try {
      await postCommand(server.localUrl, 'reset')
      const response = await fetch(
        `${server.localUrl}/counter.foldkit?command=increment`,
      )
      expect(response.ok).toBe(true)

      const model = await readJson(`${server.localUrl}/model?medium=Foldkit`)
      expect(model).toMatchObject({
        count: '1',
        mode: 'Ready',
        portableUri: '/?mode=Ready&count=1',
        uri: '/counter.foldkit?mode=Ready&count=1',
        viewMedium: 'Foldkit',
      })
    } finally {
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })

  it('settles URL state before running the carrier GET command', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))

    try {
      const response = await fetch(
        `${server.localUrl}/counter.terminal?mode=Saving&count=3&command=increment`,
      )
      expect(response.ok).toBe(true)

      const model = await readJson(`${server.localUrl}/model`)
      expect(model).toMatchObject({
        count: '4',
        mode: 'Ready',
        portableUri: '/?mode=Ready&count=4',
        uri: '/counter.terminal?mode=Ready&count=4',
        viewMedium: 'Terminal',
      })
    } finally {
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })

  it('renders Open Graph tags for the current carrier state', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))

    try {
      const html = await readText(
        `${server.localUrl}/counter.react?mode=Ready&count=7`,
      )

      expect(html).toContain(
        '<meta property="og:title" content="Foldkit Counter: 7" />',
      )
      expect(html).toContain(
        `content="Count 7. Increment: ${server.localUrl}/counter.react?mode=Ready&amp;count=7&amp;command=increment. Decrement: ${server.localUrl}/counter.react?mode=Ready&amp;count=7&amp;command=decrement."`,
      )
      expect(html).toContain(
        `<meta property="og:url" content="${server.localUrl}/counter.react?mode=Ready&amp;count=7" />`,
      )
      expect(html).toContain(
        `<meta property="og:image" content="${server.localUrl}/counter-card.png?mode=Ready&amp;count=7&amp;medium=React" />`,
      )
    } finally {
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })

  it('renders a PNG card for a portable Counter state', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))

    try {
      const response = await fetch(
        `${server.localUrl}/counter-card.png?mode=Ready&count=7&medium=Foldkit`,
      )
      const image = Buffer.from(await response.arrayBuffer())

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(
        image
          .subarray(0, 8)
          .equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          ),
      ).toBe(true)
      expect(image.byteLength).toBeGreaterThan(1000)
    } finally {
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })

  it('serves a sample XML tape from the portal domain', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))

    try {
      const response = await fetch(`${server.localUrl}/counter.tape.xml`)
      const xml = await response.text()

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toBe(
        'application/xml; charset=utf-8',
      )
      expect(xml).toContain('<action type="increment" />')
    } finally {
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })

  it('opens the Counter after consuming XML tape from a domain', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))

    try {
      const host = new URL(server.localUrl).host
      const response = await fetch(
        `${server.localUrl}/counter.terminal?mode=Ready&count=3&tapeDomain=${encodeURIComponent(host)}&tapePath=${encodeURIComponent('/counter.tape.xml')}`,
      )
      expect(response.ok).toBe(true)

      const model = await readJson(`${server.localUrl}/model`)
      expect(model).toMatchObject({
        count: '4',
        mode: 'Ready',
        portableUri: '/?mode=Ready&count=4',
        uri: '/counter.terminal?mode=Ready&count=4',
      })
    } finally {
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })

  it('renders a replay page without consuming the tape before the stream opens', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))

    try {
      const tapeUrl = `${server.localUrl}/counter.tape.xml`
      const html = await readText(
        `${server.localUrl}/counter.terminal?mode=Ready&count=0&replayTapeUrl=${encodeURIComponent(tapeUrl)}`,
      )

      expect(html).toContain('<h2>Tape replay</h2>')
      expect(html).toContain('id="tape-scrubber"')
      expect(html).toContain('id="tape-position"')
      expect(html).toContain('id="tape-step-back"')
      expect(html).toContain('id="tape-step-forward"')
      expect(html).toContain('id="save-tape"')
      expect(html).toContain('id="share-tape"')
      expect(html).toContain('id="saved-tape-run"')
      expect(html).toContain(`"tapeUrl":"${tapeUrl}"`)

      const model = await readJson(`${server.localUrl}/model`)
      expect(model).toMatchObject({
        count: '0',
        mode: 'Ready',
      })
    } finally {
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })

  it('streams a visible tape replay and leaves the Counter interactive', async () => {
    const previousStateFilePath = process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
    const stateFilePath = makeStateFilePath()
    process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = stateFilePath

    const server = await Effect.runPromise(makeCounterPortalServer({ port: 0 }))

    try {
      const tapeUrl = `${server.localUrl}/counter.tape.xml`
      const response = await fetch(
        `${server.localUrl}/tape-run-events?medium=Terminal&replayTapeUrl=${encodeURIComponent(tapeUrl)}`,
      )
      const stream = await response.text()

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toBe(
        'text/event-stream; charset=utf-8',
      )
      expect(stream).toContain('"TapeReplayStarted"')
      expect(stream).toContain('"TapeReplayStepStarted"')
      expect(stream).toContain('"label":"action increment"')
      expect(stream).toContain('"TapeReplayStepCompleted"')
      expect(stream).toContain('"count":"1"')
      expect(stream).toContain('"TapeReplayCompleted"')

      const replayed = await readJson(`${server.localUrl}/model`)
      expect(replayed).toMatchObject({
        count: '1',
        mode: 'Ready',
      })

      const incremented = await postCommand(server.localUrl, 'increment')
      expect(incremented).toMatchObject({
        snapshot: {
          count: '2',
          mode: 'Ready',
        },
      })
    } finally {
      await Effect.runPromise(server.shutdown)
      if (previousStateFilePath === undefined) {
        delete process.env[STATE_FILE_ENVIRONMENT_VARIABLE]
      } else {
        process.env[STATE_FILE_ENVIRONMENT_VARIABLE] = previousStateFilePath
      }
    }
  })
})
