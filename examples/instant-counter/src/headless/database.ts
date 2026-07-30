import { Data, Effect } from 'effect'

import { type InstantAdminDatabase, init as initAdmin } from '@instantdb/admin'
import { init as initCore } from '@instantdb/core'

import { type InstantCounterDatabase, schema } from '../../instant.schema.js'

/** Required headless configuration is absent without retaining its value. */
export class HeadlessConfigurationError extends Data.TaggedError(
  'HeadlessConfigurationError',
)<{
  readonly variable: 'INSTANT_APP_ADMIN_TOKEN' | 'INSTANT_APP_ID'
}> {}

/** The trusted admin transport and public app-id-only room transport. */
export type HeadlessDatabases = Readonly<{
  admin: InstantAdminDatabase<typeof schema>
  rooms: InstantCounterDatabase
}>

const requireEnvironment = (
  environment: NodeJS.ProcessEnv,
  variable: HeadlessConfigurationError['variable'],
): Effect.Effect<string, HeadlessConfigurationError> => {
  const value = environment[variable]
  if (value === undefined || value.length === 0) {
    return Effect.fail(new HeadlessConfigurationError({ variable }))
  }
  return Effect.succeed(value)
}

/** Initializes admin storage and separate token-free realtime room clients. */
export const makeHeadlessDatabases = (
  environment: NodeJS.ProcessEnv = process.env,
): Effect.Effect<HeadlessDatabases, HeadlessConfigurationError> =>
  Effect.gen(function* () {
    const appId = yield* requireEnvironment(environment, 'INSTANT_APP_ID')
    const adminToken = yield* requireEnvironment(
      environment,
      'INSTANT_APP_ADMIN_TOKEN',
    )
    return {
      admin: initAdmin({ adminToken, appId, schema }),
      rooms: initCore({ appId, schema }),
    }
  })
