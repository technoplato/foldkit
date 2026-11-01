import { Effect, Option } from 'effect'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { knophyAccessTeamDomain, makeAccessVerifier } from '@foldkit/instant'

import { makeBrandonAdmin } from './adminStore.js'
import { brandonEnv, listOf, maybeEnv } from './env.js'
import { makeFootball } from './football.js'
import { handle, originHeaders } from './handler.js'

// ORIGIN

const here = dirname(fileURLToPath(import.meta.url))
const defaultPort = 5260
const mirrorEveryMs = 5 * 60 * 1000

const admin = makeBrandonAdmin(brandonEnv())

const dependencies = {
  verifier: makeAccessVerifier({
    teamDomain: Option.getOrElse(
      maybeEnv('CF_ACCESS_TEAM_DOMAIN'),
      () => knophyAccessTeamDomain,
    ),
    audiences: listOf(process.env['CF_ACCESS_AUD']),
  }),
  store: admin,
  football: makeFootball({
    fetch: globalThis.fetch,
    pinnedTeams: listOf(process.env['BRANDON_PINNED_TEAMS']),
  }),
  loopbackEmail: maybeEnv('BRANDON_LOOPBACK_EMAIL'),
  staticRoot: Option.getOrElse(maybeEnv('BRANDON_STATIC_ROOT'), () =>
    join(here, '../../foldkit/dist'),
  ),
}

const lowercaseHeaders = (
  headers: NodeJS.Dict<string | ReadonlyArray<string>>,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name.toLowerCase(), value]] : [],
    ),
  )

const server = createServer((request, response) => {
  void handle(
    {
      method: request.method ?? 'GET',
      path: request.url ?? '/',
      headers: lowercaseHeaders(request.headers),
      remoteAddress: request.socket.remoteAddress,
    },
    dependencies,
  ).then(
    answer => {
      response.writeHead(answer.status, originHeaders(answer))
      response.end(answer.body)
    },
    (error: unknown) => {
      console.error('origin failed:', error)
      response.writeHead(500)
      response.end()
    },
  )
})

const port = Number(process.env['PORT'] ?? defaultPort)

server.listen(port, '127.0.0.1', () => {
  console.log(`brandon origin on 127.0.0.1:${port.toString()}`)
})

const mirror = (): void => {
  Effect.runFork(
    admin.mirrorWallets(globalThis.fetch).pipe(
      Effect.catch(error =>
        Effect.sync(() => {
          console.error('wallet mirror failed:', error.message)
        }),
      ),
    ),
  )
}

mirror()
setInterval(mirror, mirrorEveryMs)
