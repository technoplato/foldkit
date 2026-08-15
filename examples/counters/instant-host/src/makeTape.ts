import { Message, MultipleCountersProgram } from 'counters-core-example'
import { Effect } from 'effect'
import { Processor } from 'foldkit'

import {
  type ProgramStoreService,
  type SharedProgramTape,
  makeSharedProgramTape,
} from '@foldkit/instant/browser'

import { countersInstantSessionId } from './identity.js'

/** One Instant tape used by a Multiple Counters Processor. */
export type CountersTape = SharedProgramTape<Message>

/** Opens a same-actor Multiple Counters tape over one Program store. */
export const makeCountersTape = (
  store: ProgramStoreService,
  processorId: string,
  subjectId: string,
): Effect.Effect<CountersTape> =>
  makeSharedProgramTape({
    Message,
    eventId: message => message._tag,
    identity: {
      actor: Processor.AuthenticatedActor.make({ subjectId }),
      actorId: subjectId,
      clientId: processorId,
      originDeviceId: 'computer',
      originatingProcessorId: processorId,
      programId: MultipleCountersProgram.id,
      programVersion: MultipleCountersProgram.version,
      sessionId: countersInstantSessionId,
      subjectId,
    },
    makeId: () => crypto.randomUUID(),
    now: () => Date.now(),
    store,
  })
