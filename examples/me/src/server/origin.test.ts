// @vitest-environment node
import { Option } from 'effect'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  type OriginConfig,
  type OriginRequest,
  answerRequest,
  userFolderName,
} from './origin'

const OWNER = 'owner@example.com'
const FRIEND = 'friend@example.com'
const OWNER_FOLDER =
  'c8cd3c6427301eaf6665bccacd65ddb614527acc843a15463e3faba57124c351'
const OWNER_ONLY = 'an area only the owner has'
const SOURCE_HEADER =
  '<header data-site-source data-repo="technoplato/foldkit" data-ref="main" data-folder="examples/me"><a href="https://github.com/technoplato/foldkit/tree/main/examples/me/src">github.com/technoplato/foldkit/tree/main/examples/me/src</a></header>'

const TOKENS: Readonly<Record<string, string>> = {
  'token-owner': OWNER,
  'token-owner-capitals': 'Owner@Example.COM',
  'token-friend': FRIEND,
}

const root = mkdtempSync(join(tmpdir(), 'me-origin-'))
const lines: Array<string> = []

const config = (): OriginConfig => ({
  siteDirectory: join(root, 'site'),
  usersDirectory: join(root, 'users'),
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
    host: 'me.knophy.com',
    'x-forwarded-for': '100.102.85.13',
    'cf-ray': '8c0000000000-EWR',
    ...headers,
  },
})

const signedIn = (token: string) => ({ 'cf-access-jwt-assertion': token })

const bodyOf = (answer: { body: Uint8Array | string }): string =>
  typeof answer.body === 'string'
    ? answer.body
    : Buffer.from(answer.body).toString('utf8')

const jsonOf = (answer: { body: Uint8Array | string }): unknown =>
  JSON.parse(bodyOf(answer))

beforeAll(() => {
  mkdirSync(join(root, 'site', 'assets'), { recursive: true })
  mkdirSync(join(root, 'users', OWNER_FOLDER), { recursive: true })
  writeFileSync(
    join(root, 'site', 'index.html'),
    `<!doctype html><title>Your page</title><body>${SOURCE_HEADER}<div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body>`,
  )
  writeFileSync(join(root, 'site', 'assets', 'index-abc.js'), 'export {}')
  writeFileSync(
    join(root, 'users', OWNER_FOLDER, 'understanding.json'),
    JSON.stringify({ schemaVersion: 1, list: [{ name: OWNER_ONLY }] }),
  )
  writeFileSync(
    join(root, 'users', OWNER_FOLDER, 'me.json'),
    JSON.stringify({ schemaVersion: 1, email: 'someone-else@example.com' }),
  )
  writeFileSync(join(root, 'secret.txt'), 'outside the folders')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('a user is the verified Access login, and nothing else', () => {
  test('a user folder is the SHA-256 of the lowercased email, the same as the exporter writes', () => {
    expect(userFolderName(OWNER)).toBe(OWNER_FOLDER)
    expect(userFolderName(' Owner@Example.COM ')).toBe(OWNER_FOLDER)
  })

  test('no login through the tunnel gets Not found, for the page, its data and its assets', async () => {
    for (const url of [
      '/',
      '/understanding',
      '/data/me.json',
      '/data/understanding.json',
      '/assets/index-abc.js',
    ]) {
      const answer = await answerRequest(config(), throughTheTunnel(url))
      expect(answer.status).toBe(404)
      expect(bodyOf(answer)).not.toContain(OWNER_ONLY)
      expect(bodyOf(answer)).not.toContain(OWNER)
    }
    expect(lines.some(line => line.includes('no Access login'))).toBe(true)
  })

  test('a request on this Mac with no login gets Not found too: no one is let in without a login', async () => {
    const answer = await answerRequest(config(), {
      method: 'GET',
      url: '/data/understanding.json',
      remoteAddress: '127.0.0.1',
      headers: { host: '127.0.0.1:5263' },
    })
    expect(answer.status).toBe(404)
  })

  test('a login that does not verify gets Not found', async () => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel('/data/me.json', signedIn('forged')),
    )
    expect(answer.status).toBe(404)
    expect(lines.some(line => line.includes('did not verify'))).toBe(true)
  })

  test('the email header alone, without a login, is not trusted', async () => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel('/data/understanding.json', {
        'cf-access-authenticated-user-email': OWNER,
      }),
    )
    expect(answer.status).toBe(404)
  })

  test('a verifier that fails is a refusal, never a way in', async () => {
    const answer = await answerRequest(
      {
        ...config(),
        verifyAccessToken: () => Promise.reject(new Error('certs offline')),
      },
      throughTheTunnel('/data/me.json', signedIn('token-owner')),
    )
    expect(answer.status).toBe(404)
  })
})

