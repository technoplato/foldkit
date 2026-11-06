import { Array, String, pipe } from 'effect'
import { createServer } from 'node:http'

import { knophyAccessTeamDomain, makeAccessVerifier } from '@foldkit/instant'

import { makeOriginHandler } from './origin'

// CONSTANT

const DEFAULT_PORT = 5262
const HOST = '127.0.0.1'

// MAIN

const env = (name: string): string => process.env[name] ?? ''

const listOf = (value: string): ReadonlyArray<string> =>
  pipe(
    String.split(value, ','),
    Array.map(item => String.toLowerCase(String.trim(item))),
    Array.filter(String.isNonEmpty),
  )

const allowedEmails = listOf(env('PERFORMANCE_ALLOWED_EMAILS'))
const audiences = listOf(env('CF_ACCESS_AUD'))
const siteDirectory = env('PERFORMANCE_SITE_DIR')
const dataDirectory = env('PERFORMANCE_DATA_DIR')

const required: ReadonlyArray<readonly [string, boolean]> = [
  ['PERFORMANCE_ALLOWED_EMAILS', Array.isReadonlyArrayNonEmpty(allowedEmails)],
  ['CF_ACCESS_AUD', Array.isReadonlyArrayNonEmpty(audiences)],
  ['PERFORMANCE_SITE_DIR', siteDirectory !== ''],
  ['PERFORMANCE_DATA_DIR', dataDirectory !== ''],
]

const missing = Array.filter(required, ([, isSet]) => !isSet)

if (Array.isReadonlyArrayNonEmpty(missing)) {
  console.error(
    `performance origin: refusing to start without ${missing.map(([name]) => name).join(', ')}`,
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
    dataDirectory,
    allowedEmails,
    verifyAccessToken: verifier.verify,
    log: line => console.log(`${new Date().toISOString()} ${line}`),
  }),
).listen(port, HOST, () => {
  console.log(
    `${new Date().toISOString()} performance origin on ${HOST}:${port}: site ${siteDirectory}, data ${dataDirectory}, ${allowedEmails.length} allowed login(s)`,
  )
})
