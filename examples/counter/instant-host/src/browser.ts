import {
  CounterProgram,
  type CounterWindowTape,
  FailedCounterSession,
  Message,
  type Model,
  SignedInCounterSession,
  counterDemoSessionPath,
  describeCounterWindowError,
  foldCounterMessages,
} from 'counter-core-example'
import { Effect, Exit, Layer, Scope } from 'effect'
import { Runtime } from 'foldkit'

import {
  type InstantProgramDatabase,
  InstantProgramSchema,
  makeInstantProgramStore,
} from '@foldkit/instant/browser'
import {
  commitSharedMessage,
  observeRemoteAcceptedMessages,
} from '@foldkit/instant/sharing'
import { init } from '@instantdb/core'

import { makeLiveCounterTape } from './makeTape.js'

/** Opens the Instant Program schema used by every Counter browser Processor. */
export const makeCounterInstantDatabase = (
  appId: string,
): InstantProgramDatabase => init({ appId, schema: InstantProgramSchema })

const readJsonToken = async (response: Response): Promise<string> => {
  if (!response.ok) {
    throw new Error('Instant could not mint the Counter demo session.')
  }
  const body: unknown = await response.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('token' in body) ||
    typeof body.token !== 'string' ||
    body.token === ''
  ) {
    throw new Error('Instant could not mint the Counter demo session.')
  }
  return body.token
}

/** Signs one Counter Processor into the shared Instant demo account. */
export const signInCounterDemoSession = async (
  database: InstantProgramDatabase,
): Promise<void> => {
  const existing = await database.getAuth()
  if (existing !== null) {
    return
  }
  const response = await fetch(counterDemoSessionPath, {
    credentials: 'same-origin',
  })
  const token = await readJsonToken(response)
  await database.auth.signInWithToken(token)
}

/** Signs in the demo subject and returns a window session. */
export const signInCounterWindowSession = async (
  database: InstantProgramDatabase,
) => {
  try {
    await signInCounterDemoSession(database)
    const user = await database.getAuth()
    if (user === null) {
      return FailedCounterSession.make({
        error: 'Instant has no Counter demo user.',
      })
    }
    return SignedInCounterSession.make({ userId: user.id })
  } catch (error) {
    return FailedCounterSession.make({
      error: describeCounterWindowError(error),
    })
  }
}

/** Opens the live Instant Counter tape for one Processor. */
export const openLiveCounterWindowTape = (
  database: InstantProgramDatabase,
  processorId: string,
  userId: string,
): Promise<CounterWindowTape> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      const tape = yield* makeLiveCounterTape(
        makeInstantProgramStore(database),
        processorId,
        userId,
      )
      const accepted = yield* tape.readAcceptedMessages
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CounterProgram,
          resources: Layer.empty,
          start: Runtime.fromModel(foldCounterMessages(accepted)),
        }),
      )
      yield* runtime.initialization
      yield* Effect.forkChild(
        observeRemoteAcceptedMessages(
          tape,
          processorId,
          (message, occurrence) =>
            Effect.asVoid(
              runtime.run(message, {
                source: Runtime.fromAcceptedMessage(occurrence.occurrenceId),
              }),
            ),
        ),
      )
      return {
        readModel: () => runtime.readModel(),
        send: (message: Message) =>
          Effect.runPromise(
            Effect.asVoid(
              commitSharedMessage(tape, message, () => runtime.run(message)),
            ),
          ),
        stop: () => {
          const closing = Effect.runPromise(Scope.close(scope, Exit.void))
          closing.then(
            () => undefined,
            () => undefined,
          )
        },
        subscribe: (listener: (model: Model) => void) =>
          runtime.observeModel(listener),
      }
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}
