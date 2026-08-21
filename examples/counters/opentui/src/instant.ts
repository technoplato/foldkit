import type { Message, Model } from 'counters-core-example'
import {
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
} from 'counters-instant-example'
import { resolveCountersTape } from 'counters-instant-example/node'
import { Cause, Effect, Exit, Scope } from 'effect'

/** One Node Instant host used by the OpenTUI Processor. */
export type OpenTuiCountersHost = Readonly<{
  readModel: () => Model
  send: (message: Message) => void
  subscribe: (listener: (model: Model) => void) => () => void
}>

/** Instant opened and the OpenTUI Processor can subscribe and send. */
export type ReadyOpenTuiCountersHost = Readonly<{
  _tag: 'Ready'
  host: OpenTuiCountersHost
}>

/** Instant open failed. The terminal must paint this error. */
export type FailedOpenTuiCountersHost = Readonly<{
  _tag: 'Failed'
  error: string
}>

/** Ready host or a visible Instant failure. Never a silent local fallback. */
export type OpenTuiCountersHostStart =
  | ReadyOpenTuiCountersHost
  | FailedOpenTuiCountersHost

/** Turns a thrown Instant or attach failure into host chrome text. */
export const describeOpenTuiInstantError = (error: unknown): string => {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  return 'Instant could not open the Multiple Counters tape.'
}

const failedOpenTuiCountersHost = (
  cause: Cause.Cause<unknown>,
): FailedOpenTuiCountersHost => ({
  _tag: 'Failed',
  error: describeOpenTuiInstantError(Cause.squash(cause)),
})

/** Starts the OpenTUI Processor on the live Instant Multiple Counters tape. */
export const startOpenTuiCountersHost =
  (): Promise<OpenTuiCountersHostStart> => {
    const scope = Effect.runSync(Scope.make())
    const start = Effect.gen(function* () {
      const tape = yield* resolveCountersTape({
        ...process.env,
        COUNTERS_PROCESSOR_ID: countersProcessorIds.opentui,
      })
      const opened = yield* openCountersTapeRuntime(
        tape,
        instantCountersResources,
      )
      yield* observeRemoteCountersTape(
        tape,
        opened.runtime,
        countersProcessorIds.opentui,
      ).pipe(Effect.forkChild)
      return {
        readModel: () => opened.runtime.readModel(),
        send: opened.sendClientInput,
        subscribe: (listener: (model: Model) => void) =>
          opened.runtime.observeModel(listener),
      }
    }).pipe(Effect.provideService(Scope.Scope, scope))

    return Effect.runPromise(
      Effect.gen(function* () {
        const startExit = yield* Effect.exit(start)
        if (Exit.isFailure(startExit)) {
          yield* Effect.ignore(Scope.close(scope, Exit.void))
          return failedOpenTuiCountersHost(startExit.cause)
        }
        return {
          _tag: 'Ready',
          host: startExit.value,
        }
      }),
    )
  }
