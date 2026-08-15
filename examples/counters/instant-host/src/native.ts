import { Effect } from 'effect'

import {
  type InstantProgramDatabase,
  InstantProgramSchema,
  ensureHostedInstantSession,
  makeInstantProgramStore,
} from '@foldkit/instant'
import { init } from '@instantdb/core'

import {
  instantCountersResources,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
} from './attach.js'
import { signInDemoSession } from './browser.js'
import { countersProcessorIds } from './identity.js'
import { type CountersTape, makeCountersTape } from './makeTape.js'

export {
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
}

/** Signs in and opens the Instant tape from a host-owned Instant database. */
export const openNativeCountersTapeFromDatabase = (
  database: InstantProgramDatabase,
  processorId: string,
  sessionUrl?: string,
): Effect.Effect<CountersTape | null> =>
  Effect.gen(function* () {
    yield* Effect.promise(() => ensureHostedInstantSession(database))
    if (sessionUrl !== undefined && sessionUrl !== '') {
      yield* Effect.promise(() => signInDemoSession(database, sessionUrl))
    }
    const user = yield* Effect.promise(() => database.getAuth())
    if (user === null) {
      return null
    }
    return yield* makeCountersTape(
      makeInstantProgramStore(database),
      processorId,
      user.id,
    )
  })

/** Signs in and opens the live Instant Counters tape from a native Client. */
export const openNativeCountersTape = (
  appId: string,
  processorId: string,
  sessionUrl?: string,
): Effect.Effect<CountersTape | null> =>
  openNativeCountersTapeFromDatabase(
    init({ appId, schema: InstantProgramSchema }),
    processorId,
    sessionUrl,
  )
