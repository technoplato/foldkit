import {
  Array,
  Cause,
  Effect,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'
import {
  ClickedJob,
  ClosedJob,
  type Message,
  type Model,
  TranscribeProgram,
  jobsFromCatalog,
  visibleJobs,
} from 'transcribe-core-example'

import { transcribeResources } from './resources.js'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 72

const framed = (content: string): string => {
  const clipped = content.slice(0, SCREEN_INNER_WIDTH)
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - clipped.length)
  return `| ${clipped}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

/** Renders the imported Transcribe Model as a terminal screen. */
export const renderTranscribeScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const jobs = visibleJobs(model)
  const source = model.source === 'Instant' ? 'Instant' : 'StaticFallback'
  const lines = [
    border,
    framed('Knophy transcribe'),
    framed(source),
    framed(''),
  ]
  const numbered = Array.map(jobs, (job, index) =>
    framed(`${index + 1}. ${job.status} ${job.title}`),
  )
  const selected = Option.flatMap(model.selectedId, id =>
    Array.findFirst(
      jobsFromCatalog(model.catalog),
      job => job.id === id || job.videoId === id,
    ),
  )
  const detail = Option.match(selected, {
    onNone: () => [framed('Press 1-9 to open a job. Q quits.')],
    onSome: job => [
      framed(job.title),
      framed(`${job.status} ${job.videoId}`),
      framed(job.analysis.slice(0, SCREEN_INNER_WIDTH - 1)),
      framed('[C] close'),
    ],
  })
  return `${CLEAR_SCREEN}${[...lines, ...numbered, framed(''), ...detail, border].join('\n')}\n`
}

/** Maps a terminal key to an imported Transcribe Message when applicable. */
export const messageForInput = (
  input: string,
  model: Model,
): Option.Option<Message> => {
  const key = input.toLowerCase()
  if (key === 'c') {
    return Option.some(ClosedJob.make({}))
  }
  const asNumber = Number.parseInt(key, 10)
  if (!Number.isInteger(asNumber) || asNumber < 1) {
    return Option.none()
  }
  const jobs = visibleJobs(model)
  const maybeJob = Array.get(jobs, asNumber - 1)
  return Option.map(maybeJob, job => ClickedJob.make({ id: job.id }))
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const key = Option.getOrElse(
        input.input,
        () => input.key.name,
      ).toLowerCase()
      if (key === 'q') {
        return Effect.void
      }
      const maybeMessage = messageForInput(key, runtime.readModel())
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.flatMap(model =>
            terminal.display(renderTranscribeScreen(model)),
          ),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      }
      return runInputLoop(inputQueue, runtime, terminal)
    }),
  )

/** Runs the interactive terminal host over the imported Transcribe program. */
export const runTranscribeTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: TranscribeProgram,
          resources: transcribeResources(),
        }),
      )
      yield* runtime.initialization
      yield* terminal.display(renderTranscribeScreen(runtime.readModel()))
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
