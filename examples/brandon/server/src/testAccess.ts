import { createSign, generateKeyPairSync } from 'node:crypto'

import { type AccessVerifier, makeAccessVerifier } from '@foldkit/instant'

const teamDomain = 'team.example.cloudflareaccess.com'
const kid = 'test-key'

const base64Url = (value: string | Buffer): string =>
  Buffer.from(value).toString('base64url')

const keys = () => generateKeyPairSync('rsa', { modulusLength: 2048 })

const real = keys()
const forger = keys()

const sign = (
  privateKey: ReturnType<typeof keys>['privateKey'],
  claims: Readonly<Record<string, unknown>>,
): string => {
  const header = base64Url(JSON.stringify({ alg: 'RS256', kid }))
  const payload = base64Url(JSON.stringify(claims))
  const signed = `${header}.${payload}`
  const signature = createSign('RSA-SHA256')
    .update(signed)
    .sign(privateKey)
    .toString('base64url')
  return `${signed}.${signature}`
}

const oneHourMs = 60 * 60 * 1000

const claimsFor = (email: string) => ({
  email,
  exp: (Date.now() + oneHourMs) / 1000,
  iss: `https://${teamDomain}`,
  aud: ['the-brandon-app'],
})

/** A login Cloudflare's key signed. */
export const signedLogin = (email: string): string =>
  sign(real.privateKey, claimsFor(email))

/** A login some other key signed. */
export const forgedLogin = (email: string): string =>
  sign(forger.privateKey, claimsFor(email))

/** A login that ran out an hour ago. */
export const expiredLogin = (email: string): string =>
  sign(real.privateKey, {
    ...claimsFor(email),
    exp: (Date.now() - oneHourMs) / 1000,
  })

/** A login for another Access application. */
export const otherAppLogin = (email: string): string =>
  sign(real.privateKey, { ...claimsFor(email), aud: ['another-app'] })

/** A verifier that trusts only `real`, as Cloudflare's certs would. */
export const testVerifier: AccessVerifier = makeAccessVerifier({
  teamDomain,
  audiences: ['the-brandon-app'],
  fetch: async () =>
    new Response(
      JSON.stringify({
        keys: [{ ...real.publicKey.export({ format: 'jwk' }), kid }],
      }),
    ),
})
