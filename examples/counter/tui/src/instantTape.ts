import {
  Message,
  counterTapeProgramId,
  counterTapeProgramVersion,
} from 'counter-core-example'
import { Data, Effect } from 'effect'
import { Processor } from 'foldkit'

import {
  makeAdminInstantProgramStore,
  makeSharedProgramTape,
} from '@foldkit/instant'
import { init as initInstantAdmin } from '@instantdb/admin'

import { type CounterTape } from './tape.js'

const counterDemoEmail = 'counter@foldkit.dev'
const counterInstantSessionId = 'counter-session'

/** Live Instant tape could not be opened. */
export class CounterInstantTapeError extends Data.TaggedError(
  'CounterInstantTapeError',
)<{
  readonly message: string
}> {}

/** Opens the live Instant tape for the TUI Processor. */
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
    return yield* makeSharedProgramTape({
      Message,
      eventId: message => message._tag,
      identity: {
        actor: Processor.AuthenticatedActor.make({ subjectId: user.id }),
        actorId: user.id,
        clientId: processorId,
        originDeviceId: 'computer',
        originatingProcessorId: processorId,
        programId: counterTapeProgramId,
        programVersion: counterTapeProgramVersion,
        sessionId: counterInstantSessionId,
        subjectId: user.id,
      },
      makeId: () => crypto.randomUUID(),
      now: () => Date.now(),
      store: makeAdminInstantProgramStore(appId, adminToken),
    })
  })
