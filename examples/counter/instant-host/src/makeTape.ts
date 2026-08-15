import {
  Message,
  counterInstantSessionId,
  counterTapeIdentityFields,
  localCounterSessionId,
  localCounterSubjectId,
} from 'counter-core-example'
import { Effect } from 'effect'
import { Processor } from 'foldkit'

import {
  type ProgramStoreService,
  type SharedProgramTape,
  type SharedProgramTapeIdentity,
  type TapeLink,
  makeSharedProgramTape,
} from '@foldkit/instant/browser'

/** One Instant tape used by a Counter Processor. */
export type CounterTape = SharedProgramTape<Message>

/** Builds the same-actor identity for one local Counter Processor. */
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

/** Builds Instant identity for one authenticated Counter Processor. */
export const counterInstantTapeIdentity = (
  processorId: string,
  subjectId: string,
): SharedProgramTapeIdentity => ({
  actor: Processor.AuthenticatedActor.make({ subjectId }),
  ...counterTapeIdentityFields(processorId, subjectId, counterInstantSessionId),
})

/** Builds a local Counter tape over an existing Instant Program store. */
export const makeLocalCounterTape = (
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

/** Builds a live Instant Counter tape over an existing Instant Program store. */
export const makeLiveCounterTape = (
  store: ProgramStoreService,
  processorId: string,
  subjectId: string,
): Effect.Effect<CounterTape> =>
  makeSharedProgramTape({
    Message,
    eventId: message => message._tag,
    identity: counterInstantTapeIdentity(processorId, subjectId),
    makeId: () => crypto.randomUUID(),
    now: () => Date.now(),
    store,
  })
