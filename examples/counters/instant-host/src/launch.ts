import {
  type Message,
  type Model,
  StaticCounterFactClient,
} from 'counters-core-example'
import { Effect, Exit, Scope } from 'effect'

import { makeInMemoryProgramStore } from '@foldkit/instant'

import {
  instantCountersResources,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
} from './attach.js'
import { openBrowserCountersTape } from './browser.js'
import { type CountersTape, makeCountersTape } from './makeTape.js'

/** A long-lived Multiple Counters host used by browser and native Clients. */
export type CountersBrowserHost = Readonly<{
  readModel: () => Model
  send: (message: Message) => void
  stop: () => Promise<void>
  subscribe: (listener: (model: Model) => void) => () => void
}>

const launchFromTape = (
  tape: CountersTape,
  processorId: string,
  isInstant: boolean,
  scope: Scope.Scope,
) =>
  Effect.gen(function* () {
    const opened = yield* openCountersTapeRuntime(
      tape,
      isInstant ? instantCountersResources : StaticCounterFactClient,
    )
    if (isInstant) {
      yield* observeRemoteCountersTape(tape, opened.runtime, processorId).pipe(
        Effect.forkChild,
      )
    }
    return {
      readModel: () => opened.runtime.readModel(),
      send: opened.sendClientInput,
      stop: () => Effect.runPromise(Scope.close(scope, Exit.void)),
      subscribe: (listener: (model: Model) => void) =>
        opened.runtime.observeModel(listener),
    }
  })

/** Starts memory or Instant tape for one Multiple Counters Processor. */
export const launchBrowserCountersHost = (
  processorId: string,
  appId: string | undefined,
): Promise<CountersBrowserHost> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      if (appId !== undefined && appId !== '') {
        const tape = yield* openBrowserCountersTape(appId, processorId)
        if (tape !== null) {
          return yield* launchFromTape(tape, processorId, true, scope)
        }
      }
      const store = yield* makeInMemoryProgramStore()
      const tape = yield* makeCountersTape(store, processorId, 'local-counters')
      return yield* launchFromTape(tape, processorId, false, scope)
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}
