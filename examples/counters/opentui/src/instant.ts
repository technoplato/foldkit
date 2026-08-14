import type { Message, Model } from 'counters-core-example'
import {
  countersProcessorIds,
  instantCountersResources,
  observeRemoteCountersTape,
  openCountersTapeRuntime,
} from 'counters-instant-example'
import { resolveCountersTape } from 'counters-instant-example/node'
import { Effect, Exit, Scope } from 'effect'

/** One Node Instant host used by the OpenTUI Processor. */
export type OpenTuiCountersHost = Readonly<{
  readModel: () => Model
  send: (message: Message) => void
  subscribe: (listener: (model: Model) => void) => () => void
}>

/** Starts the OpenTUI Processor on the live Instant Multiple Counters tape. */
export const startOpenTuiCountersHost =
  (): Promise<OpenTuiCountersHost | null> => {
    const scope = Effect.runSync(Scope.make())
    return Effect.runPromise(
      Effect.gen(function* () {
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
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    ).catch(() => {
      void Effect.runPromise(Scope.close(scope, Exit.void))
      return null
    })
  }