describe('each signed-in user reads only their own folder', () => {
  test('his verified login reads who he is and his own understanding', async () => {
    const me = await answerRequest(
      config(),
      throughTheTunnel('/data/me.json', signedIn('token-owner')),
    )
    expect(me.status).toBe(200)
    expect(jsonOf(me)).toStrictEqual({
      schemaVersion: 1,
      email: OWNER,
      files: ['understanding'],
    })
    const understanding = await answerRequest(
      config(),
      throughTheTunnel('/data/understanding.json', signedIn('token-owner')),
    )
    expect(understanding.status).toBe(200)
    expect(bodyOf(understanding)).toContain(OWNER_ONLY)
  })

  test('the same login with capitals in its email is the same user', async () => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel(
        '/data/understanding.json',
        signedIn('token-owner-capitals'),
      ),
    )
    expect(answer.status).toBe(200)
    expect(bodyOf(answer)).toContain(OWNER_ONLY)
  })

  test('a second signed-in user sees their own page, and nothing of his', async () => {
    const me = await answerRequest(
      config(),
      throughTheTunnel('/data/me.json', signedIn('token-friend')),
    )
    expect(me.status).toBe(200)
    expect(jsonOf(me)).toStrictEqual({
      schemaVersion: 1,
      email: FRIEND,
      files: [],
    })
    expect(bodyOf(me)).not.toContain(OWNER)
    const page = await answerRequest(
      config(),
      throughTheTunnel('/understanding', signedIn('token-friend')),
    )
    expect(page.status).toBe(200)
    expect(bodyOf(page)).toContain('<title>Your page</title>')
    const understanding = await answerRequest(
      config(),
      throughTheTunnel('/data/understanding.json', signedIn('token-friend')),
    )
    expect(understanding.status).toBe(404)
    expect(bodyOf(understanding)).not.toContain(OWNER_ONLY)
  })

  test.each([
    `/data/${OWNER_FOLDER}/understanding.json`,
    `/data/../users/${OWNER_FOLDER}/understanding.json`,
    `/data/%2e%2e/${OWNER_FOLDER}/understanding.json`,
    `/users/${OWNER_FOLDER}/understanding.json`,
    `/data/understanding.json?email=${OWNER}`,
  ])('a second user cannot reach his folder by naming it: %s', async url => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel(url, signedIn('token-friend')),
    )
    expect(answer.status).toBe(404)
    expect(bodyOf(answer)).not.toContain(OWNER_ONLY)
  })

  test('a second user who names him in a header or a cookie is still only themselves', async () => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel('/data/me.json', {
        ...signedIn('token-friend'),
        'cf-access-authenticated-user-email': OWNER,
        'x-forwarded-email': OWNER,
        cookie: `email=${OWNER}; user=${OWNER_FOLDER}`,
      }),
    )
    expect(jsonOf(answer)).toStrictEqual({
      schemaVersion: 1,
      email: FRIEND,
      files: [],
    })
  })

  test('who is signed in is the origin’s own answer, never a file of that name', async () => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel('/data/me.json', signedIn('token-owner')),
    )
    expect(bodyOf(answer)).not.toContain('someone-else@example.com')
  })
})

describe("this Mac's header sweep reads where the page's code lives, and nothing else (Scribe #1547)", () => {
  const onThisMac = (url: string): OriginRequest => ({
    method: 'GET',
    url,
    remoteAddress: '127.0.0.1',
    headers: { host: '127.0.0.1:5263' },
  })

  test('/source on this Mac is the built page’s source header alone', async () => {
    const answer = await answerRequest(config(), onThisMac('/source'))
    expect(answer.status).toBe(200)
    expect(bodyOf(answer)).toBe(SOURCE_HEADER)
    expect(answer.headers['cache-control']).toBe('no-store')
  })

  test('the page, its data and its assets on this Mac still need a login', async () => {
    for (const url of [
      '/',
      '/understanding',
      '/data/me.json',
      '/assets/index-abc.js',
    ]) {
      const answer = await answerRequest(config(), onThisMac(url))
      expect(answer.status).toBe(404)
    }
  })

  test('/source through the tunnel, or asked for by a public name, is the same Not found as every path', async () => {
    for (const request of [
      throughTheTunnel('/source'),
      { ...onThisMac('/source'), headers: { host: 'me.knophy.com' } },
    ]) {
      const answer = await answerRequest(config(), request)
      expect(answer.status).toBe(404)
      expect(bodyOf(answer)).not.toContain('data-site-source')
    }
  })
})

describe('what a signed-in request can read', () => {
  test.each([
    '/data/../secret.txt',
    '/data/%2e%2e/secret.txt',
    '/data/UNDERSTANDING.json',
    '/data/understanding.js',
    '/data/sub/understanding.json',
    '/../secret.txt',
  ])('%s is Not found', async url => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel(url, signedIn('token-owner')),
    )
    expect(answer.status).toBe(404)
    expect(bodyOf(answer)).not.toContain('outside the folders')
  })

  test('only GET and HEAD', async () => {
    const answer = await answerRequest(config(), {
      ...throughTheTunnel('/data/me.json', signedIn('token-owner')),
      method: 'POST',
    })
    expect(answer.status).toBe(404)
  })

  test('a user’s answers are never kept by a cache', async () => {
    for (const url of ['/', '/data/me.json', '/data/understanding.json']) {
      const answer = await answerRequest(
        config(),
        throughTheTunnel(url, signedIn('token-owner')),
      )
      expect(answer.status).toBe(200)
      expect(answer.headers['cache-control']).toBe('private, no-store')
    }
  })

  test('the built assets are the same for everyone and may be kept', async () => {
    const answer = await answerRequest(
      config(),
      throughTheTunnel('/assets/index-abc.js', signedIn('token-friend')),
    )
    expect(answer.status).toBe(200)
    expect(answer.headers['cache-control']).toContain('immutable')
  })

  test('every answer asks not to be indexed, sends no referrer and cannot be framed', async () => {
    const answer = await answerRequest(config(), throughTheTunnel('/'))
    expect(answer.headers['x-robots-tag']).toContain('noindex')
    expect(answer.headers['referrer-policy']).toBe('no-referrer')
    expect(answer.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    )
  })
})
