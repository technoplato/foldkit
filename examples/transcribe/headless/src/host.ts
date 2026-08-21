import { Console, Duration, Effect } from 'effect'
import { Runtime } from 'foldkit'
import {
  type Model,
  TranscribeProgram,
  jobsFromCatalog,
} from 'transcribe-core-example'

import { transcribeResources } from './resources.js'

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
          program: TranscribeProgram,
          resources: transcribeResources(),
        }),
      )
      yield* runtime.initialization
      const model = yield* waitForCatalog(() => runtime.readModel())
      const jobs = jobsFromCatalog(model.catalog)
      yield* Console.log(
        JSON.stringify(
          {
            source: model.source,
            jobs,
          },
          null,
          2,
        ),
      )
      yield* runtime.shutdown
    }),
  )
