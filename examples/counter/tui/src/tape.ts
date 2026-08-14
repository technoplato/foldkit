import {
  Message,
  counterTapeProgramId,
  counterTapeProgramVersion,
  localCounterSessionId,
  localCounterSubjectId,
} from 'counter-core-example'
import { Effect } from 'effect'
import { Processor } from 'foldkit'

import {
  type ProgramStoreService,
  type SharedProgramTape,
  type TapeLink,
  makeFileProgramStore,
  makeInMemoryProgramStore,
  makeSharedProgramTape,
} from '@foldkit/instant'

import {
  CounterInstantTapeError,
  makeInstantCounterTape,
} from './instantTape.js'

/** One Instant tape used by the Counter TUI Processor. */
export type CounterTape = SharedProgramTape<Message>

const processorIdFrom = (value: string | undefined): string => {
  if (value === undefined || value === '') {
    return 'tui'
  }
  return value
}

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
      actorId: localCounterSubjectId,
      clientId: processorId,
      originDeviceId: 'computer',
      originatingProcessorId: processorId,
      programId: counterTapeProgramId,
      programVersion: counterTapeProgramVersion,
      sessionId: localCounterSessionId,
      subjectId: localCounterSubjectId,
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
  const processorId = processorIdFrom(environment['COUNTER_PROCESSOR_ID'])
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
