import {
  ClickedJob,
  TranscribeProgram,
  type Message,
  type Model,
  jobsFromCatalog,
  visibleJobs,
} from "transcribe-core-example"
import { Array, Console, Duration, Effect, Option, Schema as S } from "effect"
import { Runtime } from "foldkit"

import { transcribeResources } from "./resources.js"

/** Operations supported by the one-shot Transcribe client. */
export const CliOperation = S.Literals(["List", "Show"])
/** A one-shot Transcribe operation. */
export type CliOperation = typeof CliOperation.Type

const waitForCatalog = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let model = runtime.readModel()
    if (model.catalog._tag !== "LoadingCatalog") {
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
          program: TranscribeProgram,
          resources: transcribeResources(),
        }),
      )
      yield* runtime.initialization
      let model = yield* waitForCatalog(runtime)
      if (operation === "Show" && Option.isSome(maybeSlug)) {
        const slug = maybeSlug.value
        const maybeJob = Array.findFirst(
          jobsFromCatalog(model.catalog),
          job => job.slug === slug || job.videoId === slug,
        )
        if (Option.isSome(maybeJob)) {
          model = yield* runtime.run(ClickedJob.make({ id: maybeJob.value.id }))
        }
      }
      yield* runtime.shutdown
      return model
    }),
  )

/** Runs one CLI operation and prints jobs. */
export const runCliOperation = (
  operation: CliOperation,
  maybeSlug: Option.Option<string>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const model = yield* executeCliOperation(operation, maybeSlug)
    const source =
      model.source === "Instant"
        ? "source=Instant"
        : "source=StaticFallback Instant unreachable or empty"
    yield* Console.log(source)
    if (operation === "List") {
      for (const job of visibleJobs(model)) {
        yield* Console.log(`${job.videoId}\t${job.status}\t${job.title}`)
      }
      return
    }
    if (Option.isSome(model.selectedId)) {
      const maybeJob = Array.findFirst(
        jobsFromCatalog(model.catalog),
        job => job.id === model.selectedId.pipe(Option.getOrElse(() => "")),
      )
      if (Option.isSome(maybeJob)) {
        yield* Console.log(maybeJob.value.title)
        yield* Console.log(maybeJob.value.status)
        yield* Console.log(maybeJob.value.analysis)
        if (maybeJob.value.transcriptText.length > 0) {
          yield* Console.log(maybeJob.value.transcriptText)
        }
        return
      }
    }
    yield* Console.log("job not found")
  })
