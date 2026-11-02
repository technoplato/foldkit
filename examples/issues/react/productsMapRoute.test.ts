import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { type Server, createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { productsMapPath, productsMapRoute } from './productsMapRoute'

type Middleware = (
  request: Parameters<Parameters<typeof createServer>[0] & object>[0],
  response: Parameters<Parameters<typeof createServer>[0] & object>[1],
  next: () => void,
) => void

const serving = (
  mapFile: string,
): Promise<Readonly<{ server: Server; origin: string }>> => {
  const middlewares: Array<Middleware> = []
  const plugin = productsMapRoute(mapFile)
  const configure = plugin.configurePreviewServer
  if (typeof configure !== 'function') {
    throw new Error('Expected a preview hook')
  }
  void Reflect.apply(configure, undefined, [
    {
      middlewares: {
        use: (middleware: Middleware) => middlewares.push(middleware),
      },
    },
  ])
  const server = createServer((request, response) => {
    const [middleware] = middlewares
    middleware?.(request, response, () => {
      response.statusCode = 200
      response.end('the site')
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port =
        typeof address === 'object' && address !== null ? address.port : 0
      resolve({ origin: `http://127.0.0.1:${port.toString()}`, server })
    })
  })
}

describe('the products map on the site’s own server', () => {
  let directory = ''

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'products-map-'))
    await writeFile(join(directory, 'map.json'), '{"products":{}}')
  })

  afterAll(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  it('answers the file, unchanged, on its path alone', async () => {
    const { origin, server } = await serving(join(directory, 'map.json'))
    const answer = await fetch(`${origin}${productsMapPath}`)
    expect(answer.status).toBe(200)
    expect(answer.headers.get('content-type')).toBe('application/json')
    expect(await answer.text()).toBe('{"products":{}}')
    expect(await (await fetch(`${origin}/issues`)).text()).toBe('the site')
    server.close()
  })

  it('answers 404 when no map is there, so the page can say so', async () => {
    const { origin, server } = await serving(join(directory, 'missing.json'))
    expect((await fetch(`${origin}${productsMapPath}`)).status).toBe(404)
    server.close()
  })
})
