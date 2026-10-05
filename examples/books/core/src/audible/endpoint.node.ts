import {
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Schema as S,
  Stream,
} from 'effect'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import {
  knophyAccessTeamDomain,
  loopbackMintEmail,
  makeAccessVerifier,
} from '@foldkit/instant'

import {
  type AudibleBridge,
  AudibleLocale,
  bridgeProcessFromEnv,
  processBridge,
} from './bridge.node.js'
import { type LibraryImport, unwiredLibraryImport } from './libraryImport.js'
import { scribeLibraryImport } from './scribeImport.node.js'
import {
  type AudibleRequest,
  type AudibleResponse,
  AudibleServerConfig,
  accessMembers,
  audibleSessions,
  handleAudibleRequest,
} from './server.node.js'
import { audiblePathPrefix } from './service.js'
import {
  type CredentialsVault,
  defaultCredentialsDirectory,
  keychainVault,
  macKeychain,
} from './vault.node.js'

// ENDPOINT

/**
 * How the Books server runs the Audible import. Each part defaults to the
 * live one: the helper `BOOKS_AUDIBLE_BRIDGE` names, the Keychain vault in
 * `~/.config/knophy-host/books/audible`, and the Scribe importer, writing
 * to the Instant app `INSTANT_APP_ID` names with `INSTANT_APP_ADMIN_TOKEN`.
 * Without that token the importer refuses, with a sentence that says why.
 * Logins count when Cloudflare Access signed them, for `teamDomain` and
 * `audiences` the way `hostedIdentity` reads them.
 */
export type AudibleEndpointOptions = Readonly<{
  teamDomain?: string
  audiences?: ReadonlyArray<string>
  locale?: AudibleLocale
  bridge?: Layer.Layer<AudibleBridge>
  vault?: Layer.Layer<CredentialsVault>
  libraryImport?: Layer.Layer<LibraryImport>
  log?: (line: string) => void
}>

const envValue = (name: string): string => process.env[name]?.trim() ?? ''

const maximumBodyBytes = 64 * 1024

const keepAliveMs = 20_000

const statusTooLarge = 413

const statusServerError = 500

const headerRecord = (
  headers: IncomingMessage['headers'],
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      typeof value === 'string' && value !== ''
        ? [[name.toLowerCase(), value]]
        : [],
    ),
  )

const pathOf = (url: string): string =>
  URL.parse(url, 'http://localhost')?.pathname ?? ''

const quietHeaders = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex',
}

class BodyTooLarge extends Error {}

/**
 * The request's body as text, up to 64 KB. A longer one is refused as
 * soon as it passes the limit; the rest is never kept.
 */
const bodyOf = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maximumBodyBytes) {
        chunks.length = 0
        reject(new BodyTooLarge())
      } else {
        chunks.push(chunk)
      }
    })
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    request.on('error', reject)
  })

const writeJson = (
  response: ServerResponse,
  status: number,
  body: string,
): void => {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  for (const [name, value] of Object.entries(quietHeaders)) {
    response.setHeader(name, value)
  }
  response.setHeader('content-length', String(Buffer.byteLength(body)))
  response.end(body)
}

const defaultLibraryImport = (): Layer.Layer<LibraryImport> => {
  const appId = envValue('INSTANT_APP_ID') || envValue('VITE_INSTANT_APP_ID')
  const adminToken = envValue('INSTANT_APP_ADMIN_TOKEN')
  if (appId !== '' && adminToken !== '') {
    return scribeLibraryImport({
      appId,
      adminToken,
      journalDirectory: defaultCredentialsDirectory,
    })
  } else {
    return unwiredLibraryImport
  }
}

const localeOf = (options: AudibleEndpointOptions): AudibleLocale =>
  options.locale ??
  Option.getOrElse(
    S.decodeUnknownOption(AudibleLocale)(envValue('BOOKS_AUDIBLE_LOCALE')),
    () => 'us',
  )

/**
 * The Audible import as connect middleware: `handle` answers every path
 * under `/__books/audible/` and passes any other to `next`, and `close`
 * stops what it runs. {@link audibleImportEndpoint} serves it in Vite.
 *
 * @example
 * ```typescript
 * const audible = makeAudibleImportMiddleware({ bridge: demoBridge, vault: memoryVault })
 * const server = createServer((request, response) => audible.handle(request, response, () => response.end()))
 * ```
 */
