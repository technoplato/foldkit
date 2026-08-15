import {
  Message,
  counterProcessorIdFrom,
  counterProcessorIds,
  counterTapeIdentityFields,
  localCounterSessionId,
  localCounterSubjectId,
} from 'counter-core-example'
import { Effect, Option } from 'effect'
import { Processor } from 'foldkit'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  type ProgramStoreService,
  makeFileProgramStore,
  makeInMemoryProgramStore,
} from '@foldkit/instant'
import {
  type SharedProgramTape,
  type SharedProgramTapeIdentity,
  type TapeLink,
  makeSharedProgramTape,
} from '@foldkit/instant/sharing'

import {
  CounterInstantTapeError,
  maybeMakeInstantCounterTape,
} from './instantTape.js'

/** One Instant tape used by a Counter Processor. */
export type CounterTape = SharedProgramTape<Message>

/** Builds the same-actor identity for one Counter Processor. */
export const counterTapeIdentity = (
  processorId: string,
): SharedProgramTapeIdentity => ({
  actor: Processor.SystemActor.make({ processorId }),
  ...counterTapeIdentityFields(
    processorId,
    localCounterSubjectId,
    localCounterSessionId,
  ),
})

/** Builds a Counter tape over an existing Instant Program store. */
export const makeCounterTapeOnStore = (
  store: ProgramStoreService,
  processorId: string,
  link: TapeLink,
): Effect.Effect<CounterTape> =>
  makeSharedProgramTape({
    Message,
    eventId: message => message._tag,
    identity: counterTapeIdentity(processorId),
    link,
    makeId: () => crypto.randomUUID(),
    now: () => Date.now(),
    store,
  })

/** In-memory Instant tape. The process dies with the count. */
export const makeMemoryCounterTape = (
  processorId: string = counterProcessorIds.cli,
): Effect.Effect<CounterTape> =>
  Effect.gen(function* () {
    const store = yield* makeInMemoryProgramStore()
    return yield* makeCounterTapeOnStore(store, processorId, 'offline')
  })

/** File Instant tape. The offline outbox shared by local Processors. */
export const makeFileCounterTape = (
  path: string,
  processorId: string = counterProcessorIds.cli,
): Effect.Effect<CounterTape> =>
  Effect.gen(function* () {
    const store = yield* makeFileProgramStore(path)
    return yield* makeCounterTapeOnStore(store, processorId, 'offline')
  })

/** Default file path for a local Counter tape. */
export const defaultCounterTapePath = (): string =>
  join(homedir(), '.config', 'foldkit-counter', 'tape.json')

/** Resolves the Counter tape from the process environment. */
export const resolveCounterTape = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<CounterTape, CounterInstantTapeError> =>
  Effect.gen(function* () {
    const processorId = counterProcessorIdFrom(
      environment['COUNTER_PROCESSOR_ID'],
      counterProcessorIds.cli,
    )
    const mode = environment['COUNTER_TAPE']
    if (mode === 'instant') {
      const maybeInstant = yield* maybeMakeInstantCounterTape(environment)
      if (Option.isSome(maybeInstant)) {
        return maybeInstant.value
      }
    }
    if (mode === 'memory') {
      return yield* makeMemoryCounterTape(processorId)
    }
    const path = environment['COUNTER_TAPE_PATH']
    if (path !== undefined && path !== '') {
      return yield* makeFileCounterTape(path, processorId)
    }
    if (mode === 'file') {
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
