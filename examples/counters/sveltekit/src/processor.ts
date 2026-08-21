import { type Model } from 'counters-core-example'
import {
  type CountersBrowserHost,
  type CountersWindowActions,
  type CountersWindowModel,
  type CountersWindowRuntime,
  type CountersWindowTape,
  countersDemoSessionPath,
  countersProcessorIds,
  instantCountersResources,
  makeCountersTape,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
  signInDemoSession,
  startCountersWindowRuntime,
} from 'counters-instant-example'
import { Effect, Exit, Match as M, Option, Scope } from 'effect'

import {
  type InstantProgramDatabase,
  InstantProgramSchema,
  ensureHostedInstantSession,
  makeInMemoryProgramStore,
  makeInstantProgramStore,
} from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

export type { CountersWindowActions, CountersWindowModel }

const missingAppIdError =
  'VITE_INSTANT_APP_ID is missing. Start through the Instant demo wrapper.'

const sveltekitProcessorId = countersProcessorIds.sveltekit

type InstantHostConfig =
  | { readonly _tag: 'MissingInstantAppId' }
  | {
      readonly _tag: 'ReadyInstantAppId'
      readonly appId: string
      readonly database: InstantProgramDatabase
    }

const instantHostConfig = (): InstantHostConfig => {
  const appId = import.meta.env.VITE_INSTANT_APP_ID
  if (typeof appId === 'string' && appId !== '') {
    return {
      _tag: 'ReadyInstantAppId',
      appId,
      database: init({ appId, schema: InstantProgramSchema }),
    }
  }
  return { _tag: 'MissingInstantAppId' }
}

const maybeUserId = (user: unknown): Option.Option<string> => {
  if (typeof user !== 'object' || user === null || !('id' in user)) {
    return Option.none()
  }
  const id = user.id
  if (typeof id !== 'string' || id === '') {
    return Option.none()
  }
  return Option.some(id)
}

const signInInstant = async (
  database: InstantProgramDatabase,
): Promise<
  | { readonly _tag: 'FailedCountersSession'; readonly error: string }
  | { readonly _tag: 'SignedInCountersSession'; readonly userId: string }
> => {
  try {
    await ensureHostedInstantSession(database)
    await signInDemoSession(database, countersDemoSessionPath)
  } catch {
    return {
      _tag: 'FailedCountersSession',
      error: 'Sign-in failed. Instant has no session.',
    }
  }
  const maybeId = maybeUserId(await database.getAuth())
  if (Option.isNone(maybeId)) {
    return {
      _tag: 'FailedCountersSession',
      error: 'Sign-in failed. Instant has no session.',
    }
  }
  return {
    _tag: 'SignedInCountersSession',
    userId: maybeId.value,
  }
}

const openInstantWindowTape = (
  database: InstantProgramDatabase,
  userId: string,
): Promise<CountersWindowTape> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      const tape = yield* makeCountersTape(
        makeInstantProgramStore(database),
        sveltekitProcessorId,
        userId,
      )
      const opened = yield* openCountersTapeRuntime(
        tape,
        instantCountersResources,
      )
      yield* observeRemoteCountersTape(
        tape,
        opened.runtime,
        sveltekitProcessorId,
      ).pipe(Effect.forkChild)
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

const startSvelteKitCountersWindow = (): CountersWindowRuntime => {
  const config = instantHostConfig()
  return startCountersWindowRuntime({
    openTape: userId =>
      M.value(config).pipe(
        M.withReturnType<Promise<CountersWindowTape>>(),
        M.tagsExhaustive({
          MissingInstantAppId: () =>
            Promise.reject(new Error(missingAppIdError)),
          ReadyInstantAppId: ({ database }) =>
            openInstantWindowTape(database, userId),
        }),
      ),
    signIn: () =>
      M.value(config).pipe(
        M.withReturnType<
          Promise<
            | { readonly _tag: 'FailedCountersSession'; readonly error: string }
            | {
                readonly _tag: 'SignedInCountersSession'
                readonly userId: string
              }
          >
        >(),
        M.tagsExhaustive({
          MissingInstantAppId: () =>
            Promise.resolve({
              _tag: 'FailedCountersSession',
              error: missingAppIdError,
            }),
          ReadyInstantAppId: ({ database }) => signInInstant(database),
        }),
      ),
  })
}

let windowRuntime: CountersWindowRuntime | undefined

const sveltekitCountersWindow = (): CountersWindowRuntime => {
  if (windowRuntime === undefined) {
    windowRuntime = startSvelteKitCountersWindow()
  }
  return windowRuntime
}

/** The page subscribes. Instant stays in this Host. */
export const subscribe = (listener: () => void): (() => void) =>
  sveltekitCountersWindow().subscribe(listener)

/** The newest Starting, Failed, or Ready snapshot for one URI. */
export const snapshot = (uri: string): CountersWindowModel =>
  sveltekitCountersWindow().getSnapshot(uri)

/** Actions the page may send for one URI. */
export const actions = (uri: string): CountersWindowActions =>
  sveltekitCountersWindow().actions(uri)

/** Leftover test entry. Not Instant. The page must not call this. */
export const startCountersProcessor = (): Promise<CountersBrowserHost> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* makeInMemoryProgramStore()
      const tape = yield* makeCountersTape(
        store,
        sveltekitProcessorId,
        'local-counters',
      )
      const opened = yield* openCountersTapeRuntime(tape)
      return {
        readModel: () => opened.runtime.readModel(),
        send: opened.sendClientInput,
        stop: () => Effect.runPromise(Scope.close(scope, Exit.void)),
        subscribe: (listener: (model: Model) => void) =>
          opened.runtime.observeModel(listener),
      }
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}
