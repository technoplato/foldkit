import {
  type CounterWindowRuntime,
  FailedCounterSession,
  SignedInCounterSession,
  counterProcessorIdFrom,
  counterProcessorIds,
  startCounterWindowRuntime,
} from 'counter-core-example'
import {
  makeInstantCounterSnapshotLog,
  openSnapshotCounterWindowTape,
} from 'counter-instant-example/node'
import { Effect } from 'effect'

const missingInstantAppIdError =
  'COUNTER_TAPE=instant needs INSTANT_APP_ID. Use the foldkit Instant demo wrapper.'

const missingInstantAdminTokenError =
  'COUNTER_TAPE=instant needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.'

const signInCounterWindowSession = (
  environment: Readonly<Record<string, string | undefined>>,
) => {
  const appId = environment['INSTANT_APP_ID']
  const adminToken = environment['INSTANT_APP_ADMIN_TOKEN']
  if (appId === undefined || appId === '') {
    return Promise.resolve(
      FailedCounterSession.make({
        error: missingInstantAppIdError,
      }),
    )
  }
  if (adminToken === undefined || adminToken === '') {
    return Promise.resolve(
      FailedCounterSession.make({
        error: missingInstantAdminTokenError,
      }),
    )
  }
  return Promise.resolve(
    SignedInCounterSession.make({
      userId: 'count',
    }),
  )
}

/** Starts the TUI Processor on the live Instant count snapshot. */
export const startInstantCounterWindow = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): CounterWindowRuntime => {
  const processorId = counterProcessorIdFrom(
    environment['COUNTER_PROCESSOR_ID'],
    counterProcessorIds.tui,
  )
  let runtime: CounterWindowRuntime
  runtime = startCounterWindowRuntime({
    openTape: () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const transport = yield* makeInstantCounterSnapshotLog(
            processorId,
            environment,
          )
          return yield* Effect.tryPromise({
            try: () =>
              openSnapshotCounterWindowTape(transport, processorId, error => {
                runtime.fail(error)
              }),
            catch: error => error,
          })
        }),
      ),
    signIn: () => signInCounterWindowSession(environment),
  })
  return runtime
}
