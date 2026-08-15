import {
  Message,
  counterProcessorIdFrom,
  counterProcessorIds,
  counterTapeIdentityFields,
  localCounterSessionId,
  localCounterSubjectId,
} from 'counter-core-example'
import { Effect } from 'effect'
import { Processor } from 'foldkit'

import {
  type ProgramStoreService,
  makeFileProgramStore,
  makeInMemoryProgramStore,
} from '@foldkit/instant'
import {
  type SharedProgramTape,
  type TapeLink,
  makeSharedProgramTape,
} from '@foldkit/instant/sharing'

import {
  CounterInstantTapeError,
  makeInstantCounterTape,
} from './instantTape.js'

/** One Instant tape used by the Counter TUI Processor. */
export type CounterTape = SharedProgramTape<Message>

const makeTape = (
  store: ProgramStoreService,
  processorId: string,
  link: TapeLink,
): Effect.Effect<CounterTape> =>
  makeSharedProgramTape({
    Message,
    eventId: message => message._tag,
    identity: {
      actor: Processor.SystemActor.make({ processorId }),
      ...counterTapeIdentityFields(
        processorId,
        localCounterSubjectId,
        localCounterSessionId,
      ),
    },
    link,
    makeId: () => crypto.randomUUID(),
    now: () => Date.now(),
    store,
  })

/** Resolves the TUI Instant tape from the process environment. */
export const resolveCounterTape = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<CounterTape, CounterInstantTapeError> => {
  const processorId = counterProcessorIdFrom(
    environment['COUNTER_PROCESSOR_ID'],
    counterProcessorIds.tui,
  )
  if (environment['COUNTER_TAPE'] === 'instant') {
    return makeInstantCounterTape(processorId, environment)
  }
  const path = environment['COUNTER_TAPE_PATH']
  if (path !== undefined && path !== '') {
    return Effect.gen(function* () {
      const store = yield* makeFileProgramStore(path)
      return yield* makeTape(store, processorId, 'offline')
    })
  }
  return Effect.gen(function* () {
    const store = yield* makeInMemoryProgramStore()
    return yield* makeTape(store, processorId, 'offline')
  })
}
