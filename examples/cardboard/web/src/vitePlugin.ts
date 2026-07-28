import { Effect } from 'effect'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { type Plugin, type ResolvedConfig } from 'vite'

import { injectCardboardMetaTags } from './meta.js'
import { renderCardboardOgImage } from './ogImage.js'
import {
  portableRouteForOgImageUrl,
  resolveCardboardWebPreview,
} from './preview.js'

const htmlRouteForUrl = (url: URL): string =>
  url.pathname === '/' || url.pathname === '/index.html'
    ? '/0'
    : `${url.pathname}${url.search}`

const isCardboardHtmlRequest = (url: URL): boolean =>
  url.pathname === '/' ||
  url.pathname === '/index.html' ||
  url.pathname === '/0' ||
  url.pathname.startsWith('/0/')

const writeBody = (
  method: string | undefined,
  body: Uint8Array | string,
  response: Readonly<{
    end: (body?: Uint8Array | string) => void
  }>,
): void => {
  if (method === 'HEAD') {
    response.end()
  } else {
    response.end(body)
  }
}

/** Adds dynamic Cardboard metadata and generated PNGs to Vite web hosts. */
export const cardboardWebPreview = (
  config: Readonly<{ deepLinkOrigin: string; pageOrigin: string }>,
): Plugin => {
  const state: { resolvedConfig?: ResolvedConfig } = {}

  return {
    name: 'cardboard-web-preview',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      state.resolvedConfig = resolvedConfig
    },
    async transformIndexHtml(html, context) {
      const requestUrl = new URL(
        context.originalUrl ?? context.path,
        config.pageOrigin,
      )
      const preview = await Effect.runPromise(
        resolveCardboardWebPreview(htmlRouteForUrl(requestUrl), config),
      )
      return injectCardboardMetaTags(html, preview)
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          request.url === undefined ||
          (request.method !== 'GET' && request.method !== 'HEAD')
        ) {
          next()
          return
        }
        const requestUrl = new URL(request.url, config.pageOrigin)
        const portableRoute = portableRouteForOgImageUrl(requestUrl)
        if (portableRoute === undefined) {
          next()
          return
        }

        void Effect.runPromise(
          resolveCardboardWebPreview(portableRoute, config),
        )
          .then(renderCardboardOgImage)
          .then(png => {
            response.statusCode = 200
            response.setHeader('Content-Type', 'image/png')
            response.setHeader(
              'Cache-Control',
              'public, max-age=31536000, immutable',
            )
            response.setHeader('Content-Length', png.byteLength.toString())
            response.setHeader('X-Content-Type-Options', 'nosniff')
            writeBody(request.method, png, response)
          })
          .catch(error => {
            const message =
              error instanceof Error ? error.message : String(error)
            response.statusCode = 404
            response.setHeader('Content-Type', 'text/plain; charset=utf-8')
            writeBody(request.method, message, response)
          })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          request.url === undefined ||
          (request.method !== 'GET' && request.method !== 'HEAD')
        ) {
          next()
          return
        }
        const requestUrl = new URL(request.url, config.pageOrigin)
        const portableRoute = portableRouteForOgImageUrl(requestUrl)

        if (portableRoute !== undefined) {
          void Effect.runPromise(
            resolveCardboardWebPreview(portableRoute, config),
          )
            .then(renderCardboardOgImage)
            .then(png => {
              response.statusCode = 200
              response.setHeader('Content-Type', 'image/png')
              response.setHeader(
                'Cache-Control',
                'public, max-age=31536000, immutable',
              )
              response.setHeader('Content-Length', png.byteLength.toString())
              response.setHeader('X-Content-Type-Options', 'nosniff')
              writeBody(request.method, png, response)
            })
            .catch(error => {
              const message =
                error instanceof Error ? error.message : String(error)
              response.statusCode = 404
              response.setHeader('Content-Type', 'text/plain; charset=utf-8')
              writeBody(request.method, message, response)
            })
          return
        }

        if (!isCardboardHtmlRequest(requestUrl)) {
          next()
          return
        }

        const resolvedConfig = state.resolvedConfig
        if (resolvedConfig === undefined) {
          response.statusCode = 500
          response.end('Vite configuration is unavailable')
          return
        }

        const indexPath = resolve(
          resolvedConfig.root,
          resolvedConfig.build.outDir,
          'index.html',
        )
        void Promise.all([
          readFile(indexPath, 'utf8'),
          Effect.runPromise(
            resolveCardboardWebPreview(htmlRouteForUrl(requestUrl), config),
          ),
        ])
          .then(([html, preview]) => injectCardboardMetaTags(html, preview))
          .then(html => {
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/html; charset=utf-8')
            response.setHeader('Cache-Control', 'no-cache')
            response.setHeader(
              'Content-Length',
              Buffer.byteLength(html).toString(),
            )
            response.setHeader('X-Content-Type-Options', 'nosniff')
            writeBody(request.method, html, response)
          })
          .catch(error => {
            const message =
              error instanceof Error ? error.message : String(error)
            response.statusCode = 404
            response.setHeader('Content-Type', 'text/plain; charset=utf-8')
            writeBody(request.method, message, response)
          })
      })
    },
  }
}
