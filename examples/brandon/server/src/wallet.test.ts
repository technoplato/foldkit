import { Page, brandonWalletConnectOrigins } from 'brandon-core-example'
import { Array, Effect, Option, Schema as S } from 'effect'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { accountKeyOf, walletOwnerKeyOf } from './account.js'
import {
  handle,
  inlineStyleHashesOf,
  makeOriginHeaders,
  originHeaders,
} from './handler.js'
import type { BrandonStore, SectionRow } from './store.js'
import { signedLogin, testVerifier } from './testAccess.js'

const michael = 'michael@example.com'
const brandon = 'brandon@example.com'
const tyler = 'tyler@example.com'

const walletRow: SectionRow = {
  sectionKey: 'wallet',
  title: 'Your wallet',
  kind: 'Wallet',
  column: 'Main',
  flag: 'wallet',
  position: 5,
  maybeMarkdown: Option.none(),
  maybeLinks: Option.none(),
}

const flagsFor: Readonly<Record<string, ReadonlyArray<string>>> = {
  [accountKeyOf(michael)]: ['party', 'wallets', 'wallet'],
  [accountKeyOf(brandon)]: ['party', 'wallet'],
  [accountKeyOf(tyler)]: ['party'],
}

const store: BrandonStore = {
  account: key =>
    Effect.succeed(
      Option.map(Option.fromNullishOr(flagsFor[key]), flags => ({
        displayName: 'Someone',
        flags,
      })),
    ),
  sections: Effect.succeed([walletRow]),
  wallets: Effect.succeed([]),
}

const request = (
  method: string,
  path: string,
  maybeEmail: Option.Option<string>,
): ReturnType<typeof handle> =>
  handle(
    {
      method,
      path,
      headers: {
        host: 'brandon.example.com',
        ...Option.match(maybeEmail, {
          onNone: () => ({}),
          onSome: email => ({ 'cf-access-jwt-assertion': signedLogin(email) }),
        }),
      },
      remoteAddress: '127.0.0.1',
    },
    {
      verifier: testVerifier,
      store,
      football: Effect.succeed([]),
      loopbackEmail: Option.none(),
    },
  )

const get = (path: string, email: string) =>
  request('GET', path, Option.some(email))

const OwnerAnswer = S.Struct({ ownerKey: S.String })

const ownerKeyFor = async (email: string, path = '/api/wallet/owner') =>
  S.decodeUnknownSync(OwnerAnswer)(
    JSON.parse((await get(path, email)).body.toString()),
  ).ownerKey

const sectionTagsFor = async (email: string) =>
  Array.map(
    S.decodeUnknownSync(Page)(
      JSON.parse((await get('/api/page', email)).body.toString()),
    ).sections,
    section => section._tag,
  )

describe('the wallet section', () => {
  it('reaches only an account with the wallet flag', async () => {
    expect(await sectionTagsFor(michael)).toEqual(['PersonalWalletSection'])
    expect(await sectionTagsFor(brandon)).toEqual(['PersonalWalletSection'])
    expect(await sectionTagsFor(tyler)).toEqual([])
  })
})

describe("a wallet's owner key", () => {
  it('names each signed-in person their own partition, and no one else', async () => {
    const michaelKey = await ownerKeyFor(michael)
    const brandonKey = await ownerKeyFor(brandon)
    expect(michaelKey).toBe(walletOwnerKeyOf(michael))
    expect(brandonKey).toBe(walletOwnerKeyOf(brandon))
    expect(michaelKey).not.toBe(brandonKey)
    expect(
      await ownerKeyFor(brandon, `/api/wallet/owner?email=${michael}`),
    ).toBe(brandonKey)
  })

  it('is refused without the wallet flag or a login', async () => {
    expect((await get('/api/wallet/owner', tyler)).status).toBe(403)
    expect(
      (await request('GET', '/api/wallet/owner', Option.none())).status,
    ).toBe(403)
  })

  it('stays the same across deploys, so a wallet never goes missing', () => {
    expect(walletOwnerKeyOf('Brandon@Example.com ')).toBe(
      walletOwnerKeyOf('brandon@example.com'),
    )
    expect(walletOwnerKeyOf('brandon@example.com')).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    )
    expect(walletOwnerKeyOf('brandon@example.com')).toBe(
      'FV0RdRT4MDm1X3ijUItny8ib4StGguUcUwIzhLjkSM8',
    )
  })
})

describe('what the origin accepts', () => {
  it('takes no request body on any path, so nothing can hand it a key', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const path of ['/api/wallet/owner', '/api/page', '/']) {
        expect((await request(method, path, Option.some(brandon))).status).toBe(
          405,
        )
      }
    }
  })
})

describe('every answer', () => {
  const policyOf = async (path: string, email: string) =>
    Option.getOrElse(
      Option.fromNullishOr(
        originHeaders(await get(path, email))['content-security-policy'],
      ),
      () => '',
    )

  it('runs only scripts from this origin and talks only to its own chains', async () => {
    const policy = await policyOf('/api/page', brandon)
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("base-uri 'none'")
    expect(policy).not.toContain('unsafe-inline')
    expect(policy).not.toContain('unsafe-eval')
    for (const origin of [
      'https://api.devnet.solana.com',
      'wss://api.mainnet-beta.solana.com',
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://eth.blockscout.com',
      ...brandonWalletConnectOrigins,
    ]) {
      expect(policy).toContain(origin)
    }
  })

  it('carries the same policy on a refusal', async () => {
    const refusal = await request('GET', '/api/page', Option.none())
    expect(originHeaders(refusal)['content-security-policy']).toBe(
      await policyOf('/api/page', brandon),
    )
    expect(originHeaders(refusal)['x-content-type-options']).toBe('nosniff')
  })
})

describe("the page's own inline style", () => {
  const css = '[data-site-source]{display:block;margin:0}'
  const page = `<body><header data-site-source data-repo="technoplato/foldkit"><style>${css}</style><a href="https://github.com/technoplato/foldkit">github.com/technoplato/foldkit</a></header><div id="root"></div></body>`
  const answer = {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: Buffer.from(page),
  }

  it('is allowed by its hash, and no other inline style is', () => {
    const hash = `'sha256-${createHash('sha256').update(css).digest('base64')}'`
    const hashes = inlineStyleHashesOf(page)
    expect(hashes).toEqual([hash])
    const policy = makeOriginHeaders(hashes)(answer)['content-security-policy']
    expect(policy).toContain(`style-src 'self' ${hash};`)
    expect(policy).not.toContain('unsafe-inline')
  })

  it('allows no inline style for a page without one', () => {
    expect(inlineStyleHashesOf('<body><div id="root"></div></body>')).toEqual(
      [],
    )
    expect(
      makeOriginHeaders([])(answer)['content-security-policy'],
    ).toContain("style-src 'self';")
  })
})
