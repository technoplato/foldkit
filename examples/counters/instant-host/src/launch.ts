import { type Message, type Model } from 'counters-core-example'
import { Data, Effect, Exit, Scope } from 'effect'

import {
  instantCountersResources,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
} from './attach.js'
import { openBrowserCountersTape } from './browser.js'
import { type CountersTape } from './makeTape.js'

/** Instant could not start a Multiple Counters Host. */
export class CountersInstantHostError extends Data.TaggedError(
  'CountersInstantHostError',
)<Readonly<{ message: string }>> {}

/** A long-lived Multiple Counters host used by browser and native Clients. */
export type CountersBrowserHost = Readonly<{
  readModel: () => Model
  send: (message: Message) => Promise<void>
  stop: () => Promise<void>
  subscribe: (listener: (model: Model) => void) => () => void
}>

const launchFromTape = (
  tape: CountersTape,
  processorId: string,
  scope: Scope.Scope,
) =>
  Effect.gen(function* () {
    const opened = yield* openCountersTapeRuntime(
      tape,
      instantCountersResources,
    )
    yield* observeRemoteCountersTape(tape, opened.runtime, processorId).pipe(
      Effect.forkChild,
    )
    return {
      readModel: () => opened.runtime.readModel(),
      send: opened.sendClientInput,
      stop: () => Effect.runPromise(Scope.close(scope, Exit.void)),
      subscribe: (listener: (model: Model) => void) =>
        opened.runtime.observeModel(listener),
    }
  })

/** Starts Instant tape for one Multiple Counters Processor. Missing Instant fails. */
export const launchBrowserCountersHost = (
  processorId: string,
  appId: string | undefined,
): Promise<CountersBrowserHost> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      if (appId === undefined || appId === '') {
        return yield* new CountersInstantHostError({
          message:
            'Instant app id is missing. The Host will not open a local tape.',
        })
      }
      const tape = yield* openBrowserCountersTape(appId, processorId)
      return yield* launchFromTape(tape, processorId, scope)
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}