export type AudibleImportMiddleware = Readonly<{
  handle: (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => void
  close: () => Promise<void>
}>

/** Builds the middleware behind {@link audibleImportEndpoint}. */
export const makeAudibleImportMiddleware = (
  options: AudibleEndpointOptions = {},
): AudibleImportMiddleware => {
  const verifier = makeAccessVerifier({
    teamDomain:
      options.teamDomain ??
      (envValue('CF_ACCESS_TEAM_DOMAIN') || knophyAccessTeamDomain),
    audiences:
      options.audiences ??
      envValue('CF_ACCESS_AUD')
        .split(',')
        .map(audience => audience.trim())
        .filter(audience => audience !== ''),
  })
  const log =
    options.log ??
    ((line: string) => {
      console.info(`[books] ${line}`)
    })
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      accessMembers({
        verifyAccessToken: verifier.verify,
        loopbackEmail: loopbackMintEmail(),
      }),
      Layer.succeed(AudibleServerConfig, {
        locale: localeOf(options),
        nowMs: Date.now,
        log,
      }),
      audibleSessions,
      options.vault ??
        keychainVault({
          directory: defaultCredentialsDirectory,
          keychain: macKeychain(),
        }),
      options.bridge ?? processBridge(bridgeProcessFromEnv()),
      options.libraryImport ?? defaultLibraryImport(),
    ),
  )

  const streamed = (
    response: ServerResponse,
    frames: Stream.Stream<string>,
  ): void => {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'x-robots-tag': 'noindex',
    })
    response.write(': import\n\n')
    const keepAlive = setInterval(() => {
      if (!response.writableEnded) {
        response.write(': keep-alive\n\n')
      }
    }, keepAliveMs)
    void runtime
      .runPromise(
        Stream.runForEach(frames, frame =>
          Effect.sync(() => {
            if (!response.writableEnded) {
              response.write(frame)
            }
          }),
        ),
      )
      .finally(() => {
        clearInterval(keepAlive)
        response.end()
      })
  }

  const answered = (response: ServerResponse, answer: AudibleResponse) => {
    if (answer._tag === 'Json') {
      writeJson(response, answer.status, answer.body)
    } else {
      streamed(response, answer.frames)
    }
  }

  const handle = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    const path = pathOf(request.url ?? '')
    if (!path.startsWith(audiblePathPrefix)) {
      next()
      return
    }
    void bodyOf(request)
      .then(body => {
        const audibleRequest: AudibleRequest = {
          method: request.method ?? 'GET',
          path,
          headers: headerRecord(request.headers),
          remoteAddress: request.socket.remoteAddress,
          body,
        }
        return runtime.runPromise(handleAudibleRequest(audibleRequest))
      })
      .then(
        maybeAnswer => {
          Option.match(maybeAnswer, {
            onNone: next,
            onSome: answer => {
              answered(response, answer)
            },
          })
        },
        error => {
          if (error instanceof BodyTooLarge) {
            response.setHeader('connection', 'close')
            response.once('finish', () => {
              request.destroy()
            })
            writeJson(response, statusTooLarge, '{}')
          } else {
            writeJson(response, statusServerError, '{}')
          }
        },
      )
  }

  return { handle, close: () => runtime.dispose() }
}

/**
 * Serves the Audible import, in Vite dev and preview, under
 * `/__books/audible/`: `POST start`, `POST finish` with the pasted
 * address, `GET library`, cached ten minutes, and `POST import`, which
 * streams its progress. Each family member's login is their own, keyed by
 * the email their Access login verified, and stays encrypted on this
 * computer. Its paths are outside `/books`, so Cloudflare Access guards
 * them where Access lets anyone reach `/books` for link previews. List it
 * after `hostedIdentity`, so the origin's gate answers first.
 *
 * @example
 * ```typescript
 * plugins: [react(), hostedIdentity({ publicRoutes }), readAloudEndpoint(), audibleImportEndpoint()]
 * ```
 */
export const audibleImportEndpoint = (
  options: AudibleEndpointOptions = {},
): Plugin => {
  const audible = makeAudibleImportMiddleware(options)
  const closeRuntime = (): void => {
    void audible.close()
  }
  return {
    name: 'books-audible-import',
    configureServer(server) {
      server.middlewares.use(audible.handle)
      server.httpServer?.once('close', closeRuntime)
    },
    configurePreviewServer(server) {
      server.middlewares.use(audible.handle)
      server.httpServer.once('close', closeRuntime)
    },
  }
}
