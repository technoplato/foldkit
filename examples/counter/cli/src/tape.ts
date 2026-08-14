import {
  Message,
  counterTapeProgramId,
  counterTapeProgramVersion,
  localCounterSessionId,
  localCounterSubjectId,
} from 'counter-core-example'
import { Effect, Option } from 'effect'
import { Processor } from 'foldkit'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  type ProgramStoreService,
  type SharedProgramTape,
  type SharedProgramTapeIdentity,
  type TapeLink,
  makeFileProgramStore,
  makeInMemoryProgramStore,
  makeSharedProgramTape,
} from '@foldkit/instant'

/** One Instant tape used by a Counter Processor. */
export type CounterTape = SharedProgramTape<Message>

const processorIdFrom = (value: string | undefined): string => {
  if (value === undefined || value === '') {
    return 'cli'
  }
  return value
}

/** Builds the same-actor identity for one Counter Processor. */
export const counterTapeIdentity = (
  processorId: string,
): SharedProgramTapeIdentity => ({
  actor: Processor.SystemActor.make({ processorId }),
  actorId: localCounterSubjectId,
  clientId: processorId,
  originDeviceId: 'computer',
  originatingProcessorId: processorId,
  programId: counterTapeProgramId,
  programVersion: counterTapeProgramVersion,
  sessionId: localCounterSessionId,
  subjectId: localCounterSubjectId,
})

const makeTape = (
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
  processorId = 'cli',
): Effect.Effect<CounterTape> =>
  Effect.gen(function* () {
    const store = yield* makeInMemoryProgramStore()
    return yield* makeTape(store, processorId, 'offline')
  })

/** File Instant tape. The offline outbox shared by local Processors. */
export const makeFileCounterTape = (
  path: string,
  processorId = 'cli',
): Effect.Effect<CounterTape> =>
  Effect.gen(function* () {
    const store = yield* makeFileProgramStore(path)
    return yield* makeTape(store, processorId, 'offline')
  })

/** Default file path for a local Counter tape. */
export const defaultCounterTapePath = (): string =>
  join(homedir(), '.config', 'foldkit-counter', 'tape.json')

/** Resolves the Counter tape from the process environment. */
export const resolveCounterTape = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<CounterTape> => {
  const processorId = processorIdFrom(environment['COUNTER_PROCESSOR_ID'])
  const mode = environment['COUNTER_TAPE']
  if (mode === 'memory') {
    return makeMemoryCounterTape(processorId)
  }
  const path = environment['COUNTER_TAPE_PATH']
  if (path !== undefined && path !== '') {
    return makeFileCounterTape(path, processorId)
  }
  if (mode === 'file') {
    return makeFileCounterTape(defaultCounterTapePath(), processorId)
  }
  return makeMemoryCounterTape(processorId)
}

/** Reads an optional tape or builds the process default. */
export const withCounterTape = (
  maybeTape: Option.Option<CounterTape>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<CounterTape> => {
  if (Option.isSome(maybeTape)) {
    return Effect.succeed(maybeTape.value)
  }
  return resolveCounterTape(environment)
}
