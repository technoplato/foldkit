import {
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openBrowserCountersTape,
  openCountersTapeRuntime,
} from 'counters-instant-example'
import { type MultipleCountersHost } from 'counters-react-bindings-example'
import { Effect, Exit, Scope } from 'effect'

/** Starts the React Processor on the live Instant Multiple Counters tape. */
export const startReactCountersHost = (
  appId: string,
  onHost: (host: MultipleCountersHost) => void,
): (() => void) => {
  const scope = Effect.runSync(Scope.make())
  void Effect.runPromise(
    Effect.gen(function* () {
      const tape = yield* openBrowserCountersTape(
        appId,
        countersProcessorIds.react,
      )
      if (tape === null) {
        return
      }
      const opened = yield* openCountersTapeRuntime(
        tape,
        instantCountersResources,
      )
      onHost({
        isInstantTape: true,
        readModel: () => opened.runtime.readModel(),
        send: opened.sendClientInput,
        subscribe: listener => opened.runtime.observeModel(listener),
      })
      yield* observeRemoteCountersTape(
        tape,
        opened.runtime,
        countersProcessorIds.react,
      ).pipe(Effect.forkChild)
      return yield* Effect.never
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  return () => {
    void Effect.runPromise(Scope.close(scope, Exit.void))
  }
}
