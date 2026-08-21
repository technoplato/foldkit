import {
  type ArchiveStatus,
  ArchiverProgram,
  ClickedArchive,
  type Message,
  type Model,
  SubmittedArchiveUrl,
  UpdatedUrlDraft,
} from 'archiver-core-example'
import { Console, Data, Effect, Layer, Match as M } from 'effect'
import { Runtime } from 'foldkit'

export class ArchiverCliError extends Data.TaggedError('ArchiverCliError')<{
  readonly reason: string
}> {}

/** The imported Archiver state transition performed by a one-shot operation. */
export type ArchiverCliExecution = Readonly<{
  initialModel: Model
  messages: ReadonlyArray<Message>
  finalModel: Model
}>

export const messageForToken = (
  token: string,
): Effect.Effect<Message, ArchiverCliError> => {
  const normalized = token.trim()
  if (normalized === 'submit') {
    return Effect.succeed(SubmittedArchiveUrl())
  }
  if (normalized.startsWith('url:')) {
    return Effect.succeed(
      UpdatedUrlDraft({ value: normalized.slice('url:'.length) }),
    )
  }
  if (normalized.startsWith('open:')) {
    return Effect.succeed(
      ClickedArchive({ id: normalized.slice('open:'.length) }),
    )
  }
  return Effect.fail(
    new ArchiverCliError({
      reason: `Unknown archiver token "${token}"`,
    }),
  )
}

const runMessages = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
  initialModel: Model,
  messages: ReadonlyArray<Message>,
): Effect.Effect<Model> =>
  Effect.gen(function* () {
    let nextModel = initialModel
    for (const message of messages) {
      nextModel = yield* runtime.run(message)
    }
    return nextModel
  })

/** Runs one CLI token sequence through the renderer-free runtime without printing. */
export const executeArchiverInput = (
  tokens: ReadonlyArray<string>,
): Effect.Effect<ArchiverCliExecution, ArchiverCliError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: ArchiverProgram,
          resources: Layer.empty,
        }),
      )
      const initialModel = yield* runtime.initialization
      const messages = yield* Effect.forEach(tokens, messageForToken)
      const finalModel = yield* runMessages(runtime, initialModel, messages)
      yield* runtime.shutdown
      return { initialModel, messages, finalModel }
    }),
  )

const statusLabel = (status: ArchiveStatus): string =>
  M.value(status).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      QueuedArchive: () => 'Queued',
      ReadyArchive: () => 'Ready',
      FailedArchive: () => 'Failed',
    }),
  )

/** Prints the current archive shelf. */
export const describeArchives = (model: Model): string => {
  if (model.archives.length === 0) {
    return 'No archives.'
  }
  return model.archives
    .map(archive => `${statusLabel(archive.status)}  ${archive.title}`)
    .join('\n')
}

const formatModel = (model: Model): string =>
  `Model({ urlDraft: ${JSON.stringify(model.urlDraft)}, archives: ${model.archives.length} })`

const formatMessage = (message: Message): string =>
  M.value(message).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      UpdatedUrlDraft: ({ value }) => `UpdatedUrlDraft(${value})`,
      SubmittedArchiveUrl: () => 'SubmittedArchiveUrl()',
      ClickedArchive: ({ id }) => `ClickedArchive(${id})`,
    }),
  )

const printExecution = (
  execution: ArchiverCliExecution,
  isVerbose: boolean,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (isVerbose) {
      yield* Console.log(
        `Initial Model: ${formatModel(execution.initialModel)}`,
      )
      for (const message of execution.messages) {
        yield* Console.log(`Message: ${formatMessage(message)}`)
      }
      yield* Console.log(`Final Model: ${formatModel(execution.finalModel)}`)
    }
    yield* Console.log(describeArchives(execution.finalModel))
  })

/** Lists the current archives without sending a Message. */
export const runArchiverList = (
  isVerbose: boolean,
): Effect.Effect<void, ArchiverCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeArchiverInput([])
    yield* printExecution(execution, isVerbose)
  })

/** Pastes a URL into the draft and submits it for ingest. */
export const runArchiverArchive = (
  url: string,
  isVerbose: boolean,
): Effect.Effect<void, ArchiverCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeArchiverInput([`url:${url}`, 'submit'])
    yield* printExecution(execution, isVerbose)
  })

/** Opens one archive by id. */
export const runArchiverOpen = (
  id: string,
  isVerbose: boolean,
): Effect.Effect<void, ArchiverCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeArchiverInput([`open:${id}`])
    yield* printExecution(execution, isVerbose)
  })

/** Applies an ordered token sequence through the imported Program. */
export const runArchiverInput = (
  tokens: ReadonlyArray<string>,
  isVerbose: boolean,
): Effect.Effect<void, ArchiverCliError> =>
  Effect.gen(function* () {
    const execution = yield* executeArchiverInput(tokens)
    yield* printExecution(execution, isVerbose)
  })
