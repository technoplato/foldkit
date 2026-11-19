import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

type Settings = Readonly<Record<string, unknown>>

type UpdatesPlugin = Readonly<{
  withSignedUpdates: (
    config: Settings,
    from: Readonly<{
      url?: string | undefined
      certificate?: string | undefined
      projectRoot: string
    }>,
  ) => Settings
}>

const plugin: UpdatesPlugin = createRequire(import.meta.url)(
  '../../plugin/signedUpdates.cjs',
)

const app = { name: 'Books', slug: 'books' }

describe('an app that takes newer code over the air, signed', () => {
  it('asks its own server on open, starts at once on the code it has, and takes only code signed for its certificate', () => {
    const settings = plugin.withSignedUpdates(app, {
      url: 'https://updates.example/books/manifest',
      certificate: '/somewhere/keys/certificate.pem',
      projectRoot: '/somewhere/app',
    })

    expect(settings).toEqual({
      ...app,
      runtimeVersion: { policy: 'fingerprint' },
      updates: {
        enabled: true,
        url: 'https://updates.example/books/manifest',
        checkAutomatically: 'ON_LOAD',
        fallbackToCacheTimeout: 0,
        codeSigningCertificate: '../keys/certificate.pem',
        codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
      },
    })
  })

  it('is an app with no updates when whoever builds it names no server', () => {
    expect(
      plugin.withSignedUpdates(app, { projectRoot: '/somewhere/app' }),
    ).toEqual({ ...app, updates: { enabled: false } })
  })

  it('refuses a server without a certificate: code is never taken unsigned', () => {
    expect(() =>
      plugin.withSignedUpdates(app, {
        url: 'https://updates.example/books/manifest',
        projectRoot: '/somewhere/app',
      }),
    ).toThrow(/certificate/)
  })

  it('refuses an address that is not https', () => {
    expect(() =>
      plugin.withSignedUpdates(app, {
        url: 'http://updates.example/books/manifest',
        certificate: '/somewhere/keys/certificate.pem',
        projectRoot: '/somewhere/app',
      }),
    ).toThrow(/https/)
  })
})
