import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { makeAccessVerifier } from './accessVerifier.js'
import { AccessIdentity } from './hostedIdentity.js'

const teamDomain = 'team.cloudflareaccess.com'
const issuer = `https://${teamDomain}`
const audience = 'app-audience-tag'
const memberEmail = 'owner@example.invalid'
const nowMs = 1_800_000_000_000
const inAnHour = nowMs / 1000 + 3600

const algorithm: RsaHashedKeyGenParams = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}

const generateKeys = (): Promise<CryptoKeyPair> =>
  crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])

const segmentOf = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

const tokenSignedBy = async (
  privateKey: CryptoKey,
  kid: string,
  payload: Readonly<Record<string, unknown>>,
  header: Readonly<Record<string, unknown>> = { alg: 'RS256', kid },
): Promise<string> => {
  const signed = `${segmentOf(header)}.${segmentOf(payload)}`
  const signature = await crypto.subtle.sign(
    algorithm,
    privateKey,
    new TextEncoder().encode(signed),
  )
  return `${signed}.${Buffer.from(signature).toString('base64url')}`
}

const certsFor = async (
  entries: ReadonlyArray<Readonly<{ kid: string; publicKey: CryptoKey }>>,
) => ({
  keys: await Promise.all(
    entries.map(async ({ kid, publicKey }) => {
      const jwk = await crypto.subtle.exportKey('jwk', publicKey)
      return { kid, kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }
    }),
  ),
})

const fetchServing =
  (certs: () => Promise<unknown>, requested: Array<string>) =>
  async (url: string): Promise<Response> => {
    requested.push(url)
    return new Response(JSON.stringify(await certs()))
  }

const claims = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  email: memberEmail,
  iss: issuer,
  aud: [audience],
  exp: inAnHour,
  ...overrides,
})

describe('makeAccessVerifier', () => {
  it('accepts a login the team signed, and fetches the keys once', async () => {
    const keys = await generateKeys()
    const requested: Array<string> = []
    const verifier = makeAccessVerifier({
      teamDomain,
      audiences: [],
      fetch: fetchServing(
        () => certsFor([{ kid: 'k1', publicKey: keys.publicKey }]),
        requested,
      ),
      nowMs: () => nowMs,
    })
    const token = await tokenSignedBy(keys.privateKey, 'k1', claims())
    expect(await verifier.verify(token)).toEqual(
      Option.some(AccessIdentity.make({ email: memberEmail })),
    )
    await verifier.verify(token)
    expect(requested).toEqual([`${issuer}/cdn-cgi/access/certs`])
  })

  it('refuses a login signed by anyone else, or not signed at all', async () => {
    const team = await generateKeys()
    const attacker = await generateKeys()
    const verifier = makeAccessVerifier({
      teamDomain,
      audiences: [],
      fetch: fetchServing(
        () => certsFor([{ kid: 'k1', publicKey: team.publicKey }]),
        [],
      ),
      nowMs: () => nowMs,
    })
    const forged = await tokenSignedBy(attacker.privateKey, 'k1', claims())
    const unsigned = `${segmentOf({ alg: 'none', kid: 'k1' })}.${segmentOf(claims())}.`
    expect(await verifier.verify(forged)).toEqual(Option.none())
    expect(await verifier.verify(unsigned)).toEqual(Option.none())
    expect(await verifier.verify('not-a-jwt')).toEqual(Option.none())
  })

  it('refuses another team, an expired login, and another application', async () => {
    const keys = await generateKeys()
    const verifier = makeAccessVerifier({
      teamDomain,
      audiences: [audience],
      fetch: fetchServing(
        () => certsFor([{ kid: 'k1', publicKey: keys.publicKey }]),
        [],
      ),
      nowMs: () => nowMs,
    })
    const signed = (overrides: Readonly<Record<string, unknown>>) =>
      tokenSignedBy(keys.privateKey, 'k1', claims(overrides))
    expect(
      await verifier.verify(
        await signed({ iss: 'https://other.cloudflareaccess.com' }),
      ),
    ).toEqual(Option.none())
    expect(
      await verifier.verify(await signed({ exp: nowMs / 1000 - 1 })),
    ).toEqual(Option.none())
    expect(
      await verifier.verify(await signed({ aud: ['another-app'] })),
    ).toEqual(Option.none())
    expect(await verifier.verify(await signed({ aud: audience }))).toEqual(
      Option.some(AccessIdentity.make({ email: memberEmail })),
    )
  })

  it('fetches the keys again when Cloudflare rotates them, at most once a minute', async () => {
    const before = await generateKeys()
    const after = await generateKeys()
    const requested: Array<string> = []
    const published = { current: [{ kid: 'k1', publicKey: before.publicKey }] }
    const clock = { nowMs }
    const verifier = makeAccessVerifier({
      teamDomain,
      audiences: [],
      fetch: fetchServing(() => certsFor(published.current), requested),
      nowMs: () => clock.nowMs,
    })
    await verifier.verify(
      await tokenSignedBy(before.privateKey, 'k1', claims()),
    )
    published.current = [{ kid: 'k2', publicKey: after.publicKey }]
    const rotated = await tokenSignedBy(after.privateKey, 'k2', claims())
    expect(await verifier.verify(rotated)).toEqual(Option.none())
    expect(requested).toHaveLength(1)
    clock.nowMs = nowMs + 61_000
    expect(await verifier.verify(rotated)).toEqual(
      Option.some(AccessIdentity.make({ email: memberEmail })),
    )
    expect(requested).toHaveLength(2)
  })
})
