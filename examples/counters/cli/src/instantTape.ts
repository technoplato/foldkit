import {
  Message,
  MultipleCountersProgram,
} from 'counters-core-example'
import { Data, Effect } from 'effect'
import { Processor } from 'foldkit'

import {
  type ProgramStoreService,
  type SharedProgramTape,
  makeAdminInstantProgramStore,
  makeFileProgramStore,
  makeInMemoryProgramStore,
  makeSharedProgramTape,
} from '@foldkit/instant'
import { init as initInstantAdmin } from '@instantdb/admin'

/** One Instant tape used by a Multiple Counters Processor. */
export type CountersTape = SharedProgramTape<Message>

/** Live Instant tape could not be opened. */
export class CountersInstantTapeError extends Data.TaggedError(
  'CountersInstantTapeError',
)<{
  readonly message: string
}> {}

const countersInstantSessionId = 'counters-session'
const countersDemoEmail = 'counter@foldkit.dev'

const makeTape = (
  store: ProgramStoreService,
  processorId: string,
  subjectId: string,
) =>
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

/** Opens memory, file, or live Instant tape for Multiple Counters. */
export const resolveCountersTape = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<CountersTape, CountersInstantTapeError> =>
  Effect.gen(function* () {
    const processorId = environment['COUNTERS_PROCESSOR_ID'] ?? 'counters-cli'
    const mode = environment['COUNTERS_TAPE'] ?? environment['COUNTER_TAPE']
    if (mode === 'instant') {
      const appId = environment['INSTANT_APP_ID']
      const adminToken = environment['INSTANT_APP_ADMIN_TOKEN']
      if (appId === undefined || appId === '') {
        return yield* new CountersInstantTapeError({
          message:
            'COUNTERS_TAPE=instant needs INSTANT_APP_ID. Use the foldkit Instant demo wrapper.',
        })
      }
      if (adminToken === undefined || adminToken === '') {
        return yield* new CountersInstantTapeError({
          message:
            'COUNTERS_TAPE=instant needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
        })
      }
      const admin = initInstantAdmin({ adminToken, appId })
      yield* Effect.tryPromise({
        try: () => admin.auth.createToken({ email: countersDemoEmail }),
        catch: () =>
          new CountersInstantTapeError({
            message: 'Instant could not mint the Counters demo session.',
          }),
      })
      const user = yield* Effect.tryPromise({
        try: () => admin.auth.getUser({ email: countersDemoEmail }),
        catch: () =>
          new CountersInstantTapeError({
            message: 'Instant could not load the Counters demo user.',
          }),
      })
      if (user === null) {
        return yield* new CountersInstantTapeError({
          message: 'Instant has no Counters demo user.',
        })
      }
      return yield* makeTape(
        makeAdminInstantProgramStore(appId, adminToken),
        processorId,
        user.id,
      )
    }
    const path = environment['COUNTERS_TAPE_PATH']
    if (path !== undefined && path !== '') {
      const store = yield* makeFileProgramStore(path)
      return yield* makeTape(store, processorId, 'local-counters')
    }
    const store = yield* makeInMemoryProgramStore()
    return yield* makeTape(store, processorId, 'local-counters')
  })
