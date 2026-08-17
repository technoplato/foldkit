import {
  counterProcessorIdFrom,
  counterProcessorIds,
} from 'counter-core-example'
import { Data, Effect, Option } from 'effect'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  type ProgramStoreService,
  type SnapshotLogTransport,
  makeAdminSnapshotLogTransport,
  makeFileProgramStore,
  makeInMemoryProgramStore,
  makeMemorySnapshotLogTransport,
} from '@foldkit/instant'

import { type CounterTape, makeLocalCounterTape } from './makeTape.js'

export {
  type CounterTape,
  counterInstantTapeIdentity,
  counterTapeIdentity,
  makeLiveCounterTape,
  makeLocalCounterTape,
} from './makeTape.js'

export {
  type CounterSnapshotCommit,
  commitCounterSnapshotMessage,
  decodeCounterLogMessage,
  openSnapshotCounterWindowTape,
  readCounterSnapshotModel,
} from './snapshot.js'

export type { SnapshotLogTransport } from '@foldkit/instant'

/** Live Instant snapshot log could not be opened. */
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

const missingInstantAppIdError =
  'COUNTER_TAPE=instant needs INSTANT_APP_ID. Use the foldkit Instant demo wrapper.'

const missingInstantAdminTokenError =
  'COUNTER_TAPE=instant needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.'

const instantCredentials = (
  environment: Readonly<Record<string, string | undefined>>,
): Effect.Effect<
  Readonly<{ adminToken: string; appId: string }>,
  CounterInstantTapeError
> => {
  const appId = environment['INSTANT_APP_ID']
  const adminToken = environment['INSTANT_APP_ADMIN_TOKEN']
  if (appId === undefined || appId === '') {
    return Effect.fail(
      new CounterInstantTapeError({
        message: missingInstantAppIdError,
      }),
    )
  }
  if (adminToken === undefined || adminToken === '') {
    return Effect.fail(
      new CounterInstantTapeError({
        message: missingInstantAdminTokenError,
      }),
    )
  }
  return Effect.succeed({ adminToken, appId })
}

/** In-memory count snapshot plus Message log. */
export const makeMemoryCounterSnapshotLog =
  (): Effect.Effect<SnapshotLogTransport> => makeMemorySnapshotLogTransport()

/** Opens the live Instant count snapshot plus Message log. */
export const makeInstantCounterSnapshotLog = (
  _processorId: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<SnapshotLogTransport, CounterInstantTapeError> =>
  Effect.gen(function* () {
    const credentials = yield* instantCredentials(environment)
    return makeAdminSnapshotLogTransport(
      credentials.appId,
      credentials.adminToken,
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
      yield* instantCredentials(environment)
      return yield* new CounterInstantTapeError({
        message:
          'COUNTER_TAPE=instant uses the count snapshot log, not the Program tape.',
      })
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

/** Resolves the count snapshot log from the process environment. */
export const resolveCounterSnapshotLog = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
  defaultProcessorId: string = counterProcessorIds.cli,
): Effect.Effect<SnapshotLogTransport, CounterInstantTapeError> => {
  const processorId = counterProcessorIdFrom(
    environment['COUNTER_PROCESSOR_ID'],
    defaultProcessorId,
  )
  return makeInstantCounterSnapshotLog(processorId, environment)
}

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

/** Reads an optional snapshot log or opens the live Instant log. */
export const withCounterSnapshotLog = (
  maybeSnapshot: Option.Option<SnapshotLogTransport>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<SnapshotLogTransport, CounterInstantTapeError> => {
  if (Option.isSome(maybeSnapshot)) {
    return Effect.succeed(maybeSnapshot.value)
  }
  return resolveCounterSnapshotLog(environment)
}
