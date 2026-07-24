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
        uri: '/?mode=Ready&count=0',
      })

      const incremented = await postCommand(server.localUrl, 'increment')
      expect(incremented).toMatchObject({
        command: 'Increment',
        snapshot: {
          count: '1',
          mode: 'Ready',
          uri: '/?mode=Ready&count=1',
        },
      })

      const decremented = await postCommand(server.localUrl, '-')
      expect(decremented).toMatchObject({
        command: 'Decrement',
        snapshot: {
          count: '0',
          mode: 'Ready',
          uri: '/?mode=Ready&count=0',
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
})
