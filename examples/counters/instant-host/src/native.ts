import { type Model } from 'counters-core-example'
import { Effect, Exit, Scope } from 'effect'

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
import { countersProcessorIds } from './identity.js'
import { type CountersTape, makeCountersTape } from './makeTape.js'
import {
  FailedCountersSession,
  establishCountersSession,
  signInCountersDemoSession,
} from './session.js'
import {
  type CountersWindowRuntime,
  type CountersWindowTape,
  startCountersWindowRuntime,
} from './window.js'

export {
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
}

export {
  FailedCountersSession,
  SignedInCountersSession,
  establishCountersSession,
} from './session.js'
export {
  type CountersWindowActions,
  type CountersWindowModel,
  type CountersWindowRuntime,
  type CountersWindowTape,
  FailedWindow,
  ReadyWindow,
  StartingWindow,
  startCountersWindowRuntime,
} from './window.js'

/** Signs in and opens the Instant tape from a host-owned Instant database. */
export const openNativeCountersTapeFromDatabase = (
  database: InstantProgramDatabase,
  processorId: string,
  sessionUrl?: string,
): Effect.Effect<CountersTape | null> =>
  Effect.gen(function* () {
    yield* Effect.promise(() => ensureHostedInstantSession(database))
    if (sessionUrl !== undefined && sessionUrl !== '') {
      yield* Effect.promise(() =>
        signInCountersDemoSession(database, sessionUrl),
      )
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

/** Inputs the native window runtime uses to own Instant and sign-in. */
export type NativeCountersWindowInput = Readonly<{
  accessToken?: string
  appId: string | undefined
  database: InstantProgramDatabase | null
  loadAccessToken?: () => Promise<string | undefined>
  processorId: string
  requestAccessToken?: () => Promise<string | undefined>
  sessionUrl?: string
}>

const missingAppIdError =
  'EXPO_PUBLIC_INSTANT_APP_ID is missing. Start through the Instant demo wrapper.'

const openNativeWindowTape = (
  database: InstantProgramDatabase,
  processorId: string,
  userId: string,
): Promise<CountersWindowTape> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      const tape = yield* makeCountersTape(
        makeInstantProgramStore(database),
        processorId,
        userId,
      )
      const opened = yield* openCountersTapeRuntime(
        tape,
        instantCountersResources,
      )
      yield* observeRemoteCountersTape(tape, opened.runtime, processorId).pipe(
        Effect.forkChild,
      )
      return {
        readModel: () => opened.runtime.readModel(),
        send: opened.sendClientInput,
        stop: () => {
          void Effect.runPromise(Scope.close(scope, Exit.void))
        },
        subscribe: (listener: (model: Model) => void) =>
          opened.runtime.observeModel(listener),
      }
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}

/** Starts the Instant Counters window. Failed sign-in is a snapshot, not a hang. */
export const startNativeCountersWindow = (
  input: NativeCountersWindowInput,
): CountersWindowRuntime => {
  let accessToken = input.accessToken
  let hasCompletedFirstSignIn = false
  return startCountersWindowRuntime({
    openTape: userId => {
      if (input.database === null) {
        return Promise.reject(new Error(missingAppIdError))
      }
      return openNativeWindowTape(input.database, input.processorId, userId)
    },
    signIn: async () => {
      if (
        input.appId === undefined ||
        input.appId === '' ||
        input.database === null
      ) {
        return FailedCountersSession.make({ error: missingAppIdError })
      }
      if (!hasCompletedFirstSignIn) {
        hasCompletedFirstSignIn = true
        if (
          (accessToken === undefined || accessToken === '') &&
          input.loadAccessToken !== undefined
        ) {
          accessToken = await input.loadAccessToken()
        }
      } else if (input.requestAccessToken !== undefined) {
        accessToken = await input.requestAccessToken()
      }
      const database = input.database
      if (accessToken !== undefined && accessToken !== '') {
        if (input.sessionUrl !== undefined && input.sessionUrl !== '') {
          return establishCountersSession({
            accessToken,
            database,
            ensureHostedSession: options =>
              ensureHostedInstantSession(database, options),
            sessionUrl: input.sessionUrl,
          })
        }
        return establishCountersSession({
          accessToken,
          database,
          ensureHostedSession: options =>
            ensureHostedInstantSession(database, options),
        })
      }
      if (input.sessionUrl !== undefined && input.sessionUrl !== '') {
        return establishCountersSession({
          database,
          ensureHostedSession: options =>
            ensureHostedInstantSession(database, options),
          sessionUrl: input.sessionUrl,
        })
      }
      return establishCountersSession({
        database,
        ensureHostedSession: options =>
          ensureHostedInstantSession(database, options),
      })
    },
  })
}
