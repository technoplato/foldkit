// @vitest-environment node
import { Option } from 'effect'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { UNDERSTANDING_MOVED_TO } from '../moved'
import { type OriginConfig, type OriginRequest, answerRequest } from './origin'

const ALLOWED = 'owner@example.com'
const TOKENS: Readonly<Record<string, string>> = {
  'token-owner': ALLOWED,
  'token-friend': 'friend@example.com',
}

const root = mkdtempSync(join(tmpdir(), 'performance-origin-'))
const lines: Array<string> = []

const config = (): OriginConfig => ({
  siteDirectory: join(root, 'site'),
  dataDirectory: join(root, 'data'),
  allowedEmails: [ALLOWED],
  verifyAccessToken: token =>
    Promise.resolve(
      Option.map(Option.fromNullishOr(TOKENS[token]), email => ({ email })),
    ),
  log: line => {
    lines.push(line)
  },
})

const throughTheTunnel = (
  url: string,
  headers: Readonly<Record<string, string>> = {},
): OriginRequest => ({
  method: 'GET',
  url,
  remoteAddress: '127.0.0.1',
  headers: {
    host: 'performance.knophy.com',
    'x-forwarded-for': '100.102.85.13',
    'cf-ray': '8c0000000000-EWR',
    ...headers,
  },
})

const signedIn = (token: string) => ({ 'cf-access-jwt-assertion': token })

beforeAll(() => {
  mkdirSync(join(root, 'site', 'assets'), { recursive: true })
  mkdirSync(join(root, 'data', 'builds', 'scribe'), { recursive: true })
  writeFileSync(
    join(root, 'site', 'index.html'),
    '<!doctype html><title>Performance</title>',
  )
  writeFileSync(join(root, 'site', 'assets', 'index-abc.js'), 'export {}')
  writeFileSync(join(root, 'data', 'index.json'), '{"schemaVersion":1}')
  writeFileSync(
    join(root, 'data', 'builds', 'scribe', '270.json'),
    '{"build":"270"}',
  )
  writeFileSync(join(root, 'secret.txt'), 'outside the folders')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('who can open the page', () => {
  test('no login through the tunnel gets Not found, for the page and its data', async () => {
    for (const url of [
      '/',
      '/apps/scribe',
      '/data/index.json',
      '/assets/index-abc.js',
    ]) {
      const answer = await answerRequest(config(), throughTheTunnel(url))
      expect(answer.status).toBe(404)
      expect(String(answer.body)).not.toContain('schemaVersion')
    }
    expect(lines.some(line => line.includes('no Access login'))).toBe(true)
  })

  test('a verified login that is not on the allowlist gets Not found too', async () => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel('/data/index.json', signedIn('token-friend')),
    )
    expect(answer.status).toBe(404)
    expect(lines.some(line => line.includes('not on the allowlist'))).toBe(true)
  })

  test('a login that does not verify gets Not found', async () => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel('/', signedIn('forged')),
    )
    expect(answer.status).toBe(404)
  })

  test('the email header alone, without a login, is not trusted', async () => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel('/', { 'cf-access-authenticated-user-email': ALLOWED }),
    )
    expect(answer.status).toBe(404)
  })

  test('his verified login gets the page, its data and its assets', async () => {
    const page = await answerRequest(
      config(),
      throughTheTunnel('/apps/scribe/builds/270', signedIn('token-owner')),
    )
    expect(page.status).toBe(200)
    expect(String(page.body)).toContain('<title>Performance</title>')
    const data = await answerRequest(
      config(),
      throughTheTunnel('/data/builds/scribe/270.json', signedIn('token-owner')),
    )
    expect(data.status).toBe(200)
    expect(data.headers['cache-control']).toBe('no-store')
    expect(data.headers['content-type']).toContain('application/json')
    const asset = await answerRequest(
      config(),
      throughTheTunnel('/assets/index-abc.js', signedIn('token-owner')),
    )
    expect(asset.headers['cache-control']).toContain('immutable')
  })

  test('a request on this Mac to localhost, with no proxy, is let in', async () => {
    const answer = await answerRequest(config(), {
      method: 'GET',
      url: '/data/index.json',
      remoteAddress: '127.0.0.1',
      headers: { host: '127.0.0.1:5262' },
    })
    expect(answer.status).toBe(200)
  })
})

describe('what a signed-in request can read', () => {
  test.each([
    '/data/../secret.txt',
    '/data/%2e%2e/secret.txt',
    '/data/builds/../../secret.txt',
    '/data/INDEX.json',
    '/data/index.js',
    '/../secret.txt',
  ])('%s is Not found', async url => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel(url, signedIn('token-owner')),
    )
    expect(answer.status).toBe(404)
    expect(String(answer.body)).not.toContain('outside the folders')
  })

  test('only GET and HEAD', async () => {
    const answer = await answerRequest(config(), {
      ...throughTheTunnel('/', signedIn('token-owner')),
      method: 'POST',
    })
    expect(answer.status).toBe(404)
  })

  test('every answer asks not to be indexed and sends no referrer', async () => {
    const answer = await answerRequest(config(), throughTheTunnel('/'))
    expect(answer.headers['x-robots-tag']).toContain('noindex')
    expect(answer.headers['referrer-policy']).toBe('no-referrer')
  })
})

describe("the understanding page moved to each user's own page (Scribe #2002)", () => {
  test('its old address sends his login there, and says nothing of the page itself', async () => {
    for (const url of ['/understanding', '/understanding/']) {
      const answer = await answerRequest(
        config(),
        throughTheTunnel(url, signedIn('token-owner')),
      )
      expect(answer.status).toBe(302)
      expect(answer.headers['location']).toBe(UNDERSTANDING_MOVED_TO)
      expect(answer.headers['cache-control']).toBe('no-store')
      expect(String(answer.body)).toBe('')
    }
  })

  test('a request on this Mac to localhost is sent there too', async () => {
    const answer = await answerRequest(config(), {
      method: 'GET',
      url: '/understanding',
      remoteAddress: '127.0.0.1',
      headers: { host: '127.0.0.1:5262' },
    })
    expect(answer.status).toBe(302)
    expect(answer.headers['location']).toBe(UNDERSTANDING_MOVED_TO)
  })

  test('anyone the page does not admit gets the same Not found there as on every other path', async () => {
    for (const headers of [{}, signedIn('token-friend'), signedIn('forged')]) {
      const answer = await answerRequest(
        config(),
        throughTheTunnel('/understanding', headers),
      )
      expect(answer.status).toBe(404)
      expect(answer.headers['location']).toBeUndefined()
    }
  })
})
