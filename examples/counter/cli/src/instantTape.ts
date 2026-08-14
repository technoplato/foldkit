import {
  Message,
  counterTapeProgramId,
  counterTapeProgramVersion,
} from 'counter-core-example'
import { Data, Effect, Option } from 'effect'
import { Processor } from 'foldkit'

import {
  type SharedProgramTapeIdentity,
  makeAdminInstantProgramStore,
  makeSharedProgramTape,
} from '@foldkit/instant'
import { init as initInstantAdmin } from '@instantdb/admin'

import { type CounterTape } from './tape.js'

/** Shared Instant demo subject used by local Counter Processors. */
export const counterDemoEmail = 'counter@foldkit.dev'

/** Instant session id shared by every Counter Processor of one subject. */
export const counterInstantSessionId = 'counter-session'

/** Live Instant tape could not be opened. */
export class CounterInstantTapeError extends Data.TaggedError(
  'CounterInstantTapeError',
)<{
  readonly message: string
}> {}

const processorIdFrom = (value: string | undefined): string => {
  if (value === undefined || value === '') {
    return 'cli'
  }
  return value
}

/** Builds Instant identity for one authenticated Counter Processor. */
export const counterInstantTapeIdentity = (
  processorId: string,
  subjectId: string,
): SharedProgramTapeIdentity => ({
  actor: Processor.AuthenticatedActor.make({ subjectId }),
  actorId: subjectId,
  clientId: processorId,
  originDeviceId: 'computer',
  originatingProcessorId: processorId,
  programId: counterTapeProgramId,
  programVersion: counterTapeProgramVersion,
  sessionId: counterInstantSessionId,
  subjectId,
})

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
    const store = makeAdminInstantProgramStore(appId, adminToken)
    return yield* makeSharedProgramTape({
      Message,
      eventId: message => message._tag,
      identity: counterInstantTapeIdentity(processorId, user.id),
      makeId: () => crypto.randomUUID(),
      now: () => Date.now(),
      store,
    })
  })

/** Resolves a live Instant tape when COUNTER_TAPE=instant. */
export const maybeMakeInstantCounterTape = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Effect.Effect<Option.Option<CounterTape>, CounterInstantTapeError> => {
  if (environment['COUNTER_TAPE'] !== 'instant') {
    return Effect.succeed(Option.none())
  }
  return Effect.map(
    makeInstantCounterTape(
      processorIdFrom(environment['COUNTER_PROCESSOR_ID']),
      environment,
    ),
    Option.some,
  )
}
