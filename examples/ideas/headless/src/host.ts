import { Console, Duration, Effect } from 'effect'
import { Runtime } from 'foldkit'
import { IdeasProgram, type Model, ideasFromCatalog } from 'ideas-core-example'

import { ideasResources } from './resources.js'

const waitForCatalog = (readModel: () => Model): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let model = readModel()
    if (model.catalog._tag !== 'LoadingCatalog') {
      return model
    }
    yield* Effect.sleep(Duration.millis(250))
    return readModel()
  })

/** Runs a headless Processor and prints the catalog as JSON. */
export const runHeadless = (): Effect.Effect<void> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: IdeasProgram,
          resources: ideasResources(),
        }),
      )
      yield* runtime.initialization
      const model = yield* waitForCatalog(() => runtime.readModel())
      const ideas = ideasFromCatalog(model.catalog)
      yield* Console.log(
        JSON.stringify(
          {
            source: model.source,
            ideas: ideas,
          },
          null,
          2,
        ),
      )
      yield* runtime.shutdown
    }),
  )
