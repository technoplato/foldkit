import { Array, String, pipe } from 'effect'
import { createServer } from 'node:http'

import { knophyAccessTeamDomain, makeAccessVerifier } from '@foldkit/instant'

import { makeOriginHandler } from './origin'

// CONSTANT

const DEFAULT_PORT = 5263
const HOST = '127.0.0.1'

/**
 * The build's provenance (scripts/change-log/build_provenance.py), which the
 * deploy embeds with esbuild's `--define`: the commit, branch, whether the
 * tree was clean, when and where it was built.
 */
declare const ME_BUILD_PROVENANCE: string | undefined

const provenance =
  typeof ME_BUILD_PROVENANCE === 'string'
    ? ME_BUILD_PROVENANCE
    : 'none embedded (a development run)'

// MAIN

const env = (name: string): string => process.env[name] ?? ''

const listOf = (value: string): ReadonlyArray<string> =>
  pipe(
    String.split(value, ','),
    Array.map(item => String.toLowerCase(String.trim(item))),
    Array.filter(String.isNonEmpty),
  )

const audiences = listOf(env('CF_ACCESS_AUD'))
const siteDirectory = env('ME_SITE_DIR')
const usersDirectory = env('ME_USERS_DIR')

const required: ReadonlyArray<readonly [string, boolean]> = [
  ['CF_ACCESS_AUD', Array.isReadonlyArrayNonEmpty(audiences)],
  ['ME_SITE_DIR', siteDirectory !== ''],
  ['ME_USERS_DIR', usersDirectory !== ''],
]

const missing = Array.filter(required, ([, isSet]) => !isSet)

if (Array.isReadonlyArrayNonEmpty(missing)) {
  console.error(
    `me origin: refusing to start without ${missing.map(([name]) => name).join(', ')}`,
  )
  process.exit(1)
}

const verifier = makeAccessVerifier({
  teamDomain: env('CF_ACCESS_TEAM_DOMAIN') || knophyAccessTeamDomain,
  audiences,
})

const port = Number(env('PORT')) || DEFAULT_PORT

createServer(
  makeOriginHandler({
    siteDirectory,
    usersDirectory,
    verifyAccessToken: verifier.verify,
    log: line => console.log(`${new Date().toISOString()} ${line}`),
  }),
).listen(port, HOST, () => {
  console.log(
    `${new Date().toISOString()} me origin on ${HOST}:${port}: site ${siteDirectory}, users ${usersDirectory}, logins of ${audiences.length} Access app(s); build ${provenance}`,
  )
})
