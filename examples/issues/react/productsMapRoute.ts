import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/** Where the site's page asks for what each product's code says. */
export const productsMapPath = '/__foldkit/products-map'

const defaultMapFile = (): string =>
  process.env['ISSUES_PRODUCTS_MAP_FILE'] ??
  join(homedir(), 'Scribe', 'products-map.json')

const answerMap = async (
  mapFile: string,
  response: ServerResponse,
): Promise<void> => {
  try {
    const body = await readFile(mapFile)
    response.statusCode = 200
    response.setHeader('content-type', 'application/json')
    response.setHeader('cache-control', 'no-store')
    response.end(body)
  } catch {
    response.statusCode = 404
    response.end()
  }
}

const isMapRequest = (request: IncomingMessage): boolean =>
  request.method === 'GET' && request.url === productsMapPath

/**
 * Serves `products-map.json` to the site's own page, in Vite dev and preview:
 * `scripts/schema/products-map.mjs` prints each product's surfaces and modules
 * from git to `~/Scribe/products-map.json`, graph-sync.sh keeps it current, and
 * no one types it or stores it in Instant. A file that is not there answers
 * 404, and the product's page says so. Read once per page, and the name is
 * behind Access like the rest of the site.
 */
export const productsMapRoute = (
  mapFile: string = defaultMapFile(),
): Plugin => ({
  name: 'issues-products-map',
  configurePreviewServer: server => {
    server.middlewares.use((request, response, next) => {
      if (isMapRequest(request)) {
        void answerMap(mapFile, response)
      } else {
        next()
      }
    })
  },
  configureServer: server => {
    server.middlewares.use((request, response, next) => {
      if (isMapRequest(request)) {
        void answerMap(mapFile, response)
      } else {
        next()
      }
    })
  },
})
