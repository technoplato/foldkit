import { Effect } from 'effect'

import {
  InstantProgramSchema,
  ensureHostedInstantSession,
  makeInstantProgramStore,
} from '@foldkit/instant'
import { init } from '@instantdb/core'

import { signInDemoSession } from './browser.js'
import { type CountersTape, makeCountersTape } from './makeTape.js'

/** Signs in and opens the live Instant Counters tape from a native Client. */
export const openNativeCountersTape = (
  appId: string,
  processorId: string,
  sessionUrl?: string,
): Effect.Effect<CountersTape | null> =>
  Effect.gen(function* () {
    const database = init({ appId, schema: InstantProgramSchema })
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
