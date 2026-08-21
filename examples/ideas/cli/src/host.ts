import { Array, Console, Duration, Effect, Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'
import {
  ClickedIdea,
  IdeasProgram,
  type Message,
  type Model,
  ideasFromCatalog,
  visibleIdeas,
} from 'ideas-core-example'

import { ideasResources } from './resources.js'

/** Operations supported by the one-shot Ideas client. */
export const CliOperation = S.Literals(['List', 'Show'])
/** A one-shot Ideas operation. */
export type CliOperation = typeof CliOperation.Type

const waitForCatalog = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let model = runtime.readModel()
    if (model.catalog._tag !== 'LoadingCatalog') {
      return model
    }
    yield* Effect.sleep(Duration.millis(250))
    return runtime.readModel()
  })

/** Runs one CLI operation through the renderer-free runtime. */
export const executeCliOperation = (
  operation: CliOperation,
  maybeSlug: Option.Option<string>,
): Effect.Effect<Model> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: IdeasProgram,
          resources: ideasResources(),
        }),
      )
      yield* runtime.initialization
      let model = yield* waitForCatalog(runtime)
      if (operation === 'Show' && Option.isSome(maybeSlug)) {
        const slug = maybeSlug.value
        const maybeIdea = Array.findFirst(
          ideasFromCatalog(model.catalog),
          idea => idea.slug === slug,
        )
        if (Option.isSome(maybeIdea)) {
          model = yield* runtime.run(
            ClickedIdea.make({ id: maybeIdea.value.id }),
          )
        }
      }
      yield* runtime.shutdown
      return model
    }),
  )

/** Runs one CLI operation and prints notes. */
export const runCliOperation = (
  operation: CliOperation,
  maybeSlug: Option.Option<string>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const model = yield* executeCliOperation(operation, maybeSlug)
    const source =
      model.source === 'Instant'
        ? 'source=Instant'
        : 'source=StaticFallback Instant unreachable or empty'
    yield* Console.log(source)
    if (operation === 'List') {
      for (const idea of visibleIdeas(model)) {
        yield* Console.log(`${idea.slug}	${idea.title}`)
      }
      return
    }
    if (Option.isSome(model.selectedId)) {
      const maybeIdea = Array.findFirst(
        ideasFromCatalog(model.catalog),
        idea => idea.id === model.selectedId.pipe(Option.getOrElse(() => '')),
      )
      if (Option.isSome(maybeIdea)) {
        yield* Console.log(maybeIdea.value.title)
        yield* Console.log(maybeIdea.value.body)
        return
      }
    }
    yield* Console.log('idea not found')
  })
