import { Data, Effect, Result, Scope } from 'effect'
import { type IncomingMessage, type Server, createServer } from 'node:http'

import { logMultipleCountersV3Debug } from '../shared/debugLog.js'
import {
  MultipleCountersV3DebugLoginIssued,
  decodeMultipleCountersV3DebugLoginRequest,
  multipleCountersV3DebugLoginLoopbackPort,
  multipleCountersV3DebugSubjectLabel,
} from '../shared/debugLogin.js'

/** Instant admin auth methods the debug login is allowed to call. */
export type MultipleCountersV3DebugLoginAuth = Readonly<{
  createToken: (input: { email: string }) => Promise<unknown>
  generateMagicCode: (email: string) => Promise<{ code: string }>
}>

/** One HTTP result that never includes Instant admin credentials. */
export type MultipleCountersV3DebugLoginHttpResult = Readonly<{
  body: unknown
  status: number
}>

/** The loopback debug login server could not bind. */
export class MultipleCountersV3DebugLoginServerError extends Data.TaggedError(
  'MultipleCountersV3DebugLoginServerError',
)<Readonly<{ cause: unknown; port: number }>> {}

const jsonHeaders = Object.freeze({
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-origin': '*',
  'content-type': 'application/json; charset=utf-8',
})

const readJsonBody = (request: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    request.on('data', chunk => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    })
    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (cause) {
        reject(cause)
      }
    })
    request.on('error', reject)
  })

/** Resolves one debug login HTTP request without retaining Instant secrets. */
export const handleMultipleCountersV3DebugLoginRequest = async (
  auth: MultipleCountersV3DebugLoginAuth,
  method: string,
  pathname: string,
  body: unknown,
): Promise<MultipleCountersV3DebugLoginHttpResult> => {
  if (method === 'OPTIONS') {
    return { body: {}, status: 204 }
  }
  if (pathname !== '/magic-code') {
    return { body: { error: 'NotFound' }, status: 404 }
  }
  if (method !== 'POST') {
    return { body: { error: 'MethodNotAllowed' }, status: 405 }
  }
  const decoded = decodeMultipleCountersV3DebugLoginRequest(body)
  if (Result.isFailure(decoded)) {
    logMultipleCountersV3Debug('debug-login-rejected', {
      reason: 'UnknownDebugSubject',
    })
    return { body: { error: 'UnknownDebugSubject' }, status: 400 }
  }
  try {
    await auth.createToken({ email: decoded.success.email })
    const { code } = await auth.generateMagicCode(decoded.success.email)
    const label = multipleCountersV3DebugSubjectLabel(decoded.success.email)
    logMultipleCountersV3Debug('debug-login-minted', {
      code,
      email: decoded.success.email,
      label,
    })
    return {
      body: MultipleCountersV3DebugLoginIssued.make({
        code,
        email: decoded.success.email,
        label,
      }),
      status: 200,
    }
  } catch {
    logMultipleCountersV3Debug('debug-login-unavailable', {
      email: decoded.success.email,
    })
    return { body: { error: 'DebugLoginUnavailable' }, status: 503 }
  }
}

const pathnameOf = (url: string | undefined): string => {
  if (url === undefined) {
    return '/'
  }
  return new URL(url, 'http://127.0.0.1').pathname
}

/** True unless the operator explicitly disabled local debug login. */
export const isMultipleCountersV3DebugLoginEnabled = (
  environment: NodeJS.ProcessEnv = process.env,
): boolean => environment['FOLDKIT_INSTANT_DEBUG_LOGIN'] !== '0'

/** Loopback port for the debug login HTTP server. */
export const multipleCountersV3DebugLoginPort = (
  environment: NodeJS.ProcessEnv = process.env,
): number => {
  const raw = environment['FOLDKIT_INSTANT_DEBUG_LOGIN_PORT']
  if (raw === undefined || raw.length === 0) {
    return multipleCountersV3DebugLoginLoopbackPort
  }
  const port = Number.parseInt(raw, 10)
  return Number.isInteger(port) && port > 0
    ? port
    : multipleCountersV3DebugLoginLoopbackPort
}

/** Bind address for the debug login HTTP server. Defaults to loopback. */
export const multipleCountersV3DebugLoginHost = (
  environment: NodeJS.ProcessEnv = process.env,
): string => {
  const host = environment['FOLDKIT_INSTANT_DEBUG_LOGIN_HOST']
  if (host === undefined || host.length === 0) {
    return '127.0.0.1'
  }
  return host
}

/** Serves Alice/Bob magic codes on 127.0.0.1 until the headless scope closes. */
export const runMultipleCountersV3DebugLoginServer = (
  auth: MultipleCountersV3DebugLoginAuth,
  options: Readonly<{ host?: string; port?: number }> = {},
): Effect.Effect<
  never,
  MultipleCountersV3DebugLoginServerError,
  Scope.Scope
> => {
  const host = options.host ?? multipleCountersV3DebugLoginHost()
  const port = options.port ?? multipleCountersV3DebugLoginPort()
  return Effect.acquireRelease(
    Effect.callback<Server, MultipleCountersV3DebugLoginServerError>(resume => {
      const server = createServer((request, response) => {
        void (async () => {
          let body: unknown = {}
          try {
            body = await readJsonBody(request)
          } catch {
            response.writeHead(400, jsonHeaders)
            response.end(JSON.stringify({ error: 'MalformedJson' }))
            return
          }
          const result = await handleMultipleCountersV3DebugLoginRequest(
            auth,
            request.method ?? 'GET',
            pathnameOf(request.url),
            body,
          )
          response.writeHead(result.status, jsonHeaders)
          response.end(JSON.stringify(result.body))
        })()
      })
      server.on('error', cause => {
        resume(
          Effect.fail(
            new MultipleCountersV3DebugLoginServerError({ cause, port }),
          ),
        )
      })
      server.listen(port, host, () => {
        process.stdout.write(
          `Foldkit Instant debug login is minting Alice and Bob codes at http://${host}:${port.toString()}/magic-code.\n`,
        )
        resume(Effect.succeed(server))
      })
    }),
    server =>
      Effect.callback<void>(resume => {
        server.close(() => {
          resume(Effect.void)
        })
      }),
  ).pipe(Effect.flatMap(() => Effect.never))
}
