import {
  counterDemoEmail,
  counterProcessorIdFrom,
  counterProcessorIds,
} from 'counter-core-example'
import { Data, Effect, Option } from 'effect'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  type ProgramStoreService,
  makeAdminInstantProgramStore,
  makeFileProgramStore,
  makeInMemoryProgramStore,
} from '@foldkit/instant'
import { init as initInstantAdmin } from '@instantdb/admin'

import {
  type CounterTape,
  makeLiveCounterTape,
  makeLocalCounterTape,
} from './makeTape.js'

export {
  type CounterTape,
  counterInstantTapeIdentity,
  counterTapeIdentity,
  makeLiveCounterTape,
  makeLocalCounterTape,
} from './makeTape.js'

/** Live Instant tape could not be opened. */
export class CounterInstantTapeError extends Data.TaggedError(
  'CounterInstantTapeError',
)<{
  readonly message: string
}> {}

/** Builds a Counter tape over an existing Instant Program store. */
export const makeCounterTapeOnStore = (
  store: ProgramStoreService,
  processorId: string,
  link: 'offline' | 'queued' | 'delivered',
): Effect.Effect<CounterTape> => makeLocalCounterTape(store, processorId, link)

/** In-memory Instant tape. The process dies with the count. */
export const makeMemoryCounterTape = (
  processorId: string = counterProcessorIds.cli,
): Effect.Effect<CounterTape> =>
  Effect.gen(function* () {
    const store = yield* makeInMemoryProgramStore()
    return yield* makeLocalCounterTape(store, processorId, 'offline')
  })

/** File Instant tape. The offline outbox shared by local Processors. */
export const makeFileCounterTape = (
  path: string,
  processorId: string = counterProcessorIds.cli,
): Effect.Effect<CounterTape> =>
  Effect.gen(function* () {
    const store = yield* makeFileProgramStore(path)
    return yield* makeLocalCounterTape(store, processorId, 'offline')
  })

/** Default file path for a local Counter tape. */
export const defaultCounterTapePath = (): string =>
  join(homedir(), '.config', 'foldkit-counter', 'tape.json')

/** Opens the live Instant tape for one Counter Processor. */
export const makeInstantCounterTape = (
  processorId: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<CounterTape, CounterInstantTapeError> =>
  Effect.gen(function* () {
    const appId = environment['INSTANT_APP_ID']
    const adminToken = environment['INSTANT_APP_ADMIN_TOKEN']
    if (appId === undefined || appId === '') {
      return yield* new CounterInstantTapeError({
        message:
          'COUNTER_TAPE=instant needs INSTANT_APP_ID. Use the foldkit Instant demo wrapper.',
      })
    }
    if (adminToken === undefined || adminToken === '') {
      return yield* new CounterInstantTapeError({
        message:
          'COUNTER_TAPE=instant needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
      })
    }
    const admin = initInstantAdmin({ adminToken, appId })
    yield* Effect.tryPromise({
      try: () => admin.auth.createToken({ email: counterDemoEmail }),
      catch: () =>
        new CounterInstantTapeError({
          message: 'Instant could not mint the Counter demo session.',
        }),
    })
    const user = yield* Effect.tryPromise({
      try: () => admin.auth.getUser({ email: counterDemoEmail }),
      catch: () =>
        new CounterInstantTapeError({
          message: 'Instant could not load the Counter demo user.',
        }),
    })
    if (user === null) {
      return yield* new CounterInstantTapeError({
        message: 'Instant has no Counter demo user.',
      })
    }
    return yield* makeLiveCounterTape(
      makeAdminInstantProgramStore(appId, adminToken),
      processorId,
      user.id,
    )
  })

/** Resolves the Counter tape from the process environment. */
export const resolveCounterTape = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
  defaultProcessorId: string = counterProcessorIds.cli,
): Effect.Effect<CounterTape, CounterInstantTapeError> =>
  Effect.gen(function* () {
    const processorId = counterProcessorIdFrom(
      environment['COUNTER_PROCESSOR_ID'],
      defaultProcessorId,
    )
    if (environment['COUNTER_TAPE'] === 'instant') {
      return yield* makeInstantCounterTape(processorId, environment)
    }
    if (environment['COUNTER_TAPE'] === 'memory') {
      return yield* makeMemoryCounterTape(processorId)
    }
    const path = environment['COUNTER_TAPE_PATH']
    if (path !== undefined && path !== '') {
      return yield* makeFileCounterTape(path, processorId)
    }
    if (environment['COUNTER_TAPE'] === 'file') {
      return yield* makeFileCounterTape(defaultCounterTapePath(), processorId)
    }
    return yield* makeMemoryCounterTape(processorId)
  })

/** Reads an optional tape or builds the process default. */
export const withCounterTape = (
  maybeTape: Option.Option<CounterTape>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<CounterTape, CounterInstantTapeError> => {
  if (Option.isSome(maybeTape)) {
    return Effect.succeed(maybeTape.value)
  }
  return resolveCounterTape(environment)
}
