import { Effect } from 'effect'
import { type Server, createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { demoBridge } from './demo.node.js'
import { makeAudibleImportMiddleware } from './endpoint.node.js'
import { makeTestLibraryImport } from './libraryImport.js'
import { memoryVault } from './vault.node.js'

const closers: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map(close => close()))
})

const serve = async () => {
  const logs: Array<string> = []
  const importer = await Effect.runPromise(
    makeTestLibraryImport({ inLibrary: [] }),
  )
  const audible = makeAudibleImportMiddleware({
    teamDomain: 'made-up-team.cloudflareaccess.com',
    audiences: ['made-up-audience'],
    bridge: demoBridge,
    vault: memoryVault,
    libraryImport: importer.layer,
    log: line => {
      logs.push(line)
    },
  })
  const server: Server = createServer((request, response) => {
    audible.handle(request, response, () => {
      response.statusCode = 404
      response.end('not the import')
    })
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port =
    typeof address === 'object' && address !== null ? address.port : 0
  closers.push(async () => {
    await new Promise(resolve => server.close(resolve))
    await audible.close()
  })
  return { origin: `http://127.0.0.1:${port.toString()}`, logs }
}

const landingOf = async (origin: string): Promise<string> => {
  const started = await fetch(`${origin}/__books/audible/start`, {
    method: 'POST',
  })
  const { loginUrl } = await started.json()
  return `${origin}${loginUrl}?openid.mode=id_res&openid.oa2.authorization_code=books-demo-endpoint-test`
}

describe('the Audible import endpoint', () => {
  it('answers this computer’s own requests as its loopback member, privately', async () => {
    const { origin } = await serve()
    const response = await fetch(`${origin}/__books/audible/library`)
    expect(response.status).toBe(409)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(await response.json()).toEqual({ problem: { _tag: 'NotConnected' } })
  })

  it('refuses a request that came through a proxy without an Access login', async () => {
    const { origin, logs } = await serve()
    const response = await fetch(`${origin}/__books/audible/start`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ problem: { _tag: 'NotSignedIn' } })
    expect(logs).toEqual(['audible: refused a request with no Access login'])
  })

  it('leaves other paths to the next handler and refuses an oversized body', async () => {
    const { origin } = await serve()
    expect((await fetch(`${origin}/books`)).status).toBe(404)
    const oversized = await fetch(`${origin}/__books/audible/finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirectUrl: 'x'.repeat(70 * 1024) }),
    })
    expect(oversized.status).toBe(413)
  })

  it('connects with the pasted address, then streams an import as Server-Sent Events', async () => {
    const { origin, logs } = await serve()
    const finished = await fetch(`${origin}/__books/audible/finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirectUrl: await landingOf(origin) }),
    })
    expect(finished.status).toBe(200)
    const listed = await fetch(`${origin}/__books/audible/library`)
    expect(listed.status).toBe(200)
    const { titles } = await listed.json()
    expect(titles).toHaveLength(11)
    const imported = await fetch(`${origin}/__books/audible/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ asins: ['B0DEMO0001', 'B0DEMO0009'] }),
    })
    expect(imported.headers.get('content-type')).toBe(
      'text/event-stream; charset=utf-8',
    )
    expect(imported.headers.get('cache-control')).toBe('no-store, no-transform')
    const body = await imported.text()
    expect(body.startsWith(': import\n\n')).toBe(true)
    expect(body).toContain('event: import\ndata: {"_tag":"ImportFinished"')
    expect(
      Array.from(body.matchAll(/"stage":"ReadingChapters"/g)),
    ).toHaveLength(3)
    expect(logs.join('\n')).not.toContain('books-demo-')
    expect(logs.join('\n')).not.toContain('loopback@')
  })
})
