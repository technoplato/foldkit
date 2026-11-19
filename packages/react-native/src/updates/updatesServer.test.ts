import { createVerify, generateKeyPairSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-expect-error The tool is plain JavaScript that runs with no build.
import * as tool from '../../bin/foldkit-expo-updates.mjs'

type Answer = Readonly<{
  status: number
  headers: Readonly<Record<string, string>>
  body: Buffer
}>

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKeyPem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' })

const exported = (bundle: string): string => {
  const from = mkdtempSync(join(tmpdir(), 'foldkit-updates-export-'))
  mkdirSync(join(from, '_expo/static/js/ios'), { recursive: true })
  mkdirSync(join(from, 'assets'), { recursive: true })
  writeFileSync(join(from, '_expo/static/js/ios/entry.hbc'), bundle)
  writeFileSync(join(from, 'assets/abc123'), 'a made-up picture')
  writeFileSync(
    join(from, 'metadata.json'),
    JSON.stringify({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        ios: {
          bundle: '_expo/static/js/ios/entry.hbc',
          assets: [{ path: 'assets/abc123', ext: 'png' }],
        },
      },
    }),
  )
  return from
}

const storeWith = (...bundles: ReadonlyArray<string>): string => {
  const store = mkdtempSync(join(tmpdir(), 'foldkit-updates-store-'))
  bundles.forEach((bundle, index) => {
    tool.publish({
      from: exported(bundle),
      store,
      runtimeVersion: 'books-native-1',
      expoClient: { name: 'Books', slug: 'books' },
      now: new Date(Date.UTC(2026, 10, 19, 16, index)),
    })
  })
  return store
}

const ask = (
  store: string,
  path: string,
  headers: Readonly<Record<string, string>>,
): Answer =>
  tool.answer({
    store,
    privateKeyPem,
    publicUrl: 'https://updates.example/books',
    path,
    headers,
  })

const asking = {
  'expo-platform': 'ios',
  'expo-runtime-version': 'books-native-1',
  'expo-protocol-version': '1',
  'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"',
}

const partsOf = (answer: Answer): ReadonlyArray<string> => {
  const boundary = /boundary=(.+)$/.exec(answer.headers['content-type'] ?? '')
  return answer.body
    .toString('utf8')
    .split(`--${boundary?.[1] ?? ''}`)
    .filter(part => part.includes('Content-Disposition'))
}

const manifestIn = (answer: Answer) => {
  const part = partsOf(answer).find(found => found.includes('name="manifest"'))
  const [head, body] = (part ?? '').split('\r\n\r\n')
  const signature = /expo-signature: sig="([^"]+)", keyid="main"/.exec(
    head ?? '',
  )
  return {
    text: (body ?? '').replace(/\r\n$/, ''),
    signature: signature?.[1] ?? '',
  }
}

describe('a server that hands a phone app its newest code', () => {
  it('answers with the newest update for the app’s runtime, signed with the key only the server holds', () => {
    const answer = ask(
      storeWith('first code', 'newer code'),
      '/manifest',
      asking,
    )
    const manifest = manifestIn(answer)
    const said = JSON.parse(manifest.text)

    expect(answer.status).toBe(200)
    expect(answer.headers['expo-protocol-version']).toBe('1')
    expect(said.runtimeVersion).toBe('books-native-1')
    expect(said.createdAt).toBe('2026-11-19T16:01:00.000Z')
    expect(said.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(said.launchAsset.contentType).toBe('application/javascript')
    expect(said.launchAsset.url).toContain(
      'https://updates.example/books/assets/',
    )
    expect(said.assets).toHaveLength(1)
    expect(said.assets[0].fileExtension).toBe('.png')
    expect(
      createVerify('RSA-SHA256')
        .update(manifest.text)
        .verify(keys.publicKey, manifest.signature, 'base64'),
    ).toBe(true)
  })

  it('serves each file the update names, and nothing outside the store', () => {
    const store = storeWith('the code')
    const said = JSON.parse(manifestIn(ask(store, '/manifest', asking)).text)
    const path = said.launchAsset.url.replace(
      'https://updates.example/books',
      '',
    )

    const file = ask(store, path, {})
    expect(file.status).toBe(200)
    expect(file.body.toString('utf8')).toBe('the code')

    expect(ask(store, '/assets/../../etc/passwd', {}).status).toBe(404)
    expect(ask(store, '/assets/books-native-1/../../x', {}).status).toBe(404)
  })

  it('tells an app that already runs the newest update that there is nothing new, signed too', () => {
    const store = storeWith('the code')
    const said = JSON.parse(manifestIn(ask(store, '/manifest', asking)).text)

    const again = ask(store, '/manifest', {
      ...asking,
      'expo-current-update-id': said.id,
    })
    const part = partsOf(again).find(found =>
      found.includes('name="directive"'),
    )

    expect(again.status).toBe(200)
    expect(part).toContain('"type":"noUpdateAvailable"')
    expect(part).toContain('expo-signature: sig="')
  })

  it('has nothing for another runtime: code built for one native app is never handed to another', () => {
    const answer = ask(storeWith('the code'), '/manifest', {
      ...asking,
      'expo-runtime-version': 'books-native-2',
    })
    expect(answer.status).toBe(404)
  })

  it('answers a health check without naming anything it holds', () => {
    const answer = ask(storeWith('the code'), '/health', {})
    expect(answer.status).toBe(200)
    expect(answer.body.toString('utf8')).toBe('ok\n')
  })
})
