import {
  ConversationsProgram,
  type Message,
  type Model,
} from 'conversations-core-example'
import { Effect, Exit, Layer, Scope } from 'effect'
import { Runtime } from 'foldkit'

export type ConversationsProcessor = Readonly<{
  readModel: () => Model
  send: (message: Message) => Promise<Model>
  observe: (listener: (model: Model) => void) => () => void
  shutdown: () => Promise<void>
}>

export const startConversationsProcessor =
  (): Promise<ConversationsProcessor> =>
    Effect.runPromise(
      Effect.gen(function* () {
        const scope = yield* Scope.make()
        const runtime = yield* Effect.orDie(
          Runtime.makeProgramRuntime({
            program: ConversationsProgram,
            resources: Layer.empty,
          }).pipe(Effect.provideService(Scope.Scope, scope)),
        )
        yield* runtime.initialization
        return {
          readModel: () => runtime.readModel(),
          send: (message: Message) => Effect.runPromise(runtime.run(message)),
          observe: (listener: (model: Model) => void) =>
            runtime.observeModel(listener),
          shutdown: () => Effect.runPromise(Scope.close(scope, Exit.void)),
        }
      }),
    )
