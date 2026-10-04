import { Option } from 'effect'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { makeAccessVerifier } from '../../../packages/instant/src/hostedIdentity/accessVerifier'
import { makeIdentityMiddleware } from './vitePlugins'

const teamDomain = 'team.example.cloudflareaccess.com'
const audience = 'aud-words'
const keyId = 'key-1'
const SECONDS_PER_HOUR = 3_600
const signatureAlgorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }

const keyPair = await globalThis.crypto.subtle.generateKey(
  {
    ...signatureAlgorithm,
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
  },
  true,
  ['sign', 'verify'],
)
const publicJwk = await globalThis.crypto.subtle.exportKey(
  'jwk',
  keyPair.publicKey,
)

const base64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64url')

const jsonSegment = (value: unknown): string =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)))

const nowSeconds = (): number => Math.floor(Date.now() / 1000)

const signedLogin = async (
  claims: Readonly<Record<string, unknown>>,
): Promise<string> => {
  const signed = `${jsonSegment({ alg: 'RS256', kid: keyId })}.${jsonSegment({
    email: 'listener@example.invalid',
    iss: `https://${teamDomain}`,
    aud: [audience],
    exp: nowSeconds() + SECONDS_PER_HOUR,
    ...claims,
  })}`
  const signature = await globalThis.crypto.subtle.sign(
    signatureAlgorithm,
    keyPair.privateKey,
    new TextEncoder().encode(signed),
  )
  return `${signed}.${base64Url(new Uint8Array(signature))}`
}

const verifier = makeAccessVerifier({
  teamDomain,
  audiences: [audience],
  fetch: async () =>
    new Response(
      JSON.stringify({
        keys: [{ kid: keyId, kty: 'RSA', n: publicJwk.n, e: publicJwk.e }],
      }),
    ),
})

const noDatabase = { database: () => Option.none() }

type Answer = Readonly<{ status: number; body: unknown }> | 'Passed'

const answerOf = (
  request: Readonly<{
    url: string
    host?: string
    headers?: Readonly<Record<string, string>>
    remoteAddress?: string
  }>,
): Promise<Answer> =>
  new Promise(resolve => {
    const response = {
      statusCode: 0,
      headersSent: false,
      setHeader: () => undefined,
      end: (body: string) =>
        resolve({ status: response.statusCode, body: JSON.parse(body) }),
    }
    makeIdentityMiddleware(verifier, noDatabase)(
      {
        url: request.url,
        method: 'GET',
        headers: { host: request.host ?? 'words.knophy.com', ...request.headers },
        socket: { remoteAddress: request.remoteAddress ?? '127.0.0.1' },
      } as unknown as IncomingMessage,
      response as unknown as ServerResponse,
      () => resolve('Passed'),
    )
  })

const statusOf = async (answer: Promise<Answer>): Promise<number | 'Passed'> => {
  const settled = await answer
  return settled === 'Passed' ? settled : settled.status
}

const UNAUTHORIZED = 401
const NOT_FOUND = 404
const IDENTIFIED_WITHOUT_DATABASE = 503

describe('words identity endpoints', () => {
  afterEach(() => {
    delete process.env['FOLDKIT_HOSTED_IDENTITY_LOOPBACK_EMAIL']
  })

  it('accepts a login Cloudflare Access signed for this application', async () => {
    const login = await signedLogin({})
    expect(
      await statusOf(
        answerOf({
          url: '/__words/access',
          headers: { 'cf-access-jwt-assertion': login },
        }),
      ),
    ).toBe(IDENTIFIED_WITHOUT_DATABASE)
  })

  it('ignores a bare email header that anything reaching the origin can send', async () => {
    expect(
      await statusOf(
        answerOf({
          url: '/__words/access',
          headers: {
            'cf-access-authenticated-user-email': 'listener@example.invalid',
          },
        }),
      ),
    ).toBe(UNAUTHORIZED)
  })

  it('rejects an unsigned, a wrong-audience, a wrong-issuer and an expired login', async () => {
    const [header, payload] = (await signedLogin({})).split('.')
    const logins = [
      `${header}.${payload}.`,
      `${jsonSegment({ alg: 'none', kid: keyId })}.${payload}.`,
      await signedLogin({ aud: ['another-application'] }),
      await signedLogin({ iss: 'https://another.cloudflareaccess.com' }),
      await signedLogin({ exp: nowSeconds() - SECONDS_PER_HOUR }),
    ]
    for (const login of logins) {
      expect(
        await statusOf(
          answerOf({
            url: '/__foldkit/hosted-identity/session',
            headers: { 'cf-access-jwt-assertion': login },
          }),
        ),
      ).toBe(UNAUTHORIZED)
    }
  })

  it('serves nothing under the universal links bypass but the file itself', async () => {
    const tricks = [
      '/.well-known/apple-app-site-association/..%2F..%2F__words%2Faccess',
      '/.well-known/apple-app-site-association%2F..%2Findex.html',
      '/.well-known/apple-app-site-association/anything',
    ]
    for (const url of tricks) {
      expect(await statusOf(answerOf({ url }))).toBe(NOT_FOUND)
    }
    expect(
      await statusOf(answerOf({ url: '/.well-known/apple-app-site-association' })),
    ).toBe('Passed')
  })

  it('keeps the loopback identity for a preview opened on this Mac only', async () => {
    process.env['FOLDKIT_HOSTED_IDENTITY_LOOPBACK_EMAIL'] = 'preview@example.invalid'
    expect(
      await statusOf(answerOf({ url: '/__words/access', host: '127.0.0.1:5232' })),
    ).toBe(IDENTIFIED_WITHOUT_DATABASE)
    expect(
      await statusOf(answerOf({ url: '/__words/access', host: 'words.knophy.com' })),
    ).toBe(UNAUTHORIZED)
    expect(
      await statusOf(
        answerOf({
          url: '/__words/access',
          host: '127.0.0.1:5232',
          remoteAddress: '100.102.85.13',
        }),
      ),
    ).toBe(UNAUTHORIZED)
  })
})
