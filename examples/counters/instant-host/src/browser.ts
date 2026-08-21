import { Effect } from 'effect'

import {
  InstantProgramSchema,
  makeInstantProgramStore,
} from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import { countersDemoSessionPath } from './identity.js'
import { type CountersTape, makeCountersTape } from './makeTape.js'
import {
  CountersDemoSignInError,
  countersDemoMintFailed,
  countersDemoNoSession,
  signInDemoSession,
} from './session.js'

export {
  CountersDemoSignInError,
  countersDemoMintFailed,
  countersDemoNoSession,
  signInDemoSession,
}

/** Signs in the demo subject and opens the live Instant Counters tape. */
export const openBrowserCountersTape = (
  appId: string,
  processorId: string,
  sessionPath: string = countersDemoSessionPath,
): Effect.Effect<CountersTape, CountersDemoSignInError> =>
  Effect.gen(function* () {
    const database = init({ appId, schema: InstantProgramSchema })
    yield* Effect.tryPromise({
      try: () => signInDemoSession(database, sessionPath),
      catch: error =>
        error instanceof CountersDemoSignInError
          ? error
          : countersDemoMintFailed(),
    })
    const user = yield* Effect.tryPromise({
      try: () => database.getAuth(),
      catch: () => countersDemoNoSession(),
    })
    if (user === null) {
      return yield* countersDemoNoSession()
    }
    return yield* makeCountersTape(
      makeInstantProgramStore(database),
      processorId,
      user.id,
    )
  })
