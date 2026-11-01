import { Page } from 'brandon-core-example'
import { Effect, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { accountKeyOf } from './account.js'
import { handle } from './handler.js'
import type { BrandonStore, SectionRow } from './store.js'
import {
  expiredLogin,
  forgedLogin,
  otherAppLogin,
  signedLogin,
  testVerifier,
} from './testAccess.js'

const section = (
  sectionKey: string,
  flag: string,
  markdown: string,
): SectionRow => ({
  sectionKey,
  title: sectionKey,
  kind: 'Markdown',
  column: 'Main',
  flag,
  position: 1,
  maybeMarkdown: Option.some(markdown),
  maybeLinks: Option.none(),
})

const michael = 'michael@example.com'
const brandon = 'brandon@example.com'
const tyler = 'tyler@example.com'

const store: BrandonStore = {
  account: key => {
    if (key === accountKeyOf(michael)) {
      return Effect.succeed(
        Option.some({ displayName: 'Michael', flags: ['party', 'wallets'] }),
      )
    } else if (key === accountKeyOf(brandon)) {
      return Effect.succeed(
        Option.some({ displayName: 'Brandon', flags: ['party'] }),
      )
    } else if (key === 'default') {
      return Effect.succeed(
        Option.some({ displayName: 'Guest', flags: ['guests'] }),
      )
    } else {
      return Effect.succeed(Option.none())
    }
  },
  sections: Effect.succeed([
    section('the-riddle', 'party', 'The eggplant words.'),
    section('michaels-money', 'wallets', 'Michael-only words.'),
    section('for-guests', 'guests', 'Guest words.'),
  ]),
  wallets: Effect.succeed([]),
}

const dependencies = {
  verifier: testVerifier,
  store,
  football: Effect.succeed([]),
  loopbackEmail: Option.none(),
}

const get = (
  path: string,
  headers: Readonly<Record<string, string>> = {},
): ReturnType<typeof handle> =>
  handle(
    {
      method: 'GET',
      path,
      headers: { host: 'brandon.example.com', ...headers },
      remoteAddress: '127.0.0.1',
    },
    dependencies,
  )

const assertion = (token: string) => ({ 'cf-access-jwt-assertion': token })

const pageFor = async (token: string): Promise<Page> =>
  S.decodeUnknownSync(Page)(
    JSON.parse((await get('/api/page', assertion(token))).body.toString()),
  )

describe('who may read', () => {
  it('answers health with no login', async () => {
    expect((await get('/health')).status).toBe(200)
  })

  it('refuses every read with no login', async () => {
    expect((await get('/api/page')).status).toBe(403)
    expect((await get('/')).status).toBe(403)
    expect((await get('/assets/app.js')).status).toBe(403)
  })

  it('never trusts the email header alone', async () => {
    const response = await get('/api/page', {
      'cf-access-authenticated-user-email': michael,
    })
    expect(response.status).toBe(403)
  })

  it('refuses a forged login, an expired one, and another app’s', async () => {
    for (const token of [
      forgedLogin(michael),
      expiredLogin(michael),
      otherAppLogin(michael),
      'not.a.token',
    ]) {
      const response = await get('/api/page', assertion(token))
      expect(response.status).toBe(403)
      expect(response.body.toString()).not.toContain('words')
    }
  })

  it('takes a login from the assertion header only, never a cookie', async () => {
    const response = await get('/api/page', {
      cookie: `CF_Authorization=${signedLogin(michael)}`,
    })
    expect(response.status).toBe(403)
  })

  it('names the loopback account only for a local request', async () => {
    const local = (host: string, extra: Readonly<Record<string, string>>) =>
      handle(
        {
          method: 'GET',
          path: '/api/page',
          headers: { host, ...extra },
          remoteAddress: '127.0.0.1',
        },
        { ...dependencies, loopbackEmail: Option.some(brandon) },
      )
    expect((await local('localhost:5260', {})).status).toBe(200)
    expect(
      (await local('brandon.pisspoursoftware.xyz', { 'cf-ray': 'abc' })).status,
    ).toBe(403)
  })
})

describe('what each person gets', () => {
  it('sends a section only to an account with its flag', async () => {
    const page = await pageFor(signedLogin(brandon))
    expect(page.displayName).toBe('Brandon')
    expect(page.sections.map(({ key }) => key)).toEqual(['the-riddle'])
  })

  it('leaves the words of a flag that is off out of the response', async () => {
    const response = await get('/api/page', assertion(signedLogin(brandon)))
    expect(response.body.toString()).toContain('eggplant')
    expect(response.body.toString()).not.toContain('Michael-only')
  })

  it('gives everything flagged on to the owner', async () => {
    const page = await pageFor(signedLogin(michael))
    expect(page.sections.map(({ key }) => key)).toEqual([
      'the-riddle',
      'michaels-money',
    ])
  })

  it('finds an account whatever the case of the address', async () => {
    const page = await pageFor(signedLogin('Brandon@Example.COM'))
    expect(page.displayName).toBe('Brandon')
  })

  it('gives anyone without a row the default account', async () => {
    const page = await pageFor(signedLogin(tyler))
    expect(page.displayName).toBe('Guest')
    expect(page.sections.map(({ key }) => key)).toEqual(['for-guests'])
  })

  it('never stores or returns an address', async () => {
    expect(accountKeyOf(brandon)).toMatch(/^[0-9a-f]{64}$/)
    const response = await get('/api/page', assertion(signedLogin(brandon)))
    expect(response.body.toString()).not.toContain(brandon)
  })

  it('refuses the wallets to a flag that is off', async () => {
    const off = await get('/api/wallets', assertion(signedLogin(brandon)))
    const on = await get('/api/wallets', assertion(signedLogin(michael)))
    expect(off.status).toBe(403)
    expect(on.status).toBe(200)
  })
})

describe('files', () => {
  const headers = assertion(signedLogin(brandon))

  it('serves no dotted path and nothing outside the build', async () => {
    expect((await get('/.git/config', headers)).status).toBe(404)
    expect((await get('/../package.json', headers)).status).toBe(404)
    expect((await get('/%2e%2e/package.json', headers)).status).toBe(404)
    expect((await get('/assets/..%2f..%2fpackage.json', headers)).status).toBe(
      404,
    )
  })
})
