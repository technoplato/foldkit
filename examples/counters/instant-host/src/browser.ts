import { Effect } from 'effect'

import { InstantProgramSchema, makeInstantProgramStore } from '@foldkit/instant'
import { init } from '@instantdb/core'

import { countersDemoSessionPath } from './identity.js'
import { type CountersTape, makeCountersTape } from './makeTape.js'

/** Signs in the shared Instant demo subject when a mint path is available. */
export const signInDemoSession = async (
  database: ReturnType<typeof init<typeof InstantProgramSchema>>,
  sessionPath: string = countersDemoSessionPath,
): Promise<void> => {
  const existing = await database.getAuth()
  if (existing !== null) {
    return
  }
  const response = await fetch(sessionPath, {
    credentials: 'same-origin',
  })
  if (!response.ok) {
    return
  }
  const body: unknown = await response.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('token' in body) ||
    typeof body.token !== 'string'
  ) {
    return
  }
  await database.auth.signInWithToken(body.token)
}

/** Signs in the demo subject and opens the live Instant Counters tape. */
export const openBrowserCountersTape = (
  appId: string,
  processorId: string,
  sessionPath: string = countersDemoSessionPath,
): Effect.Effect<CountersTape | null> =>
  Effect.gen(function* () {
    const database = init({ appId, schema: InstantProgramSchema })
    yield* Effect.promise(() => signInDemoSession(database, sessionPath))
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
